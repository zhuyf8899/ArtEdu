const asList = (value) => Array.isArray(value) ? value : [];
const asNumber = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function buildLearningGraph(data) {
  const courses = asList(data?.courses);
  const tasks = asList(data?.tasks);
  const notes = asList(data?.notes);
  const works = asList(data?.works);
  const runs = asList(data?.workflowRuns);
  const summary = data?.summary ?? {};
  const completedTasks = tasks.filter((task) => task.status === "completed" && task.taskType !== "lesson");
  const practiceTasks = tasks.filter((task) => task.taskType !== "lesson");
  const completedRuns = runs.filter((run) => run.status === "completed");
  const completeCourses = courses.filter((course) => asNumber(course.lessonCount) > 0 && asNumber(course.completedLessons) >= asNumber(course.lessonCount));
  const activeCourses = courses.filter((course) => asNumber(course.lessonCount) === 0 || asNumber(course.completedLessons) < asNumber(course.lessonCount));

  const events = [
    ...courses.filter((course) => course.lastStudiedAt).map((course) => ({ id: `course-${course.id}`, at: course.lastStudiedAt, kind: "课程学习", title: course.title, href: `/learning?course=${encodeURIComponent(course.id)}` })),
    ...tasks.filter((task) => task.completedAt).map((task) => ({ id: `task-${task.id}`, at: task.completedAt, kind: "完成任务", title: task.title })),
    ...notes.filter((note) => note.createdAt).map((note) => ({ id: `note-${note.id}`, at: note.createdAt, kind: "学习笔记", title: note.title })),
    ...works.filter((work) => work.createdAt).map((work) => ({ id: `work-${work.id}`, at: work.createdAt, kind: "创作作品", title: work.title })),
    ...runs.filter((run) => run.updatedAt).map((run) => ({ id: `run-${run.id}`, at: run.updatedAt, kind: "工作流", title: run.workflowName, href: `/studio?workflow=${encodeURIComponent(run.workflowId)}&run=${encodeURIComponent(run.id)}` })),
  ].filter((event) => Number.isFinite(new Date(event.at).getTime())).sort((a, b) => new Date(b.at) - new Date(a.at));

  const recommendations = [];
  if (activeCourses.length) {
    const course = [...activeCourses].sort((a, b) => asNumber(a.progressPercent) - asNumber(b.progressPercent))[0];
    recommendations.push({ title: `继续「${course.title}」`, reason: `这门已加入课程目前完成 ${asNumber(course.completedLessons)}/${asNumber(course.lessonCount)} 节课时，先沿着已有路径推进。`, action: "继续学习", href: `/learning?course=${encodeURIComponent(course.id)}` });
  } else if (!courses.length) {
    recommendations.push({ title: "选一门入门课程", reason: "目前还没有加入课程。先建立一条学习主线，图谱会随课时进度展开。", action: "浏览 AI 讲堂", href: "/learning" });
  }
  if (!runs.length) recommendations.push({ title: "尝试一次工作流实践", reason: "尚无工作流运行记录。把课程中的方法用于一次实际创作。", action: "探索设计工具", href: "/studio" });
  else if (!works.length && (completedRuns.length || completeCourses.length)) recommendations.push({ title: "把实践整理为作品", reason: "已有学习或工作流记录，尚未看到个人作品；试着保存并复盘一次创作。", action: "查看我的作品", view: "works" });
  if (!notes.length && courses.length && recommendations.length < 2) recommendations.push({ title: "记录一条学习笔记", reason: "已开始课程学习，但还没有笔记。写下方法与疑问，便于下次复习。", action: "写学习笔记", view: "notes" });

  return {
    courses, tasks, notes, works, runs, events,
    recommendations: recommendations.slice(0, 2),
    summary: {
      courseCount: courses.length,
      completedLessons: asNumber(summary.completedLessons),
      totalLessons: asNumber(summary.totalLessons),
      workflowCount: runs.length,
      completedWorkflowCount: completedRuns.length,
      distinctWorkflowCount: new Set(runs.map((run) => run.workflowId).filter(Boolean)).size,
      completedCourseCount: completeCourses.length,
      workCount: works.length,
      noteCount: notes.length,
      completedTasks: completedTasks.length,
      practiceTaskCount: practiceTasks.length,
    },
  };
}

