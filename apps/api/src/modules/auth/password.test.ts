import assert from "node:assert/strict";
import test from "node:test";
import { hashLocalPassword, verifyLocalPassword } from "./password";

test("本地密码使用带随机盐的 scrypt，并拒绝错误或篡改的摘要", async () => {
  const password = "correct-horse-battery-staple";
  const hash = await hashLocalPassword(password);
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyLocalPassword(password, hash), true);
  assert.equal(await verifyLocalPassword("wrong-password", hash), false);
  assert.equal(await verifyLocalPassword(password, `${hash}tampered`), false);
});
