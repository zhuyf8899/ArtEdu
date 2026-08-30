import assert from "node:assert/strict";
import test from "node:test";
import { getEnvironment } from "./environment";
import { AuthService } from "../modules/auth/auth.service";
import { courseInputSchema, resourceInputSchema, toolInputSchema, workInputSchema } from "../modules/content/content.contracts";

const environmentKeys = ["NODE_ENV", "HOST", "CORS_ORIGIN", "ENABLE_DEVELOPMENT_AUTH", "MODEL_EXECUTION_ENABLED", "DEV_ADMIN_USER_ID"] as const;

function withEnvironment(values: Partial<Record<(typeof environmentKeys)[number], string>>, callback: () => void) {
  const original = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of environmentKeys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    callback();
  } finally {
    for (const key of environmentKeys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("生产环境拒绝开发身份认证和缺失的 CORS 白名单", () => {
  withEnvironment({ NODE_ENV: "production", ENABLE_DEVELOPMENT_AUTH: "true", CORS_ORIGIN: "https://art.example.edu", HOST: "127.0.0.1" }, () => {
    assert.throws(getEnvironment, /生产环境禁止开启/);
  });
  withEnvironment({ NODE_ENV: "production", ENABLE_DEVELOPMENT_AUTH: "false", CORS_ORIGIN: "", HOST: "127.0.0.1" }, () => {
    assert.throws(getEnvironment, /必须配置至少一个 CORS_ORIGIN/);
  });
});

test("开发身份认证只能监听本机回环地址", () => {
  withEnvironment({ NODE_ENV: "development", ENABLE_DEVELOPMENT_AUTH: "true", HOST: "0.0.0.0", CORS_ORIGIN: "http://localhost:4173" }, () => {
    assert.throws(getEnvironment, /本机回环地址/);
  });
});

test("开发身份认证不提供默认管理员回退", () => {
  withEnvironment({ NODE_ENV: "development", ENABLE_DEVELOPMENT_AUTH: "true", HOST: "127.0.0.1", CORS_ORIGIN: "http://localhost:4173", DEV_ADMIN_USER_ID: "user-admin-demo" }, () => {
    const service = new AuthService({} as never) as unknown as { getDevelopmentUserId: (request: unknown) => string | undefined };
    assert.equal(service.getDevelopmentUserId({ headers: {} }), undefined);
  });
});

test("拒绝路径穿越、控制字符和不安全链接", () => {
  assert.equal(courseInputSchema.safeParse({ title: "课程", coverAssetKey: "../private/file" }).success, false);
  assert.equal(resourceInputSchema.safeParse({ title: "资源", resourceType: "pdf", storageKey: "media\\secret.pdf" }).success, false);
  assert.equal(workInputSchema.safeParse({ title: "作品", assets: [{ fileName: "a/b.png", mimeType: "image/png", storageKey: "works/a.png" }] }).success, false);
  assert.equal(toolInputSchema.safeParse({ name: "工具", toolType: "external", entryUrl: "javascript:alert(1)" }).success, false);
});
