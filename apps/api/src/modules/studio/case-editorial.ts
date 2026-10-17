type PublicCopy = { title?: string; summary?: string; story?: { creators?: string[]; reflection?: string; steps?: { title?: string; description?: string; outcome?: string }[] } };

// 只提示明确的导入/平台编辑语言，不按“我们”“AI”“404”等单词删作者内容。
// 提示词和参数是可复现材料，不参与作者叙述检查；草稿仍可保存。
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

export function findCaseEditorialIssues(input: PublicCopy): { field: string; message: string }[] {
  const fields: [string, string | undefined][] = [["案例名称", input.title], ["项目简介", input.summary], ["经验与反思", input.story?.reflection]];
  input.story?.creators?.forEach(value => fields.push(["原作者署名", value]));
  input.story?.steps?.forEach((step, index) => fields.push([`步骤 ${index + 1} 名称`, step.title], [`步骤 ${index + 1} 目标与操作`, step.description], [`步骤 ${index + 1} 结果与调整`, step.outcome]));
  return fields.filter(([, value]) => value && editorialPatterns.some(pattern => pattern.test(value))).map(([field]) => ({ field, message: `${field}含有平台或资料整理说明，请移到“编辑备注”，公开正文只保留作品内容与作者叙述。` }));
}

export function assertCaseEditorial(input: PublicCopy) {
  const issues = findCaseEditorialIssues(input);
  if (issues.length) throw new Error(issues.map(issue => issue.message).join("；"));
}
