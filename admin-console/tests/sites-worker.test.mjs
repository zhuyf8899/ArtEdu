import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
  assert.match(response.headers.get("Content-Security-Policy"), /default-src 'self'/);
  assert.equal(response.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not emit HSTS for local HTTP development", async () => {
  const response = await worker.fetch(new Request("http://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async () => new Response("asset", { status: 200 }),
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Strict-Transport-Security"), null);
});

test("returns a clear unavailable response for preview API requests", async () => {
  let calls = 0;
  const response = await worker.fetch(new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }), {
    ASSETS: { fetch: async () => { calls += 1; return new Response("missing", { status: 404 }); } },
  });

  assert.equal(response.status, 503);
  assert.equal(calls, 0);
  assert.match((await response.json()).message, /未连接 API 服务/);
});

test("does not turn missing write requests into the app shell", async () => {
  let calls = 0;
  const response = await worker.fetch(new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => { calls += 1; return new Response("missing", { status: 404 }); } },
  });

  assert.equal(response.status, 404);
  assert.equal(calls, 1);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
