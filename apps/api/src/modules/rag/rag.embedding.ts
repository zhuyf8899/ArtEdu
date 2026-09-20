import { getEnvironment } from "../../common/environment";

const REQUEST_TIMEOUT_MS = 25_000;

/** Calls only the configured, OpenAI-compatible internal embedding endpoint. */
export async function createEmbeddings(texts: string[]) {
  const environment = getEnvironment();
  if (!environment.ragEnabled || !environment.ragEmbeddingBaseUrl || !environment.ragEmbeddingModel || !environment.ragEmbeddingApiKey) {
    throw new Error("RAG embedding 服务尚未启用或配置不完整");
  }
  if (!texts.length) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${environment.ragEmbeddingBaseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${environment.ragEmbeddingApiKey}` },
      body: JSON.stringify({ model: environment.ragEmbeddingModel, input: texts }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`embedding 服务返回 HTTP ${response.status}`);
    const payload = await response.json() as { data?: Array<{ index?: number; embedding?: unknown }> };
    const entries = [...(payload.data ?? [])].sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
    if (entries.length !== texts.length) throw new Error("embedding 服务返回数量与请求不一致");
    return entries.map((entry) => {
      if (!Array.isArray(entry.embedding) || entry.embedding.length !== environment.ragEmbeddingDimensions || entry.embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
        throw new Error(`embedding 向量维度必须为 ${environment.ragEmbeddingDimensions}`);
      }
      return entry.embedding as number[];
    });
  } finally {
    clearTimeout(timer);
  }
}

export function vectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}
