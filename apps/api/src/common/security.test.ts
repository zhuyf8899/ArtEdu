import assert from "node:assert/strict";
import test from "node:test";
import { getEnvironment } from "./environment";
import { AuthService } from "../modules/auth/auth.service";
import { createCourseSchema } from "../modules/courses/courses.contracts";

const environmentKeys = ["NODE_ENV", "HOST", "CORS_ORIGIN", "ENABLE_LOCAL_AUTH", "LOCAL_SESSION_IDLE_HOURS", "MODEL_EXECUTION_ENABLED", "DEV_ADMIN_USER_ID"] as const;
function withEnvironment(values: Partial<Record<(typeof environmentKeys)[number], string>>, callback: () => void) {
  const original = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of environmentKeys) values[key] === undefined ? delete process.env[key] : process.env[key] = values[key];
    callback();
  } finally {
    for (const key of environmentKeys) original[key] === undefined ? delete process.env[key] : process.env[key] = original[key];
  }
}

test("生产环境要求受限 HTTPS CORS 白名单", () => {
  withEnvironment({ NODE_ENV: "production", CORS_ORIGIN: "", HOST: "127.0.0.1" }, () => assert.throws(getEnvironment, /必须配置至少一个 CORS_ORIGIN/));
  withEnvironment({ NODE_ENV: "production", CORS_ORIGIN: "https://admin:password@art.example.edu", HOST: "127.0.0.1" }, () => assert.throws(getEnvironment, /必须是无凭据/));
  withEnvironment({ NODE_ENV: "production", CORS_ORIGIN: "http://art.example.edu", HOST: "127.0.0.1" }, () => assert.throws(getEnvironment, /必须使用 HTTPS/));
  withEnvironment({ NODE_ENV: "production", CORS_ORIGIN: "https://art.example.edu", ENABLE_LOCAL_AUTH: "true" }, () => assert.throws(getEnvironment, /禁止启用本地账号登录/));
});

test("不再接受可伪造的开发身份头", async () => {
  const service = new AuthService({} as never);
  await assert.rejects(service.getActor({ headers: { "x-user-id": "user-admin-demo" } } as never), /缺少有效登录会话/);
});

test("课程封面拒绝路径穿越", () => {
  assert.equal(createCourseSchema.safeParse({ title: "安全课程", category: "设计", coverAssetKey: "../private/file", lessons: [] }).success, false);
});
