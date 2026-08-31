import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AuthService } from "./auth.service";

test("本地登录按 IP、账号与组合限制连续失败", async () => {
  const previous = process.env.ENABLE_LOCAL_AUTH;
  process.env.ENABLE_LOCAL_AUTH = "true";
  try {
    const service = new AuthService({ query: async () => ({ rows: [] }) } as never);
    const username = `missing-${randomUUID().slice(0, 8)}`;
    const input = { username, password: "correct-length-password" };
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(service.loginLocal(input, ip), /用户名或密码错误/);
    }
    await assert.rejects(service.loginLocal(input, ip), (error: { getStatus?: () => number }) => error.getStatus?.() === 429);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_LOCAL_AUTH;
    else process.env.ENABLE_LOCAL_AUTH = previous;
  }
});
