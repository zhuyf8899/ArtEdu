import assert from "node:assert/strict";
import test from "node:test";
import { coverImageFor, titleCoverDataUrl } from "../src/coverImages.js";

test("未上传封面时按标题生成白底黑字的指定尺寸图片", () => {
  const source = coverImageFor({ title: "纹样设计 <入门>" }, 480, 270);
  assert.ok(source.startsWith("data:image/svg+xml"));
  const svg = decodeURIComponent(source.split(",", 2)[1]);
  assert.match(svg, /width="480" height="270"/);
  assert.match(svg, /fill="#fff"/);
  assert.match(svg, /fill="#111"/);
  assert.match(svg, /纹样设计 &lt;入门&gt;/);
  assert.equal(coverImageFor({ title: "课件", coverImageUrl: "/api/cover" }), "/api/cover");
  assert.equal(coverImageFor({ title: "课件", coverUrl: "https://example.com/cover.jpg" }), "https://example.com/cover.jpg");
  assert.notEqual(titleCoverDataUrl("课程甲"), titleCoverDataUrl("课程乙"));
});
