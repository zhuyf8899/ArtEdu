import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Explicit paid-call opt-in. Only loopback hosts may receive the known demo credentials.
assert.equal(process.env.ARTEDU_LIVE_DOCUMENT_TEST, "true", "Set ARTEDU_LIVE_DOCUMENT_TEST=true to allow four real model calls");
const origin = new URL(process.env.ARTEDU_TEST_ORIGIN || "http://localhost:4173");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
assert.ok(["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "apps/api/data/document-qa");
await mkdir(destination, { recursive: true });
const cases = [["student", "docx"], ["teacher", "pptx"], ["operator", "pdf"], ["admin", "docx"]];
let studentDownload;

async function request(url, cookie, body, expected = 200) {
  const response = await fetch(new URL(url, origin), {
    method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(120000),
    headers: { origin: origin.origin, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status !== expected) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`${url}: HTTP ${response.status}; ${payload.message || "request failed"}`);
  }
  return response;
}

for (const [role, format] of cases) {
  const login = await request("/api/auth/login", undefined, { username: `${role}.demo`, password: "123456" }, 201);
  const cookie = login.headers.getSetCookie().map(header => header.split(";")[0]).join("; ");
  assert.ok(cookie);
  try {
    const home = await (await request("/api/portal/home", cookie)).json();
    const model = home.creation.models.find(model => model.capabilities.includes("document"));
    assert.ok(home.creation.enabled && model, "Document-capable model must be available");
    const result = await (await request("/api/generation-jobs/run", cookie, {
      jobType: "document", modelConfigId: model.id,
      prompt: "主题：传统纹样入门。面向本科一年级。写两个简短章节：学习目标与课堂练习，每节一段说明与两条要点。",
      parameters: { outputFormat: format, ...(format === "pptx" ? { pageCount: 3 } : {}) },
    }, 201)).json();
    assert.equal(result.job.status, "succeeded");
    assert.ok(result.artifact.downloadUrl.startsWith("/api/generation-jobs/"));
    const file = await request(result.artifact.downloadUrl, cookie);
    assert.equal(file.headers.get("content-type"), result.artifact.mimeType);
    assert.ok(file.headers.get("content-disposition").includes(`.${format}`));
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(bytes.length, result.artifact.fileSize);
    assert.equal(bytes.subarray(0, format === "pdf" ? 5 : 2).toString(), format === "pdf" ? "%PDF-" : "PK");
    await writeFile(path.join(destination, `${role}.${format}`), bytes);
    await request(result.artifact.downloadUrl, undefined, undefined, 401);
    if (role === "student") studentDownload = result.artifact.downloadUrl;
    if (role === "operator" && studentDownload) await request(studentDownload, cookie, undefined, 403);
    console.log(`${role}.demo: ${format} real generation, authenticated download, anonymous denial PASS`);
  } finally {
    await request("/api/auth/logout", cookie, {}, 201);
  }
}
console.log(`Private QA files saved to ${destination}. Operator cannot download student output. No secrets logged.`);
