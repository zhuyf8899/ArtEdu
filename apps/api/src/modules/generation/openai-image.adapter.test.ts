import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { getEnvironment } from "../../common/environment";
import { OpenAIImageAdapter } from "./openai-image.adapter";
import { ModelScopeImageAdapter } from "./modelscope-image.adapter";
import type { ModelProviderConfig } from "./model-adapter";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6l8AAAAASUVORK5CYII=", "base64");

for (const protocol of ["openai-image", "siliconflow-image", "modelscope-image"] as const) {
  test(`${protocol} 下载临时失败恢复，生成只提交一次`, async () => {
    const saved = { fetch: globalThis.fetch, key: process.env.IMAGE_TRANSPORT_TEST_KEY };
    let submissions = 0;
    let downloads = 0;
    let polls = 0;
    let storageKey: string | undefined;
    try {
      process.env.IMAGE_TRANSPORT_TEST_KEY = "test-only";
      globalThis.fetch = async (url, init) => {
        if (init?.method === "POST") {
          submissions++;
          return Response.json(protocol === "modelscope-image" ? { task_id: "existing-task" }
            : protocol === "siliconflow-image" ? { images: [{ url: "https://images.example.test/result.png" }] }
              : { data: [{ url: "https://images.example.test/result.png" }] });
        }
        if (String(url).includes("/tasks/")) {
          polls++;
          assert.ok(String(url).endsWith("/existing-task"));
          if (polls === 1) return new Response(null, { status: 503 });
          return Response.json({ task_status: "SUCCEED", output_images: ["https://images.example.test/result.png"] });
        }
        downloads++;
        if (downloads === 1) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
        return new Response(png, { headers: { "content-type": "image/png" } });
      };
      const config: ModelProviderConfig = { id: "test-image", baseUrl: "https://api.example.test/v1", model: "test", capabilities: ["image"], apiKeyEnv: "IMAGE_TRANSPORT_TEST_KEY", timeoutMs: 5000, protocol };
      const adapter = protocol === "modelscope-image" ? new ModelScopeImageAdapter(config) : new OpenAIImageAdapter(config);
      const output = await adapter.execute({ jobType: "image", prompt: "A flower", jobId: `retry-test-${protocol}` });
      storageKey = output.content;
      assert.deepEqual(await readFile(path.resolve(getEnvironment().uploadRoot, storageKey)), png);
      assert.equal(submissions, 1);
      assert.equal(downloads, 2);
      if (protocol === "modelscope-image") assert.equal(polls, 2);
    } finally {
      globalThis.fetch = saved.fetch;
      if (saved.key === undefined) delete process.env.IMAGE_TRANSPORT_TEST_KEY;
      else process.env.IMAGE_TRANSPORT_TEST_KEY = saved.key;
      if (storageKey) await rm(path.resolve(getEnvironment().uploadRoot, storageKey), { force: true });
    }
  });
}

test("图片主密钥鉴权拒绝后自动使用备用密钥", async () => {
  const saved = { fetch: globalThis.fetch, primary: process.env.IMAGE_PRIMARY_TEST_KEY, backup: process.env.IMAGE_BACKUP_TEST_KEY };
  let storageKey: string | undefined;
  const used: string[] = [];
  try {
    process.env.IMAGE_PRIMARY_TEST_KEY = "primary";
    process.env.IMAGE_BACKUP_TEST_KEY = "backup";
    globalThis.fetch = async (_url, init) => {
      const authorization = new Headers(init?.headers).get("authorization")!;
      used.push(authorization);
      return authorization === "Bearer primary" ? new Response(null, { status: 401 }) : Response.json({ data: [{ b64_json: png.toString("base64") }] });
    };
    const adapter = new OpenAIImageAdapter({ id: "test", baseUrl: "https://api.example.test/v1", model: "test", capabilities: ["image"], protocol: "openai-image", apiKeyEnv: "IMAGE_PRIMARY_TEST_KEY", apiKeyFallbackEnv: "IMAGE_BACKUP_TEST_KEY", timeoutMs: 1000 });
    storageKey = (await adapter.execute({ jobType: "image", prompt: "A flower" })).content;
    assert.deepEqual(used, ["Bearer primary", "Bearer backup"]);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.primary === undefined) delete process.env.IMAGE_PRIMARY_TEST_KEY;
    else process.env.IMAGE_PRIMARY_TEST_KEY = saved.primary;
    if (saved.backup === undefined) delete process.env.IMAGE_BACKUP_TEST_KEY;
    else process.env.IMAGE_BACKUP_TEST_KEY = saved.backup;
    if (storageKey) await rm(path.resolve(getEnvironment().uploadRoot, storageKey), { force: true });
  }
});
