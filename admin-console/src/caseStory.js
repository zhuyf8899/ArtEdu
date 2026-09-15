export const emptyStory = () => ({ version: 1, origin: "unspecified", creators: [], tools: [], methods: [], authorization: "pending", authorizationNote: "", allowDocumentDownload: false, coverAssetId: "", reflection: "", steps: [] });
export const emptyStep = () => ({ title: "", description: "", prompt: "", tool: "", parameters: "", outcome: "", assetIds: [] });
export const splitCaseLabels = text => [...new Set(text.split(/[，,、\n]/).map(item => item.trim()).filter(Boolean))];
export function caseUploadError(files, existingCount = 0) {
  const types = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
  if (files.length + existingCount > 10) return "每个案例最多 10 个文件，请分阶段精选配图";
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) return `${file.name} 超过 10 MiB，请先压缩或拆分`;
    if (!types.includes(file.type)) return `${file.name} 类型不支持；请解压 ZIP，MOV 需先转码`;
  }
  return "";
}
