import assert from "node:assert/strict";
import test from "node:test";
import { ModelRegistry, readModelProviderConfigs } from "./model-registry";

const providers = JSON.stringify([{ id: "school", baseUrl: "https://model.example.edu/v1", model: "chat-v1", capabilities: ["chat"], apiKeyEnv: "SCHOOL_KEY" }]);

test("生产环境拒绝非 HTTPS 或带凭据的模型地址", () => {
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.throws(() => readModelProviderConfigs(providers.replace("https://", "http://")), /必须使用无凭据 HTTPS/);
    assert.throws(() => readModelProviderConfigs(providers.replace("https://model", "https://user:secret@model")), /必须使用无凭据 HTTPS/);
    assert.equal(readModelProviderConfigs(providers)[0]?.id, "school");
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
});

test("仅向首页暴露已配置密钥的模型", () => {
  const originalProviders = process.env.MODEL_PROVIDERS_JSON;
  const originalKey = process.env.SCHOOL_KEY;
  try {
    process.env.MODEL_PROVIDERS_JSON = providers;
    delete process.env.SCHOOL_KEY;
    assert.deepEqual(new ModelRegistry().listConfigured(), []);

    process.env.SCHOOL_KEY = "configured-for-test";
    assert.equal(new ModelRegistry().listConfigured()[0]?.id, "school");
  } finally {
    if (originalProviders === undefined) delete process.env.MODEL_PROVIDERS_JSON;
    else process.env.MODEL_PROVIDERS_JSON = originalProviders;
    if (originalKey === undefined) delete process.env.SCHOOL_KEY;
    else process.env.SCHOOL_KEY = originalKey;
  }
});
