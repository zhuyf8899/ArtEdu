import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CoursesService } from "./courses.service";

const COURSE_ID = "course-qa";
const RESOURCE_ID = "course-resource-qa";
const STORAGE_KEY = `admin/courses/${COURSE_ID}/11111111-1111-1111-1111-111111111111-22222222-2222-2222-2222-222222222222`;

/** 用最小替身覆盖 openResource 需要的查询，只验证权限与审计，不接触真实数据库。 */
function buildService(overrides: Record<string, unknown> = {}) {
  const audits: unknown[][] = [];
  const row = {
    id: RESOURCE_ID,
    course_id: COURSE_ID,
    title: "第 3 讲 设计规范",
    resource_type: "ppt",
    storage_key: STORAGE_KEY,
    file_name: "guideline.pptx",
    mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    file_size: 1024,
    status: "published",
    course_status: "published",
    created_by: "teacher-a",
    enrolled: true,
    ...overrides,
  };
  const database = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("FROM course_resources r JOIN courses c")) return { rows: [row] };
      if (sql.includes("INSERT INTO course_resource_access_events")) { audits.push(values); return { rows: [] }; }
      return { rows: [] };
    },
    transaction: async (run: (client: unknown) => unknown) => run({ query: async () => ({ rows: [] }) }),
  };
  return { service: new CoursesService(database as never, {} as never, {} as never), audits };
}

test("课件访问：已选课学生可预览与下载，未选课被拒，且按类型记录审计", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artedu-material-access-"));
  const previousRoot = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = root;
  try {
    await mkdir(path.join(root, "admin", "courses", COURSE_ID), { recursive: true });
    await writeFile(path.join(root, ...STORAGE_KEY.split("/")), Buffer.from("PK\x03\x04fake-pptx"));
    const student = { id: "student-a", roles: ["student"] } as never;

    const preview = buildService();
    const resource = await preview.service.openResource(student, COURSE_ID, RESOURCE_ID, "preview");
    assert.equal(resource.resourceType, "ppt");
    assert.equal(preview.audits[0][3], "preview");

    const download = buildService();
    await download.service.openResource(student, COURSE_ID, RESOURCE_ID, "download");
    assert.equal(download.audits[0][3], "download");

    // 视频单独记 stream，历史统计口径不变。
    const video = buildService({ resource_type: "video", mime_type: "video/mp4", file_name: "lesson.mp4" });
    await video.service.openResource(student, COURSE_ID, RESOURCE_ID, "preview");
    assert.equal(video.audits[0][3], "stream");

    // 网页课件与视频只开放预览：学生拿到下载地址也会被拒，课程创建教师不受限制。
    const teacher = { id: "teacher-a", roles: ["teacher"] } as never;
    for (const restricted of [
      { resource_type: "video", mime_type: "video/mp4", file_name: "lesson.mp4" },
      { resource_type: "web", mime_type: "text/html", file_name: "index.html" },
    ]) {
      const blocked = buildService(restricted);
      await blocked.service.openResource(student, COURSE_ID, RESOURCE_ID, "preview");
      await assert.rejects(blocked.service.openResource(student, COURSE_ID, RESOURCE_ID, "download"), /只提供在线预览/);
      await blocked.service.openResource(teacher, COURSE_ID, RESOURCE_ID, "download");
    }

    // CSS/JS 源码无法在页面上单独渲染，属于可下载的一类。
    const stylesheet = buildService({ resource_type: "web", mime_type: "text/css", file_name: "theme.css" });
    await stylesheet.service.openResource(student, COURSE_ID, RESOURCE_ID, "download");
    assert.equal(stylesheet.audits[0][3], "download");

    // 未加入课程：预览与下载都拒绝。
    const notEnrolled = buildService({ enrolled: false });
    await assert.rejects(notEnrolled.service.openResource(student, COURSE_ID, RESOURCE_ID, "preview"), /请先加入课程/);
    await assert.rejects(notEnrolled.service.openResource(student, COURSE_ID, RESOURCE_ID, "download"), /请先加入课程/);

    // 课程创建教师即使没选课也能拿到原件。
    await notEnrolled.service.openResource(teacher, COURSE_ID, RESOURCE_ID, "download");

    // 存储键必须落在本课程目录下，否则视为记录无效。
    const broken = buildService({ storage_key: "admin/courses/other-course/33333333-3333-3333-3333-333333333333-44444444-4444-4444-4444-444444444444" });
    await assert.rejects(broken.service.openResource(student, COURSE_ID, RESOURCE_ID, "preview"), /存储记录无效/);
  } finally {
    if (previousRoot === undefined) delete process.env.UPLOAD_ROOT; else process.env.UPLOAD_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});
