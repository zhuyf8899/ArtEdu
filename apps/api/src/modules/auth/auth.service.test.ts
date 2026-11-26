import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { localLoginSchema, localPasswordSchema } from "./auth.contracts";
import { AuthService } from "./auth.service";
import { hashLocalPassword } from "./password";

test("普通账号的登录与初始密码设置均以八个字符为下限", () => {
  for (const [password, valid] of [
    ["Q7v*Wg9", false],
    ["Q7v*Wg9f", true],
    ["长密码也适用八字", true],
    ["😀😀😀😀", false],
    ["Q7v*Wg9f-longer", true],
    ["a".repeat(129), false],
  ] as const) {
    assert.equal(localPasswordSchema.safeParse(password).success, valid);
    assert.equal(localLoginSchema.safeParse({ username: "teacher-01", password }).success, valid);
  }
  assert.equal(localLoginSchema.safeParse({ username: "teacher.demo", password: "123456" }).success, true);
  assert.equal(localLoginSchema.safeParse({ username: "teacher-01", password: "123456" }).success, false);
  assert.equal(localPasswordSchema.safeParse("123456").success, false);
});

test("八字符密码可以走完普通教师的哈希校验和登录", async () => {
  const previous = process.env.ENABLE_LOCAL_AUTH;
  process.env.ENABLE_LOCAL_AUTH = "true";
  try {
    const username = "teacher-test-" + randomUUID();
    const password = "Q7v*Wg9f";
    const password_hash = await hashLocalPassword(password);
    const user = { id: randomUUID(), username, display_name: "验收教师", status: "active", roles: ["teacher"], password_hash };
    const db = {
      query: async () => ({ rows: [user] }),
      transaction: async (callback: (client: { query: () => Promise<void> }) => Promise<void>) =>
        callback({ query: async () => undefined }),
    };
    const auth = new AuthService(db as never);
    const credentials = localLoginSchema.parse({ username, password });
    const result = await auth.loginLocal(credentials, "198.51.100.250");
    assert.equal(result.actor.id, user.id);
    assert.deepEqual(result.actor.roles, ["teacher"]);
    assert.ok(result.token);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_LOCAL_AUTH;
    else process.env.ENABLE_LOCAL_AUTH = previous;
  }
});

test("同一账号再次登录保留已有会话，退出仅清除当前会话", async () => {
  const previous = process.env.ENABLE_LOCAL_AUTH;
  process.env.ENABLE_LOCAL_AUTH = "true";
  try {
    const username = "teacher-test-" + randomUUID();
    const password = "Q7v*Wg9f";
    const user = { id: randomUUID(), username, display_name: "验收教师", status: "active", roles: ["teacher"], password_hash: await hashLocalPassword(password) };
    const sessions = new Set<string>();
    const query = async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM user_identities")) return { rows: [user] };
      if (sql.includes("DELETE FROM auth_sessions") && sql.includes("user_id")) throw new Error("登录清除了其他设备的会话");
      if (sql.includes("INSERT INTO auth_sessions")) sessions.add(params[2] as string);
      if (sql.includes("DELETE FROM auth_sessions WHERE token_hash")) sessions.delete(params[0] as string);
      return { rows: [] };
    };
    const service = new AuthService({ query, transaction: async (callback: (client: { query: typeof query }) => Promise<void>) => callback({ query }) } as never);
    const input = localLoginSchema.parse({ username, password });
    const first = await service.loginLocal(input, "198.51.100.1");
    const second = await service.loginLocal(input, "198.51.100.2");
    assert.equal(sessions.size, 2);
    await service.logout({ headers: { cookie: `artedu_session=${second.token}` } } as never);
    assert.equal(sessions.size, 1);
    assert.ok(first.token !== second.token);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_LOCAL_AUTH;
    else process.env.ENABLE_LOCAL_AUTH = previous;
  }
});

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
