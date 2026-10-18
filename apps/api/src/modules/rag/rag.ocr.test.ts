import assert from "node:assert/strict";
import test from "node:test";
import { chunkPageText, needsOcr } from "./rag.worker";

test("扫描件判定：文字层几乎没字才走 OCR，正常 PDF 不额外花时间", () => {
  // 扫描件：整本抽出来只有换页符
  assert.equal(needsOcr("\f\f\f"), true);
  // 只有页码/装饰字的伪文字层：208 页只抽到 3 个字符
  assert.equal(needsOcr("\f".repeat(207) + "3"), true);
  // 每页 29 个字符仍判为扫描件，30 个以上按正常 PDF 处理
  assert.equal(needsOcr("字".repeat(29)), true);
  assert.equal(needsOcr("字".repeat(30)), false);
  // 正常文字层：一页几百字
  assert.equal(needsOcr("平面设计中的网格系统".repeat(50)), false);
  // 空字符串按扫描件处理（pdftotext 失败时也要进 OCR）
  assert.equal(needsOcr(""), true);
});

test("OCR 出来的单页文本沿用同一套切块规则，页码不会被抹掉", () => {
  const page = "网格系统是平面设计的基础。".repeat(200); // 2600 字
  const chunks = chunkPageText(page, 37);
  assert.ok(chunks.length >= 3, `单页长文本应切成多块，实际 ${chunks.length}`);
  for (const chunk of chunks) {
    assert.equal(chunk.pageNumber, 37, "每一块都要带上 OCR 的页码，否则引用无法回溯");
    assert.ok(chunk.content.length >= 20 && chunk.content.length <= 900);
  }
  // 太短的噪声（页眉、水印）不进入索引
  assert.deepEqual(chunkPageText("第 37 页", 37), []);
});
