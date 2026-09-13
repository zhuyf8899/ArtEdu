import assert from "node:assert/strict";
import test from "node:test";
import { mapDeepSeekSearchResponse } from "./deepseek-web-search";

/** 贴近线上真实响应：thinking / server_tool_use / web_search_tool_result / text 四种块。 */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      { type: "thinking", thinking: "先想一下检索词……" },
      { type: "server_tool_use", name: "web_search" },
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://www.cssn.cn/skgz/bwyc/202509/t20250922_5916496.shtml#1#1", title: "数字艺术赋能美育的路径和价值", page_age: null },
          { type: "web_search_result", url: "https://paper.jyb.cn/zgjyb/h5/html5/2026-01/13/content_144748_1921", title: "美育为教育强国建设注入新动能 - 美育为教育强国建设注入新动能", page_age: "2026-01-13" },
          { type: "web_search_result", url: "https://paper.jyb.cn/zgjyb/h5/html5/2026-01/13/content_144748_1921", title: "重复 URL 应被去重" },
          { type: "web_search_result", url: "https://example.com/no-title", title: null },
          { type: "web_search_result", url: "", title: "无 URL 应被丢弃" },
        ],
      },
      { type: "text", text: "根据检索到的高校美育实践，建议……" },
    ],
    ...overrides,
  };
}

test("DeepSeek 原生搜索结果映射为归一化来源", () => {
  const mapped = mapDeepSeekSearchResponse(payload());

  assert.equal(mapped.sources.length, 3, "同 URL 去重、无 URL 丢弃");
  assert.deepEqual(mapped.sources.map((source) => source.url), [
    "https://www.cssn.cn/skgz/bwyc/202509/t20250922_5916496.shtml",
    "https://paper.jyb.cn/zgjyb/h5/html5/2026-01/13/content_144748_1921",
    "https://example.com/no-title",
  ]);
  // 引用锚点 `#1#1` 是 DeepSeek 的编号标记，必须剥掉才能作为可点链接。
  assert.ok(!mapped.sources[0].url.includes("#"), "引用锚点应被剥离");
  // `标题 - 标题` 的重复形态折叠为一段。
  assert.equal(mapped.sources[1].title, "美育为教育强国建设注入新动能");
  // 服务端没给标题时回退到主机名，而不是留空。
  assert.equal(mapped.sources[2].title, "example.com");
  assert.equal(mapped.sources[1].snippet, "2026-01-13");
});

test("结论只取 text 块，思考块不得混入", () => {
  const mapped = mapDeepSeekSearchResponse(payload());

  assert.equal(mapped.summary, "根据检索到的高校美育实践，建议……");
  assert.ok(!String(mapped.summary).includes("先想一下"), "thinking 块不能当结论");
});

test("服务端检索失败时如实上报 error_code，而不是当作没有结果", () => {
  const mapped = mapDeepSeekSearchResponse({
    content: [
      { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
      { type: "text", text: "抱歉，检索失败。" },
    ],
  });

  assert.equal(mapped.sources.length, 0);
  assert.equal(mapped.errorCode, "max_uses_exceeded");
  assert.equal(mapped.summary, "抱歉，检索失败。");
});

test("空响应与畸形响应都不会抛错", () => {
  assert.deepEqual(mapDeepSeekSearchResponse({ content: [] }).sources, []);
  assert.deepEqual(mapDeepSeekSearchResponse({}).sources, []);
  assert.deepEqual(mapDeepSeekSearchResponse({ content: null }).sources, []);
  assert.equal(mapDeepSeekSearchResponse({ content: [] }).summary, undefined);
});

test("联网检索在同一份实现里：未配置密钥时明确报错，而不是静默降级", async () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    // 动态导入：服务在构造时读取环境变量，必须先清掉密钥再实例化。
    const { WebSearchService } = await import("./web-search.service");
    const service = new WebSearchService();
    await assert.rejects(() => service.search("中国美术教育"), /未配置 DEEPSEEK_API_KEY/);
    await assert.rejects(() => service.search("   "), /检索词为空/);
  } finally {
    if (saved === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = saved;
  }
});
