const COURSE_PROFILES = {
  "course-ai-design-foundation": { method: "UI 创作", author: "周可老师", tools: ["GPT-4o", "Figma"] },
  "course-traditional-pattern": { method: "图案生成", author: "林知夏老师", tools: ["FLUX.1", "Midjourney"] },
  "course-vibe-gallery": { method: "Vibe Coding", author: "陈明远老师", tools: ["Claude 4", "VS Code"] },
};

// 讲堂与搜索结果共用同一套课程展示信息，避免作者、方法和工具在两处不一致。
export function decorateCourse(course) {
  const profile = COURSE_PROFILES[course.id] ?? {};
  const title = course.title ?? "";
  const inferredMethod = title.toLowerCase().includes("coding") || title.includes("网页")
    ? "Vibe Coding"
    : title.includes("纹样") || title.includes("图案")
      ? "图案生成"
      : "UI 创作";
  return {
    ...course,
    method: course.method ?? course.catalog?.method ?? profile.method ?? inferredMethod,
    author: course.author || course.catalog?.authorLabel || course.creatorName || profile.author || "作者待确认",
    tools: Array.isArray(course.tools) ? course.tools : course.catalog?.tools ?? profile.tools ?? [],
  };
}

export function courseReadiness(course) {
  if (course.archived || course.status === 'archived') return '已下架 · 保留记录';
  if (course.availability === 'coming_soon') return '筹备中';
  if (course.availability === 'trial') return '试学 · 待教研审核';
  return '';
}

export function difficultyName(value) {
  return { beginner: "入门", intermediate: "进阶", advanced: "高级" }[value] ?? "入门";
}
