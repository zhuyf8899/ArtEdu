// Display copy is API-owned; the v2 editorial revision restores the supplied text.
const tones = { 'AI 创作与生成': 'ai', '3D 与动态': 'three', '实时与交互': 'live', '灵感与资源': 'resource', '灵感与素材': 'resource' };
export function toolCardMetadata(tool) {
  return {
    subtitle: tool.catalog?.subtitle || '',
    tone: tones[tool.category] || 'default',
    tags: [...new Set((tool.catalog?.tags || []).filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim()))],
    unconfirmed: tool.catalog?.linkReview?.result === 'not_confirmed',
  };
}