function makeCell(title, value, target, unit, nextStep, action, display) {
  const ratio = target ? Math.min(1, value / target) : 0;
  const state = value <= 0 ? "none" : ratio >= 1 ? "skilled" : ratio >= 0.5 ? "good" : "basic";
  return { title, value, target, unit, ratio, state, nextStep, action, display };
}

// These are transparent display milestones, not a psychometric ability score or an admin-authored knowledge graph.
export function buildLearningFramework(graph) {
  const s = graph.summary;
  const stages = [
    { id: "discover", number: "01", title: "认识与启程", subtitle: "找到入口，留下第一条学习记录", cells: [
      makeCell("加入第一门课程", s.courseCount, 1, "门课程", "选择一门适合自己的 AI 艺术课程", "/learning"),
      makeCell("完成第一节课", s.completedLessons, 1, "节课时", "完成一节课，形成初步理解", "/learning"),
      makeCell("体验一次工作流", s.workflowCount, 1, "条近期记录", "尝试平台内的一次设计工作流", "/studio"),
      makeCell("写下第一条观察", s.noteCount, 1, "篇笔记", "记下第一次学习时的想法与疑问", "notes"),
    ] },
    { id: "explore", number: "02", title: "方法与探索", subtitle: "把所学转化为可复用的方法", cells: [
      makeCell("持续推进课程", s.completedLessons, 3, "节课时", "继续完成课程中的分步内容", "/learning"),
      makeCell("完成一项练习", s.completedTasks, 1, "项练习", "完成学习计划中的一次实践任务", "plan"),
      makeCell("完成一条工作流", s.completedWorkflowCount, 1, "条近期记录", "完成一条工作流并回看输出", "/studio"),
      makeCell("积累两篇笔记", s.noteCount, 2, "篇笔记", "记录工具方法与创作反思", "notes"),
    ] },
    { id: "create", number: "03", title: "创作与应用", subtitle: "用多种方法完成个人作品", cells: [
      makeCell("完成一门课程", s.completedCourseCount, 1, "门课程", "完成一门课程的全部课时", "/learning"),
      makeCell("完成两项练习", s.completedTasks, 2, "项练习", "用不同题材验证所学方法", "plan"),
      makeCell("探索两种工作流", s.distinctWorkflowCount, 2, "种近期工作流", "尝试另一种创作工作流", "/studio"),
      makeCell("形成第一件作品", s.workCount, 1, "件作品", "保存一次完整的个人创作", "works"),
    ] },
    { id: "integrate", number: "04", title: "融合与表达", subtitle: "跨方法整合，并持续分享与复盘", cells: [
      makeCell("完成两门课程", s.completedCourseCount, 2, "门课程", "把两条知识路径联系起来", "/learning"),
      makeCell("深化课程实践", s.completedLessons, 8, "节课时", "继续学习更深入的课程内容", "/learning"),
      makeCell("反复验证工作流", s.completedWorkflowCount, 4, "条近期记录", "对比不同工作流的创作结果", "/studio"),
      makeCell("持续输出与复盘", Math.min(s.workCount / 2, s.noteCount / 3), 1, "目标", "继续创作作品并记录反思", "works", `作品 ${s.workCount}/2 · 笔记 ${s.noteCount}/3`),
    ] },
  ];
  const currentStageIndex = stages.findIndex((stage) => stage.cells.some((cell) => cell.ratio < 1));
  const currentStage = stages[currentStageIndex < 0 ? stages.length - 1 : currentStageIndex];
  const nextCell = currentStage.cells.find((cell) => cell.ratio < 1);
  return { stages, currentStage, nextCell, allComplete: currentStageIndex < 0 };
}
