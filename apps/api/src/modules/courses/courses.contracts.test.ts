import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { createCourseSchema, updateCourseResourceMetadataSchema, uploadCourseResourceMetadataSchema } from "./courses.contracts";

test("课程契约接收可编辑的简介、难度、封面、推荐状态与多课时", () => {
  const course = createCourseSchema.parse({
    title: "纹样研究", category: "视觉传达", summary: "从传统纹样开始", difficulty: "advanced",
    coverUrl: "https://example.com/cover.jpg", coverAssetKey: "courses/cover.jpg", isFeatured: true,
    lessons: [
      { title: "观察", summary: "观察纹样结构", lessonType: "lesson", estimatedMinutes: 45 },
      { title: "实践", summary: "设计新图案", lessonType: "practice", estimatedMinutes: 90 },
    ],
  });
  assert.equal(course.isFeatured, true);
  assert.equal(course.lessons[1].estimatedMinutes, 90);
  assert.equal(course.coverUrl, "https://example.com/cover.jpg");
});

test("资料元数据校验标题、标签、封面链接与所属课时", () => {
  const metadata = uploadCourseResourceMetadataSchema.parse({
    title: "第 1 课讲义", summary: "图案分析", tags: ["纹样", "基础"],
    coverUrl: "https://example.com/lesson.jpg", lessonId: "lesson-a",
  });
  assert.equal(metadata.lessonId, "lesson-a");
  assert.deepEqual(metadata.tags, ["纹样", "基础"]);
  assert.equal(uploadCourseResourceMetadataSchema.safeParse({ ...metadata, coverUrl: "javascript:alert(1)" }).success, false);
  assert.equal(uploadCourseResourceMetadataSchema.safeParse({ ...metadata, tags: Array(21).fill("标签") }).success, false);
  assert.equal(updateCourseResourceMetadataSchema.safeParse({}).success, false);
  assert.equal(updateCourseResourceMetadataSchema.safeParse({ lessonId: null }).success, true);
});

test("上传请求可在文件前读取资料元数据", async () => {
  const app = Fastify();
  await app.register(multipart, { limits: { files: 1, fields: 1, parts: 2, fileSize: 1024 } });
  app.post("/upload", async (request) => {
    const file = await request.file();
    assert.ok(file);
    const metadata = file.fields.metadata;
    assert.ok(metadata && !Array.isArray(metadata) && metadata.type === "field");
    const parsed = uploadCourseResourceMetadataSchema.parse(JSON.parse(String(metadata.value)));
    await file.toBuffer();
    return { title: parsed.title, fileName: file.filename };
  });
  try {
    const boundary = "artedu-test-boundary";
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n` +
      '{"title":"自定义讲义","summary":"","tags":[]}\r\n' +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="source.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\r\n--${boundary}--\r\n`,
    );
    const response = await app.inject({ method: "POST", url: "/upload", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { title: "自定义讲义", fileName: "source.pdf" });
  } finally { await app.close(); }
});
