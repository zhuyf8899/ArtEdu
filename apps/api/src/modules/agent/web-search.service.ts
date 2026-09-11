import { Injectable } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type SearchItem = { title: string; url: string; snippet: string; content?: string };

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
  }
  const lower = address.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

async function assertSafePublicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("仅允许 HTTP(S) 来源");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase()) || url.hostname.endsWith(".local")) throw new Error("不允许本地来源");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("不允许内网来源");
  return url.toString();
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

@Injectable()
export class WebSearchService {
  private readonly searchUrl = process.env.WEB_SEARCH_URL?.trim() || "http://websearch:8081/search";
  private readonly crawlerBaseUrl = process.env.CRAWL4AI_BASE_URL?.trim() || "http://crawler:11235";
  private readonly timeoutMs = Math.min(45_000, Math.max(3_000, Number(process.env.WEB_SEARCH_TIMEOUT_MS ?? 20_000)));
  private readonly deepSeekFallbackUrl = process.env.DEEPSEEK_SEARCH_URL?.trim();
  private readonly deepSeekFallbackKey = process.env.DEEPSEEK_SEARCH_API_KEY?.trim();

  async search(query: string, providerId?: string) {
    try {
      return await this.searchAndCrawl(query);
    } catch (primaryError) {
      try {
        const fallback = await this.searchWithConfiguredDeepSeek(query, providerId);
        return { provider: "deepseek-web-search", degraded: true, ...fallback };
      } catch (fallbackError) {
        const primaryReason = primaryError instanceof Error ? primaryError.message : "crawler unavailable";
        const fallbackReason = fallbackError instanceof Error ? fallbackError.message : "DeepSeek fallback unavailable";
        throw new Error(`联网搜索不可用：抓取链路 ${primaryReason}；DeepSeek 降级 ${fallbackReason}`);
      }
    }
  }

  private async searchWithConfiguredDeepSeek(query: string, providerId?: string) {
    if (!this.deepSeekFallbackUrl) throw new Error("未配置 DEEPSEEK_SEARCH_URL");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.deepSeekFallbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.deepSeekFallbackKey ? { authorization: `Bearer ${this.deepSeekFallbackKey}` } : {}) },
        body: JSON.stringify({ query, limit: 5, providerId }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`DeepSeek 搜索服务 HTTP ${response.status}`);
      const body = await response.json() as { sources?: SearchItem[]; results?: SearchItem[]; content?: string };
      const sources = body.sources ?? body.results ?? [];
      return { sources: sources.slice(0, 5).map((item) => ({ title: text(item.title, 300), url: text(item.url, 2048), snippet: text(item.snippet, 1200), content: text(item.content, 6000) || undefined })), ...(text(body.content, 12_000) ? { summary: text(body.content, 12_000) } : {}) };
    } finally { clearTimeout(timer); }
  }

  private async searchAndCrawl(query: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const discovery = await fetch(this.searchUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, limit: 5 }), signal: controller.signal });
      if (!discovery.ok) throw new Error(`检索服务 HTTP ${discovery.status}`);
      const payload = await discovery.json() as { results?: SearchItem[] };
      const candidates = await Promise.all((payload.results ?? []).slice(0, 5).map(async (item) => {
        try { return { ...item, url: await assertSafePublicUrl(item.url) }; } catch { return null; }
      }));
      const sources = candidates.filter((item): item is SearchItem => Boolean(item)).slice(0, 3);
      if (!sources.length) throw new Error("检索服务未返回可访问的公网来源");
      const crawl = await fetch(new URL("/crawl", this.crawlerBaseUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: sources.map((item) => item.url), browser_config: { headless: true }, crawler_config: { stream: false, cache_mode: "bypass" } }), signal: controller.signal });
      if (!crawl.ok) throw new Error(`抓取服务 HTTP ${crawl.status}`);
      const body = await crawl.json() as { results?: Array<{ url?: string; markdown?: string | { fit_markdown?: string; raw_markdown?: string }; success?: boolean }> };
      const crawled = new Map((body.results ?? []).filter((item) => item.success !== false && item.url).map((item) => [item.url!, text(typeof item.markdown === "string" ? item.markdown : item.markdown?.fit_markdown ?? item.markdown?.raw_markdown, 6000)]));
      return { provider: "ddgs+crawl4ai", degraded: false, sources: sources.map((item) => ({ ...item, content: crawled.get(item.url) || undefined })) };
    } finally { clearTimeout(timer); }
  }
}
