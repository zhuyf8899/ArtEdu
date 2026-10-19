import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.env.ARTEDU_LIVE_IMAGE_TEST, "true", "Set ARTEDU_LIVE_IMAGE_TEST=true to allow real image and Agent model requests");
const origin = new URL(process.env.ARTEDU_TEST_ORIGIN || "http://localhost:4173");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Use a loopback test origin");
assert.ok(["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password);
const requestOrigin = process.env.ARTEDU_TEST_REQUEST_ORIGIN || origin.origin;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "apps/api/data/image-qa");
const checks = [];

async function request(url, { cookie, body, expected = 200 } = {}) {
  const response = await fetch(new URL(url, origin), {
    method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(720000),
    headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status !== expected) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`${url}: HTTP ${response.status}; ${payload.message || "request failed"}`);
  }
  return response;
}

async function login(role) {
  const username = process.env[`ARTEDU_TEST_${role.toUpperCase()}_USERNAME`] || `${role}.demo`;
  const password = process.env[`ARTEDU_TEST_${role.toUpperCase()}_PASSWORD`] || "123456";
  const response = await request("/api/auth/login", { body: { username, password }, expected: 201 });
  const cookie = response.headers.getSetCookie().map(header => header.split(";")[0]).join("; ");
  assert.ok(cookie, "Login must return a session cookie");
  return cookie;
}

async function checkImage(artifact, cookie, label) {
  assert.match(artifact.mimeType, /^image\/(png|jpeg|webp|gif|avif)$/);
  assert.match(artifact.downloadUrl, /^\/api\/(?!\/)/);
  const response = await request(artifact.downloadUrl, { cookie });
  assert.equal(response.headers.get("content-type"), artifact.mimeType);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, artifact.fileSize);
  assert.ok(bytes.length > 0);
  if (artifact.mimeType === "image/png") assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  await request(artifact.downloadUrl, { expected: 401 });
  await mkdir(destination, { recursive: true });
  const extension = path.extname(artifact.fileName);
  await writeFile(path.join(destination, `${label}${extension}`), bytes);
  checks.push({ check: label, bytes: bytes.length, mimeType: artifact.mimeType, sha256: createHash("sha256").update(bytes).digest("hex") });
  return bytes;
}

let studentCookie;
let operatorCookie;
try {
  await request("/api/generation-jobs/run", { body: { jobType: "image", prompt: "auth check" }, expected: 401 });
  studentCookie = await login("student");
  const home = await (await request("/api/portal/home", { cookie: studentCookie })).json();
  assert.equal(home.creation.enabled, true);
  const textModel = home.creation.models.find(model => model.capabilities.includes("chat"));
  assert.ok(textModel, "Agent needs a configured chat model");
  const direct = await (await request("/api/generation-jobs/run", {
    cookie: studentCookie, expected: 201,
    body: { jobType: "image", modelConfigId: textModel.id, prompt: "A blue flower on cream paper, watercolor illustration.", parameters: { size: "1024x1024", imageCount: 1 } },
  })).json();
  assert.equal(direct.job.status, "succeeded");
  assert.equal(direct.output.kind, "asset");
  assert.notEqual(direct.output.metadata.providerId, textModel.id, "Image requests must automatically use the image provider even when a text model is selected");
  checks.push({ check: "text-model-selection-routes-to-image-provider", passed: true });
  await checkImage(direct.artifact, studentCookie, "direct-image");
  const persistedJob = await (await request(`/api/generation-jobs/${encodeURIComponent(direct.job.id)}`, { cookie: studentCookie })).json();
  assert.equal(persistedJob.status, "succeeded");
  operatorCookie = await login("operator");
  await request(direct.artifact.downloadUrl, { cookie: operatorCookie, expected: 403 });
  checks.push({ check: "private-download-ownership", passed: true });

  const workspacePath = `image-qa/${Date.now()}/window.png`;
  const run = await (await request("/api/agent-runs", {
    cookie: studentCookie, expected: 201,
    body: { scenario: "chat", prompt: `请调用生图工具，仅生成一张图片：宋代深褐色木质花窗，透过窗格可见青灰海浪，米黄宣纸质感。请用 generate_image 的 workspacePath 参数将同一张图片保存到工作区 ${workspacePath}，然后提供图片链接。不要生成网页、SVG或文字方案，也不要重复生图。`, parameters: {} },
  })).json();
  const completed = await (await request(`/api/agent-runs/${encodeURIComponent(run.id)}/execute`, {
    cookie: studentCookie, expected: 201, body: { mode: "server", providerId: textModel.id, model: { maxTokens: 1600 } },
  })).json();
  assert.ok(["partial", "succeeded"].includes(completed.status), `Agent status: ${completed.status}`);
  const imageCalls = completed.toolCalls.filter(call => call.toolName === "generate_image");
  assert.equal(imageCalls.length, 1, "Agent should generate exactly one image");
  const output = imageCalls[0].output;
  assert.equal(output.status, "succeeded");
  const imageBytes = await checkImage(output.image, studentCookie, "agent-image");
  assert.ok(output.workspaceAsset?.openUrl, "Image must also be saved to the workspace");
  const workspaceResponse = await request(output.workspaceAsset.openUrl, { cookie: studentCookie });
  assert.equal(workspaceResponse.headers.get("content-type"), output.image.mimeType);
  assert.deepEqual(Buffer.from(await workspaceResponse.arrayBuffer()), imageBytes);
  await request(output.workspaceAsset.openUrl, { expected: 401 });
  checks.push({ check: "agent-workspace-image", passed: true, runId: run.id, status: completed.status });
  const persistedRun = await (await request(`/api/agent-runs/${encodeURIComponent(run.id)}`, { cookie: studentCookie })).json();
  assert.equal(persistedRun.status, completed.status);
  assert.ok(persistedRun.toolCalls.some(call => call.toolName === "generate_image" && call.output.status === "succeeded"));
  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
} finally {
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "report.json"), JSON.stringify({ checks }, null, 2));
  for (const cookie of [operatorCookie, studentCookie].filter(Boolean)) await request("/api/auth/logout", { cookie, body: {}, expected: 201 });
}
