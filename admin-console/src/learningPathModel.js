const countLabel = (cell) => cell.display ?? `${cell.value} / ${cell.target} ${cell.unit}`;
const lessonHref = (lesson) => `/learning?course=${encodeURIComponent(lesson.courseId)}&lesson=${encodeURIComponent(lesson.id)}`;

// Relations without an explicit source reference remain suggested paths, never inferred bindings.
export function buildLearningPaths(graph, framework, contents) {
  return Object.fromEntries(framework.stages.map((stage, index) => {
    let targetStage = stage;
    let column = stage.cells.findIndex((cell) => cell.ratio < 1);
    if (column < 0) {
      targetStage = framework.stages.slice(index + 1).find((item) => item.cells.some((cell) => cell.ratio < 1));
      column = targetStage?.cells.findIndex((cell) => cell.ratio < 1) ?? -1;
    }
    const target = column >= 0 ? contents[targetStage.id][column] : null;
    const goal = column >= 0 ? targetStage.cells[column] : null;
    const recommendation = {
      title: target?.next.title ?? "探索新的艺术课程",
      text: target?.next.text ?? "现有阶段展示目标已达到，可以选择新的艺术主题继续学习。",
      action: target?.next.action ?? "/learning",
      reason: goal ? `「${targetStage.title}」中的「${goal.title}」目前为 ${countLabel(goal)}，尚未达到展示目标，因此推荐这一步。` : "现有四阶段目标已达到；继续探索新方向，不把目标完成视为正式能力认证。",
      targetStageId: targetStage?.id ?? stage.id,
      column: column >= 0 ? column : 0,
      label: stage.id === framework.currentStage.id && !framework.allComplete ? "现在可做" : "阶段建议",
    };
    const [map, ability, tools, growth] = contents[stage.id];
    const authoredLesson = map.source?.kind === "course" && ability.source?.kind === "lesson" && map.source.id === ability.source.courseId;
    const boundWorkflow = ability.source?.workflowId && tools.source?.workflowId === ability.source.workflowId;
    const noteForCourse = growth.source?.kind === "note" && map.source?.id && growth.source.courseId === map.source.id;
    const noteForLesson = growth.source?.kind === "note" && ability.source?.kind === "lesson" && growth.source.lessonId === ability.source.id;
    const edges = [
      { id: "course-to-content", from: 0, to: 1, label: authoredLesson ? "包含课时" : "建议学习", existing: Boolean(authoredLesson), path: "M60 102 C60 76 200 76 200 102", x: 130, y: 84 },
      { id: "map-to-growth", from: 0, to: 3, label: noteForCourse ? "课程笔记" : "可复盘", existing: Boolean(noteForCourse), path: "M85 207 L104 249", x: 72, y: 233 },
      { id: "ability-to-growth", from: 1, to: 3, label: noteForLesson ? "课时笔记" : "可记录", existing: Boolean(noteForLesson), path: "M180 208 L168 247", x: 199, y: 233 },
      { id: "content-to-practice", from: 1, to: 2, label: boundWorkflow ? "配置实践" : "建议实践", existing: Boolean(boundWorkflow), path: "M247 181 C276 217 240 249 240 289 L240 410 Q240 440 187 455", x: 241, y: 419 },
      { id: "tools-to-growth", from: 2, to: 3, label: "可保存", existing: false, path: "M140 426 L140 398", x: 164, y: 415 },
      { id: "growth-to-suggestion", from: 3, to: 4, label: "推荐", existing: false, path: "M218 320 L258 320", x: 238, y: 309 },
    ];
    return [stage.id, { recommendation, edges }];
  }));
}

export function learningBranches(graph, content, recommendation, column) {
  if (column === 4) return [{ title: recommendation.title, relation: "建议学习", action: recommendation.action, existing: false, state: "none" }];
  const source = content.source;
  if (source?.kind === "course") return graph.lessons.filter((lesson) => lesson.courseId === source.id).slice(0, 3).map((lesson) => ({
    title: lesson.title, relation: "包含课时", action: lessonHref(lesson), existing: true,
    state: lesson.progressPercent >= 100 ? "skilled" : lesson.progressPercent > 0 ? "basic" : "none",
  }));
  if (source?.kind === "lesson") {
    const lesson = graph.lessons.find((item) => item.id === source.id);
    return (lesson?.learningSteps ?? []).filter((step) => typeof step === "string" && step.trim()).slice(0, 3).map((step) => ({
      title: step, relation: "课时内容", action: lessonHref(lesson), existing: true,
      state: lesson.progressPercent >= 100 ? "skilled" : lesson.progressPercent > 0 ? "basic" : "none",
    }));
  }
  if (source?.kind === "note") {
    const course = graph.courses.find((item) => item.id === source.courseId);
    const lesson = graph.lessons.find((item) => item.id === source.lessonId);
    return [
      ...(course ? [{ title: course.title, relation: "关联课程", action: `/learning?course=${encodeURIComponent(course.id)}`, existing: true, state: "none" }] : []),
      ...(lesson ? [{ title: lesson.title, relation: "关联课时", action: lessonHref(lesson), existing: true, state: lesson.progressPercent >= 100 ? "skilled" : "none" }] : []),
      { title: recommendation.title, relation: "建议下一步", action: recommendation.action, existing: false, state: "none" },
    ];
  }
  return [
    ...content.records.slice(0, 2).map((record) => ({ title: record.title, relation: "已有记录", action: record.action, existing: true, state: "none" })),
    { title: content.next.title, relation: "建议下一步", action: content.next.action, existing: false, state: "none" },
  ];
}
