import assert from "node:assert/strict";
import test from "node:test";
import { downloadGeneratedImage, imageRequest, ImageTransportError, withImageApiKeys } from "./image-transport";

const endpoint = "https://image.example.test/v1/images/generations";
const json = () => new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
const readJson = (response: Response) => response.json();
const networkError = (code: string) => new TypeError("fetch failed with a private signed URL", { cause: { code } });

async function withFetch(fetcher: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("提交前连接失败自动重试，最多三次", async () => {
  let calls = 0;
  await withFetch(async () => { if (++calls < 3) throw networkError("UND_ERR_CONNECT_TIMEOUT"); return json(); }, async () => {
    assert.deepEqual(await imageRequest(endpoint, { method: "POST" }, { stage: "submit", timeoutMs: 1000, retryBaseMs: 0 }, readJson), { ok: true });
    assert.equal(calls, 3);
  });
});

for (const status of [400, 401, 402, 403, 500, 502, 503, 504]) {
  test(`生图提交 HTTP ${status} 不盲目重发`, async () => {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response(null, { status }); }, async () => {
      await assert.rejects(imageRequest(endpoint, { method: "POST" }, { stage: "submit", timeoutMs: 1000, retryBaseMs: 0 }, readJson), error => error instanceof ImageTransportError && error.status === status && error.attempts === 1);
      assert.equal(calls, 1);
    });
  });
}

test("提交后连接断开不能确认是否扣费，不重复提交", async () => {
  let calls = 0;
  await withFetch(async () => { calls++; throw networkError("ECONNRESET"); }, async () => {
    await assert.rejects(imageRequest(endpoint, { method: "POST" }, { stage: "submit", timeoutMs: 1000, retryBaseMs: 0 }, readJson), error => error instanceof ImageTransportError && error.code === "ECONNRESET");
    assert.equal(calls, 1);
  });
});

test("限流可重试，但 Retry-After 超出等待预算时不提前重发", async () => {
  let calls = 0;
  await withFetch(async () => ++calls === 1 ? new Response(null, { status: 429, headers: { "retry-after": "0" } }) : json(), async () => {
    await imageRequest(endpoint, { method: "POST" }, { stage: "submit", timeoutMs: 1000, retryBaseMs: 0 }, readJson);
    assert.equal(calls, 2);
  });
  calls = 0;
  await withFetch(async () => { calls++; return new Response(null, { status: 429, headers: { "retry-after": "60" } }); }, async () => {
    await assert.rejects(imageRequest(endpoint, { method: "POST" }, { stage: "submit", timeoutMs: 1000, retryBaseMs: 0 }, readJson));
    assert.equal(calls, 1);
  });
});

test("下载读取中断和临时 HTTP 错误恢复，不重新生图", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++;
    if (calls === 1) return new Response(new ReadableStream({ start(controller) { controller.error(networkError("UND_ERR_SOCKET")); } }));
    if (calls === 2) return new Response(null, { status: 503 });
    return new Response("image-bytes");
  }, async () => {
    const bytes = await imageRequest(endpoint, {}, { stage: "download", timeoutMs: 1000, retryBaseMs: 0 }, async response => Buffer.from(await response.arrayBuffer()));
    assert.equal(bytes.toString(), "image-bytes");
    assert.equal(calls, 3);
  });
});

test("轮询同一个任务可以恢复短暂网络失败", async () => {
  const urls: string[] = [];
  await withFetch(async url => { urls.push(String(url)); if (urls.length === 1) throw networkError("ECONNRESET"); return json(); }, async () => {
    await imageRequest("https://image.example.test/tasks/task-1", {}, { stage: "poll", timeoutMs: 1000, retryBaseMs: 0 }, readJson);
    assert.deepEqual(urls, ["https://image.example.test/tasks/task-1", "https://image.example.test/tasks/task-1"]);
  });
});

test("失败保留阶段、次数与原因码，不暴露签名地址", async () => {
  let calls = 0;
  await withFetch(async () => { calls++; throw networkError("ECONNRESET"); }, async () => {
    await assert.rejects(imageRequest(endpoint, {}, { stage: "download", timeoutMs: 1000, retryBaseMs: 0 }, readJson), error => {
      assert.ok(error instanceof ImageTransportError);
      assert.equal(error.attempts, 3);
      assert.equal(error.stage, "download");
      assert.equal(error.code, "ECONNRESET");
      assert.ok(!error.message.includes("signed URL"));
      return true;
    });
    assert.equal(calls, 3);
  });
});

test("存在用户信号时仍执行服务端超时，不重复提交", async () => {
  const controller = new AbortController();
  let calls = 0;
  await withFetch(async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout was not enforced")), 300);
      init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal?.reason); }, { once: true });
    });
  }, async () => {
    await assert.rejects(imageRequest(endpoint, { method: "POST" }, { stage: "submit", timeoutMs: 15, signal: controller.signal }, readJson), error => error instanceof ImageTransportError && error.code === "TIMEOUT");
    assert.equal(calls, 1);
    assert.equal(controller.signal.aborted, false);
  });
});

test("用户在重试等待中取消立即停止", async () => {
  const controller = new AbortController();
  let calls = 0;
  await withFetch(async () => { calls++; throw networkError("ECONNRESET"); }, async () => {
    const timer = setTimeout(() => controller.abort(), 10);
    try { await assert.rejects(imageRequest(endpoint, {}, { stage: "download", timeoutMs: 1000, signal: controller.signal }, readJson), error => error instanceof Error && error.name === "AbortError"); }
    finally { clearTimeout(timer); }
    assert.equal(calls, 1);
  });
});

test("只有鉴权或余额拒绝才换备用密钥，网络异常不换", async () => {
  const used: string[] = [];
  assert.equal(await withImageApiKeys(["primary", "backup"], async key => {
    used.push(key);
    if (key === "primary") throw new ImageTransportError("submit", 1, "HTTP_402", 402);
    return "ok";
  }), "ok");
  assert.deepEqual(used, ["primary", "backup"]);
  used.length = 0;
  await assert.rejects(withImageApiKeys(["primary", "backup"], async key => { used.push(key); throw new ImageTransportError("submit", 1, "ECONNRESET"); }));
  assert.deepEqual(used, ["primary"]);
});

test("空图片自动重试下载，不允许非 HTTPS 地址", async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return new Response(calls === 1 ? "" : "image", { headers: { "content-type": "image/png" } }); }, async () => {
    assert.equal((await downloadGeneratedImage("https://images.example.test/result.png", 3000)).bytes.toString(), "image");
    assert.equal(calls, 2);
    await assert.rejects(downloadGeneratedImage("http://localhost/private", 1000), /不安全/);
    assert.equal(calls, 2);
  });
});
