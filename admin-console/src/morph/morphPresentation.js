// Visual defaults only; course IDs, authors, progress and all content remain API-owned.
const courseArtwork = {
  'course-ai-design-foundation': '/assets/learning/ai-design-foundations.jpg',
  'course-traditional-pattern': '/assets/learning/traditional-patterns.jpg',
  'course-vibe-gallery': '/assets/learning/vibe-coding.jpg',
};
export const morphCourseCover = course => course.coverImageUrl || course.coverUrl || courseArtwork[course.id] || '';
export const morphCourseLevel = course => ({beginner:'入门',intermediate:'进阶',advanced:course.catalog?.bundleId==='morph-catalog-v1'?'专家':'高级'}[course.difficulty] || '入门');
export const morphModuleLabel = (label, variant) => variant === 'morph' ? ({'AI 讲堂':'原子课程','设计工具':'技能工具'}[label] ?? label) : label;
export function dailyQuotaLabel(quota = {}) {
  if (quota.dailyLimit == null) return '未设日上限';
  return `${Math.max(0, quota.dailyLimit - (quota.dailyUsed ?? 0))} 次 / 今日`;
}
export function morphQueryMatches(values, query) {
  const terms = String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = values.filter(Boolean).join(' ').toLocaleLowerCase();
  return terms.every(term => text.includes(term));
}

export function toolPresentation(tool) {
  const workflow = tool.id === 'tool-directory-workflow';
  const internal = workflow || /^\/(?!\/)/.test(tool.href ?? '');
  let host = internal ? 'MORPH LAB' : '外部网站';
  if (!internal) {
    try { host = new URL(tool.href).hostname.replace(/^www\./, '') || host; } catch { /* Existing server validation owns URL safety. */ }
  }
  return { workflow, internal, host, newTab: !workflow && tool.launchMode !== 'same_tab',
    kind: internal ? '站内工具' : '外部网站',
    name: workflow ? '节点工作流' : tool.name,
    detail: workflow ? '查看、编辑或新建节点工作流，将创作步骤连接成可复用的流程。' : tool.detail,
  };
}
