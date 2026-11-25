import { findCaseEditorialIssues } from './caseEditorial.js';

export const emptyStory = () => ({ version: 1, origin: "unspecified", creators: [], tools: [], methods: [], sourceName: "", sourceUrl: "", originalUrl: "", exhibitionName: "", exhibitionYear: "", displayStyle: "case-study", authorization: "pending", authorizationNote: "", editorialNote: "", allowDocumentDownload: false, coverAssetId: "", reflection: "", steps: [] });
// 展示端再次校验历史数据，来源仅作为用户主动点击的链接，不自动嵌入第三方页面。
export function safeCaseSourceUrl(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!/^https?:\/\//i.test(text) || text.length > 2048 || /[\u0000-\u0020\u007f]/.test(text)) return "";
  try { const url = new URL(text); return url.username || url.password ? "" : url.href; }
  catch { return ""; }
}
export const emptyStep = () => ({ title: "", description: "", prompt: "", tool: "", parameters: "", outcome: "", assetIds: [] });
export const splitCaseLabels = text => [...new Set(text.split(/[，,、\n]/).map(item => item.trim()).filter(Boolean))];
export function caseUploadError(files, existingCount = 0, policy = { videoBytes: 100 * 1024 * 1024, fileBytes: 10 * 1024 * 1024 }) {
  const types = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
  if (files.length + existingCount > 10) return "每个案例最多 10 个文件，请分阶段精选配图";
  for (const file of files) {
    if (file.size === 0) return `${file.name} 是空文件，请选择其他文件`;
    const limit = file.type.startsWith('video/') ? policy.videoBytes : policy.fileBytes;
    if (file.size > limit) return `${file.name} 超过 ${limit / 1024 / 1024} MiB，请先压缩或拆分`;
    if (!types.includes(file.type)) return `${file.name} 类型不支持；请解压 ZIP，MOV 需先转码`;
  }
  return "";
}


export function caseReviewIssues(work, imageCount = work.assets?.filter(asset => asset.asset_type === 'image').length ?? 0) {
  const story = work.story ?? {};
  const issues = [];
  if (!imageCount) issues.push('添加至少一张图片作为封面。');
  if (!story.origin || story.origin === 'unspecified') issues.push('选择作品来源。');
  if (story.origin === 'collected') {
    if (!story.creators?.length) issues.push('填写外部作品的原作者或团队。');
    if (story.authorization !== 'confirmed' || !story.authorizationNote?.trim()) issues.push('确认展示授权并填写授权说明。');
  }
  if (findCaseEditorialIssues(work).length) issues.push('调整公开文案，将资料整理说明移到编辑备注。');
  return issues;
}
