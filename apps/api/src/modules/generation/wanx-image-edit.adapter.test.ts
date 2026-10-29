import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { WanxImageEditAdapter, wanxMaskDataUrl } from "./wanx-image-edit.adapter";
import { ModelRegistry } from "./model-registry";
import type { ImageEditInput } from "./image-edit";

function inputs(): ImageEditInput {
  const image = new PNG({ width: 512, height: 512 }); image.data.fill(255);
  const mask = new PNG({ width: 512, height: 512 }); mask.data.fill(255); mask.data[3] = 0;
  const dataUrl = (png: PNG) => `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
  return { image: { dataUrl: dataUrl(image), fileName: "input.png" }, mask: { dataUrl: dataUrl(mask), fileName: "mask.png" } };
}
const config = { id: "wan-edit", baseUrl: "https://dashscope.example.test/api/v1", model: "wanx2.1-imageedit", capabilities: ["image" as const], protocol: "wanx-image-edit" as const, apiKeyEnv: "WAN_ADAPTER_TEST_KEY", imageEditing: true, timeoutMs: 5000 };

test("透明编辑区转换为纯白，保留区纯黑，输出无透明区域", () => {
  const mask = PNG.sync.read(Buffer.from(wanxMaskDataUrl(inputs())!.split(",")[1], "base64"));
  assert.deepEqual([...mask.data.subarray(0, 8)], [255,255,255,255,0,0,0,255]);
});
test("百炼编辑协议不抢占文生图路由，编辑路由能选择专用适配器", context => {
  context.mock.method(process, "emitWarning", () => {});
  const saved = process.env.MODEL_PROVIDERS_JSON;
  try {
    process.env.MODEL_PROVIDERS_JSON = JSON.stringify([config, { ...config, id: "generate", protocol: "openai-image", imageEditing: false }]);
    const registry = new ModelRegistry();
    assert.equal(registry.getForJob({ jobType: "image" }).id, "generate");
    assert.equal(registry.getForJob({ jobType: "image", imageEditing: true }).id, "wan-edit");
  } finally { if (saved === undefined) delete process.env.MODEL_PROVIDERS_JSON; else process.env.MODEL_PROVIDERS_JSON = saved; }
});

for (const masked of [true, false]) test(`真实请求结构、异步查询与内存成果（遮罩=${masked}）`, async context => {
  const saved = process.env.WAN_ADAPTER_TEST_KEY; process.env.WAN_ADAPTER_TEST_KEY = "test-not-secret";
  let submissions = 0, polls = 0;
  const input = inputs(); if (!masked) delete input.mask;
  context.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    if (init?.method === "POST") {
      submissions++; assert.equal(String(url), "https://dashscope.example.test/api/v1/services/aigc/image2image/image-synthesis");
      assert.equal(init.headers["X-DashScope-Async"], "enable");
      const body = JSON.parse(init.body); assert.equal(body.parameters.n, 1);
      assert.equal(body.input.function, masked ? "description_edit_with_mask" : "description_edit");
      assert.equal(Boolean(body.input.mask_image_url), masked);
      return Response.json({ output: { task_id: "one-task", task_status: "PENDING" } });
    }
    if (String(url).includes("/tasks/")) {
      polls++; assert.ok(String(url).endsWith("/one-task"));
      return Response.json({ output: { task_status: "SUCCEEDED", results: [{ url: "https://images.example.test/result.png" }] } });
    }
    assert.equal(init?.headers?.authorization, undefined, "下载成果不能泄露 API Key");
    return new Response(Buffer.from(input.image.dataUrl.split(",")[1], "base64"), { headers: { "content-type": "image/png" } });
  });
  try {
    const result = await new WanxImageEditAdapter(config).execute({ jobType: "image", prompt: "改为蓝色", imageEdit: input, transient: true });
    assert.equal(result.content, "memory"); assert.ok(Buffer.isBuffer(result.metadata?.bytes)); assert.equal(submissions, 1); assert.equal(polls, 1);
  } finally { if (saved === undefined) delete process.env.WAN_ADAPTER_TEST_KEY; else process.env.WAN_ADAPTER_TEST_KEY = saved; }
});

test("失败任务不再次提交，不将供应商完整错误正文写入异常", async context => {
  const saved = process.env.WAN_ADAPTER_TEST_KEY; process.env.WAN_ADAPTER_TEST_KEY = "test"; let submissions = 0;
  context.mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    if (init?.method === "POST") { submissions++; return Response.json({ output: { task_id: "failed" } }); }
    return Response.json({ output: { task_status: "FAILED", code: "DataInspectionFailed", message: "PRIVATE_IMAGE_AND_PROMPT" } });
  });
  try {
    await assert.rejects(new WanxImageEditAdapter(config).execute({ jobType: "image", prompt: "测试", imageEdit: inputs(), transient: true }), error => {
      assert.match(String(error), /DataInspectionFailed/); assert.doesNotMatch(String(error), /PRIVATE_IMAGE/); return true;
    }); assert.equal(submissions, 1);
  } finally { if (saved === undefined) delete process.env.WAN_ADAPTER_TEST_KEY; else process.env.WAN_ADAPTER_TEST_KEY = saved; }
});
test("错误尺寸和损坏的 PNG 在付费请求前拒绝", async context => {
  let calls = 0; context.mock.method(globalThis, "fetch", async () => { calls++; throw Error("unexpected network"); });
  const input = inputs(); const small = new PNG({ width: 320, height: 320 });
  input.image.dataUrl = `data:image/png;base64,${PNG.sync.write(small).toString("base64")}`; delete input.mask;
  await assert.rejects(new WanxImageEditAdapter(config).execute({ jobType: "image", prompt: "测试", imageEdit: input }), /512/);
  const corrupt = Buffer.from(inputs().image.dataUrl.split(",")[1], "base64"); corrupt[corrupt.length - 1] ^= 1;
  input.image.dataUrl = `data:image/png;base64,${corrupt.toString("base64")}`;
  await assert.rejects(new WanxImageEditAdapter(config).execute({ jobType: "image", prompt: "测试", imageEdit: input }));
  assert.equal(calls, 0);
});
