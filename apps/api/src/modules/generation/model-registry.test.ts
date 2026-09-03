import assert from "node:assert/strict";
import test from "node:test";
import { readModelProviderConfigs } from "./model-registry";

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
