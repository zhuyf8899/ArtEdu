// Reviewed corrections for the existing showcase. Never blanket-delete author sentences.
export function correctCaseCopy(work) {
  const story = structuredClone(work.story ?? work.story_json ?? {});
  let summary = work.summary;
  const moved = [];
  const marker = story.reflection?.indexOf('资料整理说明：') ?? -1;
  if (marker >= 0) {
    moved.push({ field: '经验与反思', text: story.reflection.slice(marker) });
    story.reflection = story.reflection.slice(0, marker).trimEnd();
  }
  for (const text of [
    '本案例根据作者提供的说明和效果图整理；图片为设计展示，不作为已量产或商业落地的证明。',
    '本文为依据原作说明整理的中文导读，英文原文可通过下方“查看原作”访问。',
    '原作页面包含视频，但该视频资源目前返回 404；这里先展示已获授权的封面，待提供有效视频文件后补充。',
  ]) if (summary?.includes(text)) {
    summary = summary.replace(text, '');
    moved.push({ field: '项目简介', text });
  }
  summary = summary?.replace(/\n{3,}/g, '\n\n').trimEnd();
  if (Array.isArray(story.creators)) story.creators = story.creators.map(name => {
    const suffix = '（其余团队成员署名待补充）';
    if (!name.includes(suffix)) return name;
    moved.push({ field: '原作者署名', text: `${name}：待补署名说明移入内部备注` });
    return name.replace(suffix, '');
  });
  if (work.title === 'MIST HILL COFFEE 咖啡品牌设计') {
    story.steps = (story.steps ?? []).map(step => step.outcome?.startsWith('原文输出提出 ') ? { ...step, outcome: step.outcome.replace('原文输出提出 ', '品牌方案包含 ') } : step);
  }
  return { summary, story, moved, changed: summary !== work.summary || JSON.stringify(story) !== JSON.stringify(work.story ?? work.story_json ?? {}) };
}
