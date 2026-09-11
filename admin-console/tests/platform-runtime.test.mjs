// 回归护栏：本校部署是明文 HTTP 的 IP 地址，属于"不安全上下文"，
// 那里 crypto.randomUUID 是 undefined，直接调用会抛 TypeError，
// 且调用方多在 try/catch 里 —— 表现成"点了按钮完全没反应"，极难排查。
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { randomId, shortId } from "../src/randomId.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("安全上下文下使用原生 randomUUID", () => {
  assert.match(randomId(), UUID_V4);
});

test("不安全上下文（无 crypto.randomUUID）下仍能生成合法 UUID", () => {
  // 用自有属性遮蔽原型方法，模拟明文 HTTP 里的 Crypto 对象。
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const first = randomId();
    const second = randomId();
    assert.match(first, UUID_V4, "必须仍是合法 UUID（版本位 4、变体位 8/9/a/b）");
    assert.match(second, UUID_V4);
    assert.notEqual(first, second, "两次调用不能相同");
    assert.match(shortId("workflow"), /^workflow-[0-9a-f]{8}$/);
  } finally {
    delete crypto.randomUUID;
  }
  assert.equal(typeof crypto.randomUUID, "function", "测试后必须还原原型方法");
});

// 只看真实代码：注释里提到这个 API 不算违规（修复说明本身就写在注释里）。
// 去掉块注释与行注释后，再检查是否还有调用。
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("前端源码不再直接调用 crypto.randomUUID（只能经由 randomId 模块）", async () => {
  const sourceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!/\.(js|jsx)$/.test(entry.name)) continue;
      if (entry.name === "randomId.js") continue;
      const code = stripComments(await readFile(full, "utf8"));
      if (code.includes("crypto.randomUUID")) offenders.push(path.relative(sourceRoot, full));
    }
  };
  await walk(sourceRoot);
  assert.deepEqual(offenders, [], `这些文件在明文 HTTP 下会抛错，请改用 randomId()：${offenders.join(", ")}`);
});
