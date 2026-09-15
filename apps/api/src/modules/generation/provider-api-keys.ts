import type { ModelProviderConfig } from "./model-adapter";

/**
 * 视为"这把 key 不可用"的 HTTP 状态：鉴权失败 / 余额不足 / 无权限。
 * 只有这些状态才值得切换备用 key——5xx、网络超时、内容为空属于另一类问题，
 * 换成备用 key 也救不回来，原样抛出即可（避免一次调用被放大成两次）。
 */
export const UNUSABLE_KEY_HTTP_STATUSES = new Set([401, 402, 403]);

/** 带上 HTTP 状态码的适配器错误，供上层判断是否该切换备用 key。 */
export class ModelHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ModelHttpError";
  }
}

/** 一个 provider 声明的 key 环境变量名：主 key 在前、备用 key 在后，去重。 */
export function providerApiKeyEnvNames(config: ModelProviderConfig): string[] {
  return [config.apiKeyEnv, config.apiKeyFallbackEnv]
    .filter((name): name is string => Boolean(name))
    .filter((name, index, all) => all.indexOf(name) === index);
}

/**
 * 按优先级取出**实际有值**的 key。
 * 主 key 的环境变量为空/未设置时自动落到备用 key；
 * 两个都空时返回空数组，由调用方报"未配置环境变量"。
 */
export function resolveProviderApiKeys(config: ModelProviderConfig): string[] {
  return providerApiKeyEnvNames(config)
    .map((name) => process.env[name]?.trim())
    .filter((key): key is string => Boolean(key));
}

/** 人类可读的环境变量名列表，用于错误信息。 */
export function describeProviderApiKeyEnvs(config: ModelProviderConfig): string {
  return providerApiKeyEnvNames(config).join(" / ") || "API key";
}
