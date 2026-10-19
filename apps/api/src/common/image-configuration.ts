export type ImageConfigurationCode = "IMAGE_PROVIDER_NOT_CONFIGURED" | "IMAGE_PROVIDER_KEY_MISSING";

/** Public, non-secret setup failures. Prompt changes cannot repair server configuration. */
export class ImageConfigurationError extends Error {
  readonly retryable = false;
  constructor(readonly code: ImageConfigurationCode) {
    super(code === "IMAGE_PROVIDER_KEY_MISSING"
      ? "图片服务密钥尚未配置，请联系管理员完成配置后再试。修改提示词无法解决此问题。"
      : "图片生成通道尚未接入，请联系管理员配置图片服务后再试。修改提示词无法解决此问题。");
    this.name = "ImageConfigurationError";
  }
}

export function isImageConfigurationCode(code: unknown): code is ImageConfigurationCode {
  return code === "IMAGE_PROVIDER_NOT_CONFIGURED" || code === "IMAGE_PROVIDER_KEY_MISSING";
}
