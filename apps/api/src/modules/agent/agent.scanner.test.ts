import assert from "node:assert/strict";
import test from "node:test";
import { scanText } from "./agent.scanner";

test("关键词扫描以脱敏摘要记录普通和高风险命中", () => {
  const matches = scanText("请勿暴露 secret-token 或 internal-code", ["internal-code"], ["secret-token"]);
  assert.deepEqual(matches.map((match) => [match.severity, match.keyword]), [["high", "secret-token"], ["warning", "internal-code"]]);
  assert.doesNotMatch(matches[0].excerpt, /secret-token/);
});
