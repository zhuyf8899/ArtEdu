import assert from "node:assert/strict";

// Explicit opt-in: this smoke test consumes four real model requests and persists their jobs.
// Restricted to local development so fixed demo credentials never go to an arbitrary host.
const origin = new URL(process.env.ARTEDU_TEST_ORIGIN || "http://localhost:4173");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Use a loopback test origin");
assert.ok(["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password);
assert.equal(process.env.ARTEDU_LIVE_CHAT_TEST, "true", "Set ARTEDU_LIVE_CHAT_TEST=true to allow four real requests");
const expectedModel = "model-deepseek-v4-flash";

async function request(path, { cookie, body, expected = 200 } = {}) {
  const response = await fetch(new URL(`/api/${path}`, origin), {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: origin.origin, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error", signal: AbortSignal.timeout(90000),
  });
  assert.equal(response.status, expected, `${path}: unexpected HTTP status`);
  return response;
}

await request("portal/home", { expected: 401 });
await request("generation-jobs/run", { body: { jobType: "image", prompt: "auth check", modelConfigId: expectedModel }, expected: 401 });
for (const role of ["student", "teacher", "operator", "admin"]) {
  const username = `${role}.demo`;
  let cookie;
  try {
    const login = await request("auth/login", { body: { username, password: "123456" }, expected: 201 });
    cookie = login.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
    assert.ok(cookie, "Login must return a session cookie");
    const actor = await login.json();
    assert.equal(actor.username, username);
    assert.ok(actor.roles.includes(role));
    const home = await (await request("portal/home", { cookie })).json();
    assert.equal(home.creation.enabled, true);
    assert.ok(home.creation.models.some((model) => model.id === expectedModel));
    assert.ok(!/sk-[a-zA-Z0-9]{20,}/.test(JSON.stringify(home)), "Home must not expose credentials");
    const result = await (await request("generation-jobs/run", {
      cookie, expected: 201,
      body: { jobType: "image", modelConfigId: expectedModel, prompt: "请用一个简短标题和两条列表，给出艺术课程卡片的设计建议，60字以内。", parameters: {} },
    })).json();
    assert.equal(result.job.status, "succeeded");
    assert.equal(result.output.kind, "text");
    assert.ok(result.output.content.trim());
    assert.equal(result.output.metadata.providerId, expectedModel);
    assert.ok(result.output.metadata.totalTokens > 0);
    assert.ok(!/sk-[a-zA-Z0-9]{20,}/.test(JSON.stringify(result)), "Reply must not expose credentials");
    const persisted = await (await request(`generation-jobs/${encodeURIComponent(result.job.id)}`, { cookie })).json();
    assert.equal(persisted.status, "succeeded");
    console.log(`${username}: login, model visibility, real reply and persisted success PASS`);
  } finally {
    if (cookie) await request("auth/logout", { cookie, body: {}, expected: 201 });
  }
}
console.log("Anonymous requests rejected; all four demo accounts verified. No secrets or session cookies logged.");
