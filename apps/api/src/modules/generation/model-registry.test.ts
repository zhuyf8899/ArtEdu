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

// 与生产部署同构：文本模型 + 内部图像通道，顺序也与线上一致。
const deployedProviders = JSON.stringify([
  { id: "model-deepseek-v4-flash", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", capabilities: ["chat", "webpage", "document"], apiKeyEnv: "DEEPSEEK_API_KEY", timeoutMs: 60000 },
  { id: "model-modelscope-qwen-image", baseUrl: "https://api-inference.modelscope.cn", model: "Qwen/Qwen-Image", capabilities: ["image", "pattern"], apiKeyEnv: "MODELSCOPE_API", timeoutMs: 120000, protocol: "modelscope-image", internal: true },
]);

// 曾经的问题：默认能力是"生图"，任何提问都被内置图像通道接走。
test("问答路由到文本模型，图像/图案路由到内置图像通道", () => {
  const originalProviders = process.env.MODEL_PROVIDERS_JSON;
  try {
    process.env.MODEL_PROVIDERS_JSON = deployedProviders;
    const registry = new ModelRegistry();
    assert.equal(registry.getForJob({ jobType: "chat" }).id, "model-deepseek-v4-flash");
    assert.equal(registry.getForJob({ jobType: "document" }).id, "model-deepseek-v4-flash");
    assert.equal(registry.getForJob({ jobType: "image" }).id, "model-modelscope-qwen-image");
    assert.equal(registry.getForJob({ jobType: "pattern" }).id, "model-modelscope-qwen-image");
  } finally {
    if (originalProviders === undefined) delete process.env.MODEL_PROVIDERS_JSON;
    else process.env.MODEL_PROVIDERS_JSON = originalProviders;
  }
});
