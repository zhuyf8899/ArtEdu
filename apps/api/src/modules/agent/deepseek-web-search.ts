/**
 * DeepSeek 原生联网搜索 provider。
 *
 * 走 DeepSeek 的 Anthropic 兼容 Messages 端点（`/anthropic/v1/messages`），启用服务端
 * 原生 web 搜索工具 `web_search_20250305`：检索与正文抽取都在服务商侧完成，因此本模块
 * 不需要本地检索服务，也不需要 Chromium 抓取器。
 *
 * 该端点与 chat-completions 的 base URL 不同（后者是 `https://api.deepseek.com`），
 * 两者只共用 API Key —— 所以这里不复用模型的 baseUrl 配置。
 *
 * 分层参考 dsh：线格式与网络调用属于 provider 私有实现（见
 * `packages/web/web-search-deepseek/src/provider.ts`），工具层不感知 provider。
 */

/** 默认 Messages 端点；末尾会追加 `/messages`。 */
export const DEEPSEEK_SEARCH_DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic/v1";
/** 默认 Anthropic 格式模型名。 */
export const DEEPSEEK_SEARCH_DEFAULT_MODEL = "deepseek-v4-flash";
/** 默认 `anthropic-version` 头。 */
export const DEEPSEEK_SEARCH_DEFAULT_API_VERSION = "2023-06-01";
/** 默认单次请求允许的服务端搜索次数。 */
export const DEEPSEEK_SEARCH_DEFAULT_MAX_USES = 3;
/** 默认生成 token 上限（只需产出简短结论，正文抓取由服务端完成）。 */
export const DEEPSEEK_SEARCH_DEFAULT_MAX_TOKENS = 1024;

/** 与 `web-search.service.ts` 共用的来源形状。 */
export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

interface DeepSeekTextBlock {
  type: "text";
  text?: string | null;
}

interface DeepSeekSearchResultItem {
  type?: string;
  url?: string | null;
  title?: string | null;
  page_age?: string | null;
}

interface DeepSeekSearchResultBlock {
  type: "web_search_tool_result";
  /** 正常时是结果数组；服务端检索失败时是一个带 error_code 的对象。 */
  content?: DeepSeekSearchResultItem[] | { type?: string; error_code?: string } | null;
}

type DeepSeekBlock = DeepSeekTextBlock | DeepSeekSearchResultBlock | { type?: string };

export interface DeepSeekSearchPayload {
  content?: DeepSeekBlock[] | null;
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

/**
 * DeepSeek 会在来源 URL 末尾附上引用锚点（形如 `…#1#1`），这是它的引用编号标记而不是
 * 页面锚点。只剥掉这个精确形态，其余 fragment 一律保留。
 */
function cleanUrl(value: unknown): string {
  const url = text(value, 2048);
  return url ? url.replace(/#\d+#\d+$/, "") : "";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * 服务端返回的标题常见形态是 `标题 - 标题`（两段相同），在来源列表里重复显示很难看。
 * 仅在 `" - "` 两侧完全一致时折叠为一段。
 */
function cleanTitle(value: unknown, url: string): string {
  const title = text(value, 300);
  if (!title) return hostnameOf(url);
  const parts = title.split(" - ");
  if (parts.length === 2 && parts[0] === parts[1]) return parts[0];
  return title;
}

/**
 * 把一次 DeepSeek Messages 响应映射为归一化来源。
 *
 * 只认 `web_search_tool_result` 块里的 `web_search_result` 条目；按 url 去重保序。
 * 结论文本取自 `text` 块（`thinking` 块属于思考过程，不作为结论）。
 *
 * @param payload - 已解析的 Messages 响应体。
 * @returns 归一化来源与可选结论文本；`errorCode` 用于把服务端检索失败如实上报。
 */
export function mapDeepSeekSearchResponse(payload: DeepSeekSearchPayload): {
  sources: WebSearchSource[];
  summary?: string;
  errorCode?: string;
} {
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];
  let errorCode: string | undefined;

  for (const block of blocks) {
    if (block?.type !== "web_search_tool_result") continue;
    const content = (block as DeepSeekSearchResultBlock).content;
    if (!Array.isArray(content)) {
      // 服务端检索失败时这里是对象，如实记录 error_code 而不是当作"没有结果"。
      const code = (content as { error_code?: string } | null)?.error_code;
      if (code) errorCode = code;
      continue;
    }
    for (const item of content) {
      if (item?.type !== "web_search_result") continue;
      const url = cleanUrl(item.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ title: cleanTitle(item.title, url), url, snippet: text(item.page_age, 40) });
    }
  }

  const summary = blocks
    .filter((block): block is DeepSeekTextBlock => block?.type === "text")
    .map((block) => text(block.text, 12_000))
    .filter(Boolean)
    .join("\n\n");

  return { sources, ...(summary ? { summary } : {}), ...(errorCode ? { errorCode } : {}) };
}

export interface DeepSeekWebSearchOptions {
  query: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxUses?: number;
  maxTokens?: number;
  timeoutMs: number;
}

/**
 * 用 DeepSeek 原生搜索执行一次检索。
 *
 * @param options - 检索参数；密钥由调用方从运行环境注入，本模块不落盘、不记录。
 * @returns 归一化来源与可选结论文本。
 * @throws Error 端点非 2xx、响应无法解析、或服务端未真正触发搜索时抛出，并带上端点与原因
 *   —— 上游错误详情必须回传，否则线上只能看到"HTTP 400"这类无从下手的信息。
 */
export async function deepSeekWebSearch(options: DeepSeekWebSearchOptions): Promise<{
  sources: WebSearchSource[];
  summary?: string;
}> {
  const baseUrl = (options.baseUrl?.trim() || DEEPSEEK_SEARCH_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const endpoint = `${baseUrl}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        // 官方端点读 `x-api-key`，兼容网关可能读 `Authorization`：两个都发，任一即可。
        "x-api-key": options.apiKey,
        authorization: `Bearer ${options.apiKey}`,
        "anthropic-version": DEEPSEEK_SEARCH_DEFAULT_API_VERSION,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        model: options.model?.trim() || DEEPSEEK_SEARCH_DEFAULT_MODEL,
        max_tokens: options.maxTokens ?? DEEPSEEK_SEARCH_DEFAULT_MAX_TOKENS,
        messages: [{ role: "user", content: [{ type: "text", text: `Perform a web search for the query: ${options.query}` }] }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: options.maxUses ?? DEEPSEEK_SEARCH_DEFAULT_MAX_USES }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 保留上游错误正文：这是定位"发消息 400"那类问题的唯一线索。
      const detail = await response.text().catch(() => "");
      throw new Error(`DeepSeek 原生搜索 HTTP ${response.status}${detail ? `：${detail.replace(/\s+/g, " ").slice(0, 300)}` : ""}`);
    }

    const payload = (await response.json()) as DeepSeekSearchPayload;
    const mapped = mapDeepSeekSearchResponse(payload);
    if (!mapped.sources.length) {
      throw new Error(mapped.errorCode ? `DeepSeek 原生搜索返回错误：${mapped.errorCode}` : "DeepSeek 原生搜索未返回任何来源");
    }
    return { sources: mapped.sources, ...(mapped.summary ? { summary: mapped.summary } : {}) };
  } finally {
    clearTimeout(timer);
  }
}
