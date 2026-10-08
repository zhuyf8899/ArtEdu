// Non-video files use the standard limit; case and course policies separately configure video limits.
export const STANDARD_UPLOAD_BYTES = 10 * 1024 * 1024;
export function caseUploadPolicy() {
  const videoMiB = Number(process.env.CASE_VIDEO_MAX_MIB ?? 100);
  if (!Number.isInteger(videoMiB) || videoMiB < 10 || videoMiB > 100) {
    throw new Error("CASE_VIDEO_MAX_MIB 必须为 10–100 的整数");
  }
  return { videoBytes: videoMiB * 1024 * 1024, fileBytes: STANDARD_UPLOAD_BYTES, maxFiles: 10 };
}

// 教学视频优先使用 COURSE_VIDEO_MAX_MIB，未设置时回退到案例视频限额；非视频课件维持 10 MiB。
export function courseUploadPolicy() {
  const videoMiB = Number(process.env.COURSE_VIDEO_MAX_MIB ?? process.env.CASE_VIDEO_MAX_MIB ?? 100);
  if (!Number.isInteger(videoMiB) || videoMiB < 10 || videoMiB > 100) {
    throw new Error("COURSE_VIDEO_MAX_MIB 必须为 10–100 的整数");
  }
  return { videoBytes: videoMiB * 1024 * 1024, fileBytes: STANDARD_UPLOAD_BYTES, maxFiles: 30 };
}
