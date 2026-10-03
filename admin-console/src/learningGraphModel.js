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
    courses, tasks, notes, works, runs, events, lessons: asList(data?.learningLessons),
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

const titleOf = (item, fallback) => typeof item?.title === "string" && item.title.trim() ? item.title.trim() : fallback;
const courseHref = (id, lessonId) => id ? `/learning?course=${encodeURIComponent(id)}${lessonId ? `&lesson=${encodeURIComponent(lessonId)}` : ""}` : "/learning";
const runHref = (run) => run?.workflowId && run?.id ? `/studio?workflow=${encodeURIComponent(run.workflowId)}&run=${encodeURIComponent(run.id)}` : "/studio";
const unique = (values) => [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];

// The stage goals are cumulative milestones, not a claim about when a record was created.
// Never turn a joined course, an unfinished lesson, or a workflow name into mastered knowledge.
export function buildLearningOrbitContent(graph, framework) {
  const completedLessons = graph.lessons.filter((lesson) => asNumber(lesson.progressPercent) >= 100);
  const pendingLessons = graph.lessons.filter((lesson) => asNumber(lesson.progressPercent) < 100);
  const completedCourses = graph.courses.filter((course) => asNumber(course.lessonCount) > 0 && asNumber(course.completedLessons) >= asNumber(course.lessonCount));
  const activeCourses = graph.courses.filter((course) => !completedCourses.includes(course));
  const tasks = graph.tasks.filter((task) => task.taskType !== "lesson");
  const doneTasks = tasks.filter((task) => task.status === "completed");
  const pendingTask = tasks.find((task) => task.status === "pending");
  const doneRuns = graph.runs.filter((run) => run.status === "completed");
  const distinctRuns = [...new Map(graph.runs.filter((run) => run.workflowId).map((run) => [run.workflowId, run])).values()];
  const pendingRun = graph.runs.find((run) => !["completed", "failed", "cancelled"].includes(run.status));
  const lessonTopics = (lessons) => unique(lessons.flatMap((lesson) => [...asList(lesson.knowledgePoints), lesson.title, ...asList(lesson.learningSteps)]));
  const nextLesson = (courseId) => pendingLessons.find((lesson) => !courseId || lesson.courseId === courseId);
  const lessonNext = (lesson, fallback) => lesson
    ? { title: titleOf(lesson, "继续下一课时"), text: `待学内容：${unique([...asList(lesson.knowledgePoints), lesson.title, ...asList(lesson.learningSteps)]).join("、")}。来自「${lesson.courseTitle || "已选课程"}」。`, action: courseHref(lesson.courseId, lesson.id) }
    : { title: fallback, text: "前往 AI 讲堂选择适合当前方向的课程；尚未配置的知识点不会显示为已学。", action: "/learning" };
  const result = {};
  framework.stages.forEach((stage, index) => {
    const course = index === 3 ? completedCourses[1] ?? graph.courses.find((item) => item !== completedCourses[0] && item !== activeCourses[0])
      : index === 2 ? completedCourses[0] ?? activeCourses[0] : graph.courses[index] ?? graph.courses[0];
    const courseLessons = graph.lessons.filter((lesson) => lesson.courseId === course?.id && asNumber(lesson.progressPercent) >= 100);
    const courseKnowledge = lessonTopics(courseLessons);
    const activeLesson = graph.lessons.find((lesson) => lesson.courseId === course?.id && asNumber(lesson.progressPercent) > 0 && asNumber(lesson.progressPercent) < 100);
    const courseStatus = !course ? "待选课程" : completedCourses.includes(course) ? "课程已完成" : asNumber(course.progressPercent) > 0 || asNumber(course.completedLessons) > 0 ? "正在学习" : "已加入课程";
    const map = {
      headline: titleOf(course, index === 3 ? "探索第二门课程" : index >= 2 ? "选择进阶课程" : "选择入门课程"),
      topic: courseKnowledge.length ? `已学：${courseKnowledge[0]}` : activeLesson ? `在学：${activeLesson.title}` : course ? "课时内容待学习" : "建立学习主线",
      recordLabel: courseStatus,
      records: course ? [{ title: course.title, detail: `${asNumber(course.completedLessons)} / ${asNumber(course.lessonCount)} 节已完成`, action: courseHref(course.id) }] : [],
      knowledge: courseKnowledge,
      next: lessonNext(nextLesson(course?.id), index >= 2 ? "探索新的课程方向" : "开始第一门课程"),
      action: courseHref(course?.id),
      source: course ? { kind: "course", id: course.id } : null,
    };
    if (index === 1 && course) map.recordLabel = `已学 ${graph.summary.completedLessons} / 3 课时`;
    if (index >= 2) {
      map.recordLabel = `完成 ${graph.summary.completedCourseCount} / ${index === 2 ? 1 : 2} 门`;
      if (nextLesson(course?.id)) map.topic = `下一课：${nextLesson(course?.id).title}`;
    }
    let ability;
    if (index === 0 || index === 3) {
      const lesson = index === 0 ? completedLessons[0] ?? pendingLessons[0] : completedLessons[7] ?? pendingLessons[0] ?? completedLessons.at(-1);
      const completed = lesson && asNumber(lesson.progressPercent) >= 100;
      ability = {
        headline: titleOf(lesson, index === 0 ? "学习第一节课" : "深化课程实践"),
        topic: lesson ? `${completed ? "已学" : asNumber(lesson.progressPercent) > 0 ? "在学" : "待学"}：${asList(lesson.knowledgePoints)[0] || asList(lesson.learningSteps)[0] || lesson.title}` : "知识内容待选择",
        recordLabel: completed ? "已学课时" : lesson && asNumber(lesson.progressPercent) > 0 ? "课时学习中" : "待学课时",
        records: lesson ? [{ title: lesson.title, detail: `${lesson.courseTitle || "课程"} · ${asNumber(lesson.progressPercent)}%`, action: courseHref(lesson.courseId) }] : [],
        knowledge: completed ? lessonTopics([lesson]) : [],
        next: lessonNext(pendingLessons[0], "学习一个新的艺术课题"),
        action: courseHref(lesson?.courseId, lesson?.id),
        source: lesson ? { kind: "lesson", id: lesson.id, courseId: lesson.courseId, workflowId: lesson.workflowId } : null,
      };
      if (index === 3) ability.recordLabel = `已学 ${graph.summary.completedLessons} / 8 课时`;
    } else {
      const task = doneTasks[index - 1] ?? pendingTask ?? doneTasks[0];
      const completed = task?.status === "completed";
      ability = {
        headline: titleOf(task, index === 1 ? "完成一次实践任务" : "验证另一种创作方法"),
        topic: "通过实践验证所学",
        recordLabel: completed ? "任务已完成" : "待完成任务",
        records: task ? [{ title: task.title, detail: completed ? "学习任务已完成" : "学习任务待完成", action: "plan" }] : [],
        knowledge: [],
        next: { title: titleOf(pendingTask, "安排一项创作练习"), text: pendingTask ? "完成学习计划中的待办任务，再记录自己的方法和结果。" : "在学习计划中安排一个具体练习，将课程方法用于作品。", action: "plan" },
        action: "plan",
        source: task ? { kind: "task", id: task.id } : null,
      };
      ability.recordLabel = `完成 ${doneTasks.length} / ${index === 1 ? 1 : 2} 项`;
      if (doneTasks.length < (index === 1 ? 1 : 2)) {
        ability.headline = titleOf(pendingTask, index === 1 ? "完成一次实践任务" : "验证另一种创作方法");
        ability.topic = doneTasks[0] ? `已做：${titleOf(doneTasks[0], "学习任务")}` : "把所学用于创作";
      }
    }
    const run = index === 0 ? graph.runs[0] : index === 2 ? distinctRuns[1] : doneRuns[index === 3 ? 3 : 0] ?? pendingRun ?? graph.runs[0];
    const tools = {
      headline: run?.workflowName || (index >= 2 ? "尝试另一种工作流" : "体验创作工作流"),
      topic: run?.category || "平台内创作实践",
      recordLabel: run?.status === "completed" ? "工作流已完成" : run ? "已尝试工作流" : "待体验工作流",
      records: run ? [{ title: run.workflowName || "平台工作流", detail: run.status === "completed" ? "已完成" : run.status === "failed" ? "未成功完成" : "有运行记录，尚未完成", action: runHref(run) }] : [],
      knowledge: [],
      next: { title: pendingRun?.workflowName || (index >= 2 ? "对比一种新的创作工作流" : "完成一次工作流实践"), text: pendingRun ? "继续未完成的工作流，并回看每一步的输入和输出。" : "进入设计工具选择工作流，将所学方法转化为实际结果；外部工具使用尚未接入。", action: pendingRun ? runHref(pendingRun) : "/studio" },
      action: run ? runHref(run) : "/studio",
      source: run ? { kind: "run", id: run.id, workflowId: run.workflowId } : null,
    };
    if (index === 2) tools.recordLabel = `尝试 ${distinctRuns.length} / 2 种`;
    if (index === 3) {
      tools.recordLabel = `完成 ${doneRuns.length} / 4 次`;
      if (doneRuns.length < 4) {
        tools.headline = pendingRun?.workflowName || "对比不同创作方案";
        tools.topic = run?.workflowName ? `已用：${run.workflowName}` : "反复验证方法";
      }
    }
    const isNotes = index < 2;
    const growthRecord = isNotes ? graph.notes[index] ?? graph.notes[0] : graph.works[index - 2] ?? graph.works[0];
    const growth = {
      headline: titleOf(growthRecord, isNotes ? "写下学习观察" : "保存一件个人作品"),
      topic: growthRecord ? isNotes ? growthRecord.courseTitle || "方法与创作反思" : growthRecord.discipline || "个人创作记录" : isNotes ? "记录方法与疑问" : "把所学转化为作品",
      recordLabel: growthRecord ? isNotes ? "已写学习笔记" : "已保存作品" : isNotes ? "待记录笔记" : "待保存作品",
      records: (isNotes ? graph.notes : graph.works).map((item) => ({ title: titleOf(item, "未命名记录"), detail: isNotes ? item.courseTitle || "学习笔记" : item.status === "approved" ? "已发布作品" : "已保存作品，未发布", action: isNotes ? "notes" : "works" })),
      knowledge: [],
      next: { title: isNotes ? "记录下一次学习的收获" : "保存作品并写一条复盘", text: isNotes ? "写下本次课程或工作流中的观察、方法与待解决的问题。" : "将实践结果保存为作品，再用笔记说明方法和改进方向。", action: isNotes ? "notes" : "works" },
      action: isNotes ? "notes" : "works",
      source: growthRecord ? { kind: isNotes ? "note" : "work", id: growthRecord.id, courseId: growthRecord.courseId, lessonId: growthRecord.lessonId } : null,
    };
    if (index === 1) {
      growth.recordLabel = `已写 ${graph.notes.length} / 2 篇`;
      if (graph.notes.length < 2) {
        growth.headline = "再写一篇学习复盘";
        growth.topic = growthRecord ? `已有：${growthRecord.title}` : "记录工具与方法";
      }
    }
    if (index === 3) {
      growth.recordLabel = "作品与反思积累";
      growth.headline = stage.cells[3].ratio < 1 ? "持续创作与复盘" : titleOf(growthRecord, "持续创作与复盘");
      growth.topic = `作品 ${graph.works.length} / 2 · 笔记 ${graph.notes.length} / 3`;
    }
    result[stage.id] = [map, ability, tools, growth];
  });
  return result;
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
