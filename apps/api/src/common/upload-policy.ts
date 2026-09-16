// Only case videos get the larger allowance. Other upload routes retain 10 MiB.
export const STANDARD_UPLOAD_BYTES = 10 * 1024 * 1024;
export function caseUploadPolicy() {
  const videoMiB = Number(process.env.CASE_VIDEO_MAX_MIB ?? 100);
  if (!Number.isInteger(videoMiB) || videoMiB < 10 || videoMiB > 100) {
    throw new Error("CASE_VIDEO_MAX_MIB 必须为 10–100 的整数");
  }
  return { videoBytes: videoMiB * 1024 * 1024, fileBytes: STANDARD_UPLOAD_BYTES, maxFiles: 10 };
}
