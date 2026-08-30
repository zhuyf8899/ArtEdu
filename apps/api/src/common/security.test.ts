import assert from "node:assert/strict";
import test from "node:test";
import { getEnvironment } from "./environment";
import { AuthService } from "../modules/auth/auth.service";
import { createCourseSchema } from "../modules/courses/courses.contracts";

const environmentKeys = ["NODE_ENV", "HOST", "CORS_ORIGIN", "ENABLE_DEVELOPMENT_AUTH", "MODEL_EXECUTION_ENABLED", "DEV_ADMIN_USER_ID"] as const;
function withEnvironment(values: Partial<Record<(typeof environmentKeys)[number], string>>, callback: () => void) {
  const original = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of environmentKeys) values[key] === undefined ? delete process.env[key] : process.env[key] = values[key];
    callback();
  } finally {
    for (const key of environmentKeys) original[key] === undefined ? delete process.env[key] : process.env[key] = original[key];
  }
}

test("生产环境拒绝开发认证并要求 CORS 白名单", () => {
  withEnvironment({ NODE_ENV: "production", ENABLE_DEVELOPMENT_AUTH: "true", CORS_ORIGIN: "https://art.example.edu", HOST: "127.0.0.1" }, () => assert.throws(getEnvironment, /生产环境禁止开启/));
  withEnvironment({ NODE_ENV: "production", ENABLE_DEVELOPMENT_AUTH: "false", CORS_ORIGIN: "", HOST: "127.0.0.1" }, () => assert.throws(getEnvironment, /必须配置至少一个 CORS_ORIGIN/));
  withEnvironment({ NODE_ENV: "production", ENABLE_DEVELOPMENT_AUTH: "false", CORS_ORIGIN: "https://admin:password@art.example.edu", HOST: "127.0.0.1" }, () => assert.throws(getEnvironment, /必须是无凭据/));
});

test("开发认证仅允许回环地址并且没有默认管理员身份", () => {
  withEnvironment({ NODE_ENV: "development", ENABLE_DEVELOPMENT_AUTH: "true", HOST: "0.0.0.0", CORS_ORIGIN: "http://localhost:4173" }, () => assert.throws(getEnvironment, /本机回环地址/));
  withEnvironment({ NODE_ENV: "development", ENABLE_DEVELOPMENT_AUTH: "true", HOST: "127.0.0.1", CORS_ORIGIN: "http://localhost:4173", DEV_ADMIN_USER_ID: "user-admin-demo" }, () => {
    const service = new AuthService({} as never) as unknown as { getDevelopmentUserId: (request: unknown) => string | undefined };
    assert.equal(service.getDevelopmentUserId({ headers: {} }), undefined);
  });
});

test("课程封面拒绝路径穿越", () => {
  assert.equal(createCourseSchema.safeParse({ title: "安全课程", category: "设计", coverAssetKey: "../private/file", lessons: [] }).success, false);
});
