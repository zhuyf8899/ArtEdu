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
  { id: "model-deepseek-v4-flash", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", capabilities: ["chat", "vision", "webpage", "document"], apiKeyEnv: "DEEPSEEK_API_KEY", timeoutMs: 60000 },
  { id: "model-modelscope-qwen-image", baseUrl: "https://api-inference.modelscope.cn", model: "Qwen/Qwen-Image", capabilities: ["image", "pattern"], apiKeyEnv: "MODELSCOPE_API", timeoutMs: 120000, protocol: "modelscope-image", internal: true },
]);

// 曾经的问题：默认能力是"生图"，任何提问都被内置图像通道接走。
test("问答路由到文本模型，图像/图案路由到内置图像通道", () => {
  const originalProviders = process.env.MODEL_PROVIDERS_JSON;
  try {
    process.env.MODEL_PROVIDERS_JSON = deployedProviders;
    const registry = new ModelRegistry();
    assert.equal(registry.getForJob({ jobType: "chat" }).id, "model-deepseek-v4-flash");
    assert.equal(registry.getForJob({ jobType: "chat" }).capabilities.includes("vision"), true);
    assert.equal(registry.getForJob({ jobType: "document" }).id, "model-deepseek-v4-flash");
    assert.equal(registry.getForJob({ jobType: "image" }).id, "model-modelscope-qwen-image");
    assert.equal(registry.getForJob({ jobType: "pattern" }).id, "model-modelscope-qwen-image");
  } finally {
    if (originalProviders === undefined) delete process.env.MODEL_PROVIDERS_JSON;
    else process.env.MODEL_PROVIDERS_JSON = originalProviders;
  }
});

// ── 备用 key（apiKeyFallbackEnv）──────────────────────────────────────────
// 场景：主 key 是学校/老师那把，备用 key 是自费的平替。
// 期望：主 key 能用就一直用主 key；主 key 失效/欠费才自动切备用 key。
const fallbackProviders = JSON.stringify([
  { id: "model-with-backup", baseUrl: "https://model.example.edu/v1", model: "chat-v1", capabilities: ["chat", "vision"], apiKeyEnv: "PRIMARY_KEY", apiKeyFallbackEnv: "BACKUP_KEY", timeoutMs: 5000 },
]);

