import assert from "node:assert/strict";
import test from "node:test";
import { ModelScopeImageAdapter } from "./modelscope-image.adapter";

test("ModelScope image request sends the negative prompt separately", async () => {
  const originalFetch = globalThis.fetch;
  let payload: Record<string, unknown> | undefined;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ task_id: "test-task" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const adapter = new ModelScopeImageAdapter({ baseUrl: "https://api-inference.modelscope.cn/", model: "Qwen/Qwen-Image", timeoutMs: 30000 } as any);
    const taskId = await (adapter as any).submit("test-key", "青绿色纹样海报", "1024x1024", "水印、模糊");
    assert.equal(taskId, "test-task");
    assert.deepEqual(payload, { model: "Qwen/Qwen-Image", prompt: "青绿色纹样海报", size: "1024x1024", negative_prompt: "水印、模糊" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
