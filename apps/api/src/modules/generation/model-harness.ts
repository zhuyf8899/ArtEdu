import "dotenv/config";
import assert from "node:assert/strict";
import { readModelProviderConfigs } from "./model-registry";
import type { ModelAdapter, ModelRequest } from "./model-adapter";

class FakeAdapter implements ModelAdapter {
  readonly id = "harness-fake";
  readonly capabilities = ["chat", "image", "video", "webpage", "pattern", "document", "knowledge_graph"] as const;

  async execute(request: ModelRequest) {
    return { kind: request.jobType === "chat" ? "text" as const : "json" as const, content: `harness-ok:${request.jobType}:${request.messages?.[1]?.content ?? request.prompt}` };
  }
}

async function main() {
  const configs = readModelProviderConfigs();
  assert.ok(Array.isArray(configs), "环境变量解析结果必须是数组");
  const adapter = new FakeAdapter();
  for (const jobType of adapter.capabilities) {
    const result = await adapter.execute({ jobType, messages: [{ role: "system", content: "system" }, { role: "user", content: "harness test" }], parameters: { temperature: 0.2, topP: 0.9, maxTokens: 128, seed: 7, responseFormat: "text", metadata: { harness: "true" } } });
    assert.match(result.content, new RegExp(`^harness-ok:${jobType}:`));
  }
  console.log(JSON.stringify({ ok: true, configuredProviders: configs.map(({ id, model, capabilities }) => ({ id, model, capabilities })), fakeCapabilities: adapter.capabilities }, null, 2));
}

void main();
