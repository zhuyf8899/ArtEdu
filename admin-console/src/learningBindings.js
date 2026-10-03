export const learningLabels = (value) => [...new Set((Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，;；]/) : [])
  .filter((label) => typeof label === "string").map((label) => label.trim()).filter(Boolean))];

export function normalizeLearningBindings(value) {
  return Object.fromEntries(["knowledgePoints", "tools", "abilityGoals"].map((key) => {
    const labels = learningLabels(value?.[key]);
    if (labels.length > 20 || labels.some((label) => label.length > 80 || /[\u0000-\u001f\u007f]/.test(label))) {
      throw new Error("每项最多 20 个名称，每个名称不超过 80 字，不能包含控制字符。");
    }
    return [key, labels];
  }));
}

// Course-level coverage is not evidence that any individual knowledge point is completed.
export function buildKnowledgeEvidence(graph) {
  const progress = (lesson) => Number.isFinite(Number(lesson.progressPercent)) ? Number(lesson.progressPercent) : 0;
  const points = new Map();
  const add = (name) => { if (!points.has(name)) points.set(name, { name, lessons: [], courses: [] }); return points.get(name); };
  for (const course of graph.courses) for (const name of learningLabels(course.knowledgePoints)) add(name).courses.push(course);
  for (const lesson of graph.lessons) for (const name of learningLabels(lesson.knowledgePoints)) add(name).lessons.push(lesson);
  return [...points.values()].map((point) => {
    const completed = point.lessons.filter((lesson) => progress(lesson) >= 100);
    const pending = point.lessons.filter((lesson) => progress(lesson) < 100);
    const state = !point.lessons.length ? "coverage" : !pending.length ? "completed"
      : point.lessons.some((lesson) => progress(lesson) > 0) ? "learning" : "not_started";
    const next = pending.find((lesson) => progress(lesson) > 0) ?? pending[0];
    return { ...point, state, completedCount: completed.length, lessonCount: point.lessons.length, next,
      submissions: point.lessons.filter((lesson) => lesson.submittedWorkId).map((lesson) => ({ workId: lesson.submittedWorkId, title: lesson.submittedWorkTitle || "已关联作品", lessonTitle: lesson.title })),
      workflows: graph.runs.filter((run) => learningLabels(run.learningBindings?.knowledgePoints).includes(point.name)),
    };
  });
}
