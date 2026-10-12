// 与 API 的 case-editorial.ts 使用相同规则，前端仅提示，不静默改写作者文字。
const editorialPatterns = [
  /资料整理说明\s*[:：]/,
  /本(?:次|轮)(?:导入|上传|资料整理|独立复核)/,
  /本案例根据作者提供的.{0,60}整理/,
  /本文为依据原作说明整理/,
  /(?:原作页面|这里先展示).{0,100}(?:返回\s*404|已获授权的封面|待提供有效视频)/,
  /视频待作者补充|(?:工具|参数|相关)字段留空/,
  /(?:原始|原件).{0,40}(?:保留|保存)在本地(?:资料包)?/,
  /其余团队成员署名待补充/,
  /验证作品创建、工作流关联、标签、审核、评论与互动完整链路/,
];
export function findCaseEditorialIssues(input) {
  const fields = [["案例名称", input.title], ["项目简介", input.summary], ["经验与反思", input.story?.reflection]];
  input.story?.creators?.forEach(value => fields.push(["原作者署名", value]));
  input.story?.steps?.forEach((step, index) => fields.push([`步骤 ${index + 1} 名称`, step.title], [`步骤 ${index + 1} 目标与操作`, step.description], [`步骤 ${index + 1} 结果与调整`, step.outcome]));
  return fields.filter(([, value]) => value && editorialPatterns.some(pattern => pattern.test(value))).map(([field]) => ({ field, message: `${field}含有平台或资料整理说明，请移到“编辑备注”，公开正文只保留作品内容与作者叙述。` }));
}
