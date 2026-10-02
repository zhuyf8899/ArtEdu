import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { decorateCourse } from "../src/coursePresentation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("搜索页与 AI 讲堂使用同一课程作者、方法和工具信息", () => {
  const course = decorateCourse({ id: "course-ai-design-foundation", title: "AI 辅助设计思维与方法", creatorName: "测试教师" });
  assert.equal(course.method, "UI 创作");
  assert.equal(course.author, "测试教师");
  assert.deepEqual(course.tools, ["GPT-4o", "Figma"]);
});

test("搜索页沿用平台模块名称，并渲染课程封面及案例图片", async () => {
  const source = await readFile(path.join(root, "admin-console/src/SearchResults.jsx"), "utf8");
  assert.match(source, /\["course", "AI 讲堂"\]/);
  assert.match(source, /\["workflow", "设计工具"\]/);
  assert.match(source, /coverImageFor\(item, 220, 230\)/);
  assert.match(source, /item\.previewUrl/);
  assert.match(source, /<img src=\{visual\}/);
  assert.match(source, /titleCoverDataUrl\(item\.title, 220, 230\)/);
});

test("搜索 API 提供与讲堂和社区一致的封面 URL", async () => {
  const source = await readFile(path.join(root, "apps/api/src/modules/portal/portal.service.ts"), "utf8");
  assert.match(source, /c\.cover_url, c\.cover_asset_key, c\.cover_mime_type/);
  assert.match(source, /FROM work_assets cover WHERE cover\.work_id = work\.id/);
  assert.match(source, /AS preview_url/);
  assert.match(source, /coverImageUrl: type === "course"/);
  assert.match(source, /previewUrl: type === "work"/);
});