const okBody = { choices: [{ finish_reason: "stop", message: { content: "pong" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** 造一个 SSE 响应：把给定分片一次性喂进 body，模拟 chat/completions 的流式返回。 */
function sseResponse(chunks: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** 用 JSON.stringify 拼 SSE 帧，避免手写转义出错。 */
const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

/** 起一个临时环境：设好 provider 与两把 key，并记录每次调用实际使用的 key。 */
async function withKeyChain(
  keys: { primary?: string; backup?: string },
  respond: (call: number) => Response,
  run: (usedKeys: string[]) => Promise<void>,
) {
  const saved = {
    providers: process.env.MODEL_PROVIDERS_JSON,
    primary: process.env.PRIMARY_KEY,
    backup: process.env.BACKUP_KEY,
    fetch: globalThis.fetch,
  };
  const usedKeys: string[] = [];
  try {
    process.env.MODEL_PROVIDERS_JSON = fallbackProviders;
    if (keys.primary === undefined) delete process.env.PRIMARY_KEY;
    else process.env.PRIMARY_KEY = keys.primary;
    if (keys.backup === undefined) delete process.env.BACKUP_KEY;
    else process.env.BACKUP_KEY = keys.backup;
    globalThis.fetch = (async (_input: unknown, init?: { headers?: Record<string, string> }) => {
      usedKeys.push(String(init?.headers?.authorization ?? "").replace(/^Bearer /, ""));
      return respond(usedKeys.length);
    }) as typeof fetch;
    await run(usedKeys);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.providers === undefined) delete process.env.MODEL_PROVIDERS_JSON;
    else process.env.MODEL_PROVIDERS_JSON = saved.providers;
    if (saved.primary === undefined) delete process.env.PRIMARY_KEY;
    else process.env.PRIMARY_KEY = saved.primary;
    if (saved.backup === undefined) delete process.env.BACKUP_KEY;
    else process.env.BACKUP_KEY = saved.backup;
  }
}

const runChat = () => new ModelRegistry().getForJob({ jobType: "chat" }).execute({ jobType: "chat", prompt: "ping" });

test("主 key 正常时不触碰备用 key", async () => {
  await withKeyChain({ primary: "primary-key", backup: "backup-key" }, () => jsonResponse(okBody), async (used) => {
    assert.equal((await runChat()).content, "pong");
    assert.deepEqual(used, ["primary-key"]);
  });
});

test("视觉图片编码为 OpenAI-compatible 的 user image_url 分段", async () => {
  await withKeyChain({ primary: "primary-key" }, () => jsonResponse(okBody), async () => {
    const savedFetch = globalThis.fetch;
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
      body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      return jsonResponse(okBody);
    }) as typeof fetch;
    try {
      await new ModelRegistry().getForJob({ jobType: "chat" }).execute({
        jobType: "chat",
        messages: [{ role: "user", content: "识别这张图", images: [{ dataUrl: "data:image/png;base64,aGVsbG8=", detail: "high" }] }],
      });
      const message = (body?.messages as Array<{ content: unknown }>)[0];
      assert.deepEqual(message.content, [
        { type: "text", text: "识别这张图" },
        { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=", detail: "high" } },
      ]);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});

test("主 key 欠费（402）时自动切备用 key 并成功", async () => {
  await withKeyChain({ primary: "primary-key", backup: "backup-key" },
    (call) => (call === 1 ? jsonResponse({ error: { message: "Insufficient Balance" } }, 402) : jsonResponse(okBody)),
    async (used) => {
      assert.equal((await runChat()).content, "pong");
      assert.deepEqual(used, ["primary-key", "backup-key"]);
    });
});

test("主 key 无效（401）时自动切备用 key", async () => {
  await withKeyChain({ primary: "revoked-key", backup: "backup-key" },
    (call) => (call === 1 ? jsonResponse({ error: { message: "Authentication Fails" } }, 401) : jsonResponse(okBody)),
    async (used) => {
      assert.equal((await runChat()).content, "pong");
      assert.deepEqual(used, ["revoked-key", "backup-key"]);
    });
});

test("主 key 未配置时直接走备用 key，不再报\"未配置环境变量\"", async () => {
  await withKeyChain({ backup: "backup-key" }, () => jsonResponse(okBody), async (used) => {
    assert.equal((await runChat()).content, "pong");
    assert.deepEqual(used, ["backup-key"]);
    assert.deepEqual(new ModelRegistry().listConfigured().map((m) => m.id), ["model-with-backup"]);
  });
});

test("两把 key 都没有时才从首页列表隐藏并报未配置", async () => {
  await withKeyChain({}, () => jsonResponse(okBody), async () => {
    assert.deepEqual(new ModelRegistry().listConfigured(), []);
    await assert.rejects(runChat(), /未配置环境变量 PRIMARY_KEY \/ BACKUP_KEY/);
  });
});

test("服务端故障（500）不误切备用 key，只调用一次", async () => {
  await withKeyChain({ primary: "primary-key", backup: "backup-key" }, () => jsonResponse({ error: "boom" }, 500), async (used) => {
    await assert.rejects(runChat(), /HTTP 500/);
    assert.deepEqual(used, ["primary-key"]);
  });
});

// ── 流式（executeStream）────────────────────────────────────────────────
const streamChat = (onDelta: (delta: { content: string }) => void) =>
  new ModelRegistry().getForJob({ jobType: "chat" }).executeStream!({ jobType: "chat", prompt: "ping" }, onDelta);

test("流式：正文增量实时回调，最终结果与非流式同构", async () => {
  const chunks = [
    frame({ choices: [{ delta: { content: "你" } }] }),
    frame({ choices: [{ delta: { content: "好" } }] }),
    frame({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }),
    "data: [DONE]\n\n",
  ];
  await withKeyChain({ primary: "primary-key" }, () => sseResponse(chunks), async (used) => {
    const deltas: string[] = [];
    const result = await streamChat((delta) => deltas.push(delta.content));
    assert.deepEqual(deltas, ["你", "好"]);
    assert.equal(result.content, "你好");
    assert.equal(result.finishReason, "stop");
    assert.equal(result.metadata?.totalTokens, 5);
    assert.deepEqual(used, ["primary-key"]);
  });
});

test("流式：tool_calls 分片按 index 拼回完整调用", async () => {
  const chunks = [
    frame({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "search_web", arguments: '{"qu' } }] } }] }),
    frame({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ery":"梵高"}' } }] } }] }),
    "data: [DONE]\n\n",
  ];
  await withKeyChain({ primary: "primary-key" }, () => sseResponse(chunks), async () => {
    const result = await streamChat(() => {});
    assert.equal(result.toolCalls?.length, 1);
    assert.equal(result.toolCalls?.[0]?.id, "call_1");
    assert.equal(result.toolCalls?.[0]?.function.name, "search_web");
    assert.equal(result.toolCalls?.[0]?.function.arguments, '{"query":"梵高"}');
  });
});

test("流式：主 key 建连就被拒（402）仍能切备用 key——校验发生在任何增量之前", async () => {
  await withKeyChain({ primary: "primary-key", backup: "backup-key" },
    (call) => (call === 1 ? jsonResponse({ error: { message: "Insufficient Balance" } }, 402) : sseResponse([frame({ choices: [{ delta: { content: "好" } }] })])),
    async (used) => {
      const deltas: string[] = [];
      const result = await streamChat((delta) => deltas.push(delta.content));
      assert.equal(result.content, "好");
      assert.deepEqual(deltas, ["好"]);
      assert.deepEqual(used, ["primary-key", "backup-key"]);
    });
});

test("流式：噪声帧（非 JSON / 心跳）不中断整轮生成", async () => {
  const chunks = [
    ": keep-alive\n\n",
    "data: not-json\n\n",
    frame({ choices: [{ delta: { content: "好" } }] }),
    "data: [DONE]\n\n",
  ];
  await withKeyChain({ primary: "primary-key" }, () => sseResponse(chunks), async () => {
    const result = await streamChat(() => {});
    assert.equal(result.content, "好");
  });
});
