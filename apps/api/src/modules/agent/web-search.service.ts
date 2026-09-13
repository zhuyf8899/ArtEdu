import { Injectable } from "@nestjs/common";

import { DEEPSEEK_SEARCH_DEFAULT_MAX_USES, deepSeekWebSearch, type WebSearchSource } from "./deepseek-web-search";

/** 统一失败原因文案：上游详情必须带上，否则线上只能看到笼统的"搜索不可用"。 */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

export interface WebSearchOutcome {
  provider: string;
  latencyMs: number;
  sources: WebSearchSource[];
  summary?: string;
}

/**
 * 联网检索的唯一入口（capability seam，对应 dsh 的 `ctx.web`）。
 *
 * 只负责 provider 选择与配置读取，不感知线格式与网络细节 —— 具体调用在
 * `deepseek-web-search.ts` 里。
 *
 * 当前只注册 DeepSeek 原生联网搜索一个 provider：检索与正文抽取都在服务商侧完成，
 * 因此既不需要本地检索服务，也不需要 Chromium 抓取器（后者在 1.6G 内存且无 swap 的
 * 机器上会引发负载尖峰并连带拖垮容器 DNS）。
 */
@Injectable()
export class WebSearchService {
  /** 与模型共用同一账号密钥，只是端点不同（Anthropic 兼容 Messages API）。 */
  private readonly apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  private readonly baseUrl = process.env.DEEPSEEK_SEARCH_BASE_URL?.trim();
  private readonly model = process.env.DEEPSEEK_SEARCH_MODEL?.trim();
  private readonly maxUses = Number(process.env.DEEPSEEK_SEARCH_MAX_USES ?? "") || DEEPSEEK_SEARCH_DEFAULT_MAX_USES;
  private readonly timeoutMs = Math.min(45_000, Math.max(3_000, Number(process.env.WEB_SEARCH_TIMEOUT_MS ?? 25_000)));

  async search(query: string): Promise<WebSearchOutcome> {
    const trimmed = query.trim();
    if (!trimmed) throw new Error("联网搜索不可用：检索词为空");
    if (!this.apiKey) throw new Error("联网搜索不可用：未配置 DEEPSEEK_API_KEY");

    const startedAt = Date.now();
    try {
      const result = await deepSeekWebSearch({
        query: trimmed,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        model: this.model,
        maxUses: this.maxUses,
        timeoutMs: this.timeoutMs,
      });
      return { provider: "deepseek-native", latencyMs: Date.now() - startedAt, ...result };
    } catch (error) {
      throw new Error(`联网搜索不可用：${reasonOf(error)}`);
    }
  }
}
