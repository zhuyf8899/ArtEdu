import assert from "node:assert/strict";
import test from "node:test";
import { supportsCreationMethod } from "../src/creation-capabilities.js";
import { buildCreationParameters, creationMethod, normalizePageCount } from "../src/creationMethods.js";
import { readFile } from "node:fs/promises";

test("document generation requires explicit document capability, not just chat", () => {
  assert.equal(supportsCreationMethod({ capabilities: ["chat"] }, "document"), false);
  assert.equal(supportsCreationMethod({ capabilities: ["chat", "document"] }, "document"), true);
  assert.equal(supportsCreationMethod(undefined, "document"), false);
  assert.equal(supportsCreationMethod({ capabilities: "document" }, "document"), false);
});

test("PPT 页数传入请求且 PDF 不携带课件页数", () => {
  assert.equal(buildCreationParameters({ methodId: "slides", pageCount: "3" }).pageCount, 3);
  assert.equal(buildCreationParameters({ methodId: "pdf", pageCount: "3" }).pageCount, undefined);
  assert.equal(creationMethod("pdf").outputFormat, "pdf");
  assert.equal(normalizePageCount("99"), "");
});

test("创作页绑定继续创作表单，历史回复保留文件入口", async () => {
  const source = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  assert.ok(source.includes('<form className="ai-composer" onSubmit={send}>'));
  assert.ok(source.includes("artifact: result?.artifact ?? null"));
});
