// Course-specific, manually curated concept trees. Short explanations are editorial
// summaries of inspected contents, not textbook quotations or a certified syllabus.
// Practice tasks and their edges are platform suggestions, never learning evidence.
const point = (title, summary) => ({ title, summary });
const branch = (key, title, sources, points) => ({ key, title, sources, points });
const practice = (key, title, groups, instruction, outcome) => ({ key, title, groups, instruction, outcome });

export const courseKnowledge = {
  "atlas-thinking": {
    focus: "先形成问题意识，再选择思考方法，最后回到日常设计。",
    branches: [
      branch("question", "问题与反思", ["s18"], [point("设计的目的", "区分解决问题、表达观点和改变体验等不同设计目的。"), point("质疑与反思", "检查习惯性的判断，区分已观察到的现象与自己的假设。"), point("问题重构", "更换看待问题的角度，明确需要进一步验证的提问。")]),
      branch("thinking", "思维与方法", ["s18"], [point("突破思维定势", "尝试不同观察维度，不把第一个方案当作唯一答案。"), point("联想与发散", "通过联想寻找多个方向，再说明各方向的差异。"), point("系统与综合", "将使用者、情境与设计条件放在一起考虑。")]),
      branch("everyday", "日常再设计", ["s19"], [point("日常用品观察", "从熟悉的器物和使用行为中寻找被忽略的设计问题。"), point("感官与信息传达", "思考形式如何通过视觉、触觉等感官传递信息。")]),
    ],
    practices: [practice("definition", "问题定义卡", ["question", "thinking"], "观察一件日常用品，记录一个事实、两个假设和三个问题表述。", "一张问题定义卡，标明哪些判断还需要验证。"), practice("redesign", "日常用品再设计", ["everyday"], "选取一个问题，画出两种改进方案，说明体验发生了什么变化。", "两张草图与一段方案比较说明。")],
  },
  "atlas-semiotics": {
    focus: "从符号的形式与意义，走向组合关系和语境解释。",
    branches: [
      branch("sign", "符号与意指", ["s20"], [point("能指与所指", "区分可感知的符号形式与它指向的意义，避免把二者混为一谈。"), point("意指作用", "关注形式与意义如何在特定符号系统中建立联系。"), point("符号的价值", "结合系统中的其他符号理解一个符号的差异与位置。")]),
      branch("system", "组合与系统", ["s20"], [point("组合段", "观察符号如何在实际表达中排列、连接并构成整体。"), point("系统与替换", "比较可替换的符号，观察替换后表达发生的变化。")]),
      branch("meaning", "意义的层次", ["s20"], [point("外延", "描述符号直接指向的对象或概念。"), point("内涵", "分析文化和情境中附加的联想，区分解读与事实。")]),
    ],
    practices: [practice("analysis", "视觉符号分析", ["sign", "meaning"], "选择一个公共图标，分别记录形式、直接含义与不同语境中的联想。", "一张有语境说明的符号分析表。"), practice("replace", "符号替换实验", ["system"], "在一组视觉表达中替换一个符号，比较整体含义的变化。", "两组对照图和替换理由。")],
  },
  "atlas-methods": {
    focus: "根据任务选择研究、定义、构思与评估方法，而非照搬固定流程。",
    branches: [
      branch("research", "探索与研究", ["s21"], [point("用户观察", "观察实际行为与使用情境，记录而不是猜测需求。"), point("访谈与旅程", "用访谈及体验路径整理用户遇到的问题。"), point("情境与趋势", "结合环境变化和设计情境判断问题的范围。")]),
      branch("define", "定义设计问题", ["s21"], [point("场景与问题界定", "描述为谁、在什么情境中解决什么问题。"), point("要求清单", "把设计目标转为可以检查的条件，并说明优先级。")]),
      branch("ideas", "构思与开发", ["s21"], [point("头脑风暴", "先生成多个想法，再进行分类与讨论。"), point("形态分析", "拆分方案维度，组合不同选项寻找设计可能性。"), point("提问与转换", "通过不同提问方式改变观察角度，避免只改外观。")]),
      branch("evaluate", "评估与展示", ["s21"], [point("可用性与概念评估", "根据任务和要求比较方案，说明评估证据。"), point("决策与原型展示", "用决策工具说明取舍，并用模型或手绘表达方案。")]),
    ],
    practices: [practice("research-plan", "研究计划", ["research", "define"], "为一个真实问题安排观察和访谈，写出要求清单。", "一份研究计划与带优先级的要求清单。"), practice("decision", "方案比较", ["ideas", "evaluate"], "提出三种方案，按同一组要求进行对照，不只比较好看与否。", "一张方案评估表及一份原型说明。")],
  },
  "atlas-ux": {
    focus: "以五层模型组织体验：目标、范围、结构、框架、表现。",
    branches: [
      branch("strategy", "战略层", ["s02"], [point("产品目标", "说明服务希望实现的目标，并与用户目标区分。"), point("用户需求", "识别目标用户在具体情境中的需求，以调研支持判断。")]),
      branch("scope", "范围层", ["s02"], [point("功能规格", "明确产品需要提供的能力，不把功能清单等同于用户价值。"), point("内容需求与优先级", "说明需要哪些内容以及哪些应优先提供。")]),
      branch("structure", "结构层", ["s02"], [point("信息架构", "组织内容之间的关系，帮助用户理解和查找。"), point("交互结构", "梳理用户行为和系统响应的关系。")]),
      branch("skeleton", "框架层", ["s02"], [point("界面与导航", "安排控制项与导航，让任务路径更清楚。"), point("信息设计与线框图", "用线框图检查内容顺序与布局，而非提前追求视觉装饰。")]),
      branch("surface", "表现层", ["s02"], [point("视觉对比", "用对比突出关键内容，避免层级混乱。"), point("视觉一致性", "协调配色、排版和风格，保持体验的一致。")]),
    ],
    practices: [practice("layers", "五层体验诊断", ["strategy", "scope", "structure"], "选择一个常用服务，检查目标、功能和结构是否一致。", "一张五层体验检查表，区分事实与待验证判断。"), practice("wireframe", "页面改进原型", ["skeleton", "surface"], "针对一个发现的问题绘制线框图，再检查视觉层级。", "一张改进前后的页面对照图及理由。")],
  },
  "atlas-type": {
    focus: "从网格组织、文字尺度到视觉节奏，建立清晰的阅读秩序。",
    branches: [
      branch("grid", "网格与结构", ["s16"], [point("版心与页边距", "安排页面的内容范围和留白，建立稳定的阅读边界。"), point("栏宽与网格", "用栏与网格协调文字和图像的位置。"), point("图文组织", "比较图像、正文与标题在网格中的关系。")]),
      branch("text", "文字与尺度", ["s16", "s17"], [point("字体与标题", "选择适合内容的字体，区分正文与标题的角色。"), point("行距与度量", "在真实尺寸下检查行距、字形和阅读密度。"), point("比例与对比", "用大小、重量与空间差异建立内容层级。")]),
      branch("expression", "形式与节奏", ["s17"], [point("文本与形式统一", "让视觉形式支持内容含义，而不是掩盖信息。"), point("灰度与节奏", "通过文字密度与留白形成稳定、可读的视觉节奏。")]),
    ],
    practices: [practice("comparison", "版式对照练习", ["grid", "text", "expression"], "用同一段文字和图片制作两种网格，比较标题、行距与留白。", "两张版式稿与一份真实尺寸的可读性检查。")],
  },
  "atlas-data": {
    focus: "先确定信息任务，再选择图形结构，并检查读者是否正确理解。",
    branches: [
      branch("purpose", "信息与功能", ["s12"], [point("形式与功能", "让信息表达形式服务于问题，而非仅作为装饰。"), point("视觉任务", "明确读者需要比较、查找还是理解关联。")]),
      branch("perception", "视觉与感知", ["s12"], [point("图表形式选择", "依据阅读任务和数据特点选择合适的表达。"), point("相似与邻近", "利用视觉分组帮助理解，检查是否产生错误关联。"), point("信息层级", "协调细节与整体，让主要发现能够被辨认。")]),
      branch("network", "树状与网络", ["s13"], [point("树状层级", "用层次组织有归属关系的信息。"), point("网络关联", "展示对象之间的连接，并解释连接代表什么。"), point("时间与分组", "结合时间和分组检查关联变化，不把相关误作因果。")]),
      branch("read", "解读与交互", ["s12", "s14"], [point("从表现到解读", "说明图形如何帮助读者理解信息，而非只展示结果。"), point("交互与反馈", "为探索过程提供清楚的反馈，避免用户失去阅读上下文。")]),
    ],
    practices: [practice("chart", "信息图对照", ["purpose", "perception"], "使用一组来源明确的数据，比较两种表达能否回答同一个问题。", "标注来源、单位与解释的信息图。"), practice("relations", "关系叙事图", ["network", "read"], "选取真实关系数据，画出层级或网络，说明连接和阅读路径。", "一张关系图与一段不夸大结论的解读。")],
  },
  "atlas-interaction": {
    focus: "围绕用户目标，将研究转为人物模型、场景、行为框架与验证。",
    branches: [
      branch("research", "目标与研究", ["s24"], [point("目标与任务", "区分用户想达到的结果与完成结果所需的操作。"), point("访谈与观察", "从真实情境收集行为和目标证据。")]),
      branch("persona", "人物模型", ["s24"], [point("行为变量", "寻找与目标相关的行为差异，不用人口标签代替用户研究。"), point("模型与用户目标", "基于研究建立人物模型，明确其主要目标。")]),
      branch("scenario", "场景与需求", ["s24"], [point("情境场景", "描述用户在什么情境下完成何种目标。"), point("需求不是功能", "先解释用户需要什么，再讨论功能如何支持。"), point("场景到需求", "从场景中提炼需要满足的设计条件。")]),
      branch("framework", "框架与验证", ["s24"], [point("交互框架", "组织关键行为、页面关系和主要任务路径。"), point("原型与测试", "用原型检查任务能否完成，记录反馈与问题。")]),
    ],
    practices: [practice("persona-task", "人物与场景卡", ["research", "persona", "scenario"], "围绕一个真实目标整理人物、场景和需求，标注研究证据。", "一组人物与场景卡，不把假设写成调研事实。"), practice("prototype", "任务路径原型", ["framework"], "为一个主要任务绘制可点击原型，记录一次操作测试。", "任务流程、原型与问题记录。")],
  },
  "atlas-arduino": {
    focus: "从平台和电路出发，把输入、通信与输出组织为可调试的实体交互。",
    branches: [
      branch("circuit", "平台与电路", ["s03", "s08", "s10"], [point("Arduino 与 IDE", "认识硬件平台、编程环境和程序的基本运行方式。"), point("基础电路与安全", "在教师检查下理解元件、接地与连接，不直接照搬生成接线。")]),
      branch("io", "数字输入输出", ["s03", "s09", "s10"], [point("按键与数字输入", "将输入状态与程序判断联系起来。"), point("LED 与数字输出", "用可观察的输出检查程序逻辑。"), point("PWM 与灯光", "理解输出控制与亮度变化的联系，核对元件规格。")]),
      branch("sensors", "模拟与传感器", ["s03", "s06"], [point("模拟输入与数值", "理解连续变化如何被读取为数值，检查读数范围。"), point("传感器与响应", "把环境变化转为交互输入，并测试响应是否稳定。")]),
      branch("drivers", "通信与驱动", ["s07", "s04"], [point("串行通信与测试", "利用通信信息观察运行状态，定位问题。"), point("驱动与执行器", "区分控制信号与负载驱动，由教师确认电气条件。")]),
      branch("code", "程序与调试", ["s05", "s10"], [point("变量与作用域", "记录数据如何存储与使用，检查变量的可见范围。"), point("表达式与流程", "梳理判断、循环和函数，让程序逻辑可解释。"), point("测试与优化", "逐步验证输入和输出，记录修改前后的表现。")]),
    ],
    practices: [practice("blink", "输入输出小实验", ["circuit", "io"], "在教师检查电路后，用一个输入控制可观察的灯光变化。", "接线示意、带注释程序与测试记录。"), practice("sensor", "传感器交互实验", ["sensors", "drivers", "code"], "在教师指导下记录传感器读数与输出，使用通信信息定位异常。", "一份输入、逻辑、输出对应的调试表。")],
  },
  "atlas-form": {
    focus: "联系使用场景、材料工艺和造型规律，形成可验证的器物方案。",
    branches: [
      branch("parts", "造型与功能", ["s11"], [point("器物部位", "识别器物各部位以及部位之间的关系。"), point("功能与分析", "结合使用要求分析形态，不只描述外观。")]),
      branch("life", "生活与文化", ["s11"], [point("使用要求", "从生活情境判断器物需要怎样的形态与尺度。"), point("文化与形式", "理解不同文化、历史与生活方式对造型的影响。")]),
      branch("laws", "造型艺术规律", ["s11"], [point("变化与统一", "在形态差异与整体秩序之间寻找协调。"), point("比例与尺度", "比较部位比例和使用尺度，说明取舍理由。"), point("稳定与生动", "观察造型的视觉平衡与动态感。")]),
      branch("making", "工艺与作业", ["s11"], [point("材料与造型", "将材料和工艺条件作为造型设计的约束。"), point("纸面与实体作业", "先通过草图比较，再用实体作业验证空间形态。")]),
    ],
    practices: [practice("sketch", "器物造型方案", ["parts", "life", "laws"], "为一个明确场景比较三种轮廓，标出功能部位和尺度。", "三张有尺寸、用途与比例说明的草图。"), practice("model", "造型验证模型", ["making"], "在教师指导下制作安全的形态模型，检查草图与实体的差异。", "模型照片与一份形态修订记录。")],
  },
  "atlas-ceramics": {
    focus: "区分材料准备、成型方法、釉面效果与试验记录；操作须遵守工作室安全规程。",
    branches: [
      branch("material", "材料与工具", ["s22"], [point("黏土与准备", "认识黏土类型和准备方法，记录所用材料。"), point("工具与安全", "识别工作室工具及安全要求，由教师确认操作条件。")]),
      branch("forming", "成型方法", ["s22"], [point("手工成型", "比较泥条、捏塑与泥板等方法的形态特点。"), point("模具与注浆", "理解模具和注浆的基本作用与适用场景。"), point("拉坯与修坯", "认识轮制成型与后续修整的关系，在指导下练习。")]),
      branch("glaze", "釉料与表层", ["s22", "s23"], [point("原料与釉层", "认识釉料组成和釉层，不把生成配方当作可直接使用的工艺。"), point("光泽与透明度", "比较透明、乳浊、有光和无光等表层效果。")]),
      branch("experiment", "试釉与记录", ["s23"], [point("点性与线性试验", "认识不同试验组织方式，记录变化条件。"), point("面性试验", "理解多因素试验的对照方式，不在图谱中提供操作配方。"), point("结果与应用", "记录试样结果与条件，区分一次观察和可重复结论。")]),
      branch("finish", "烧制与修饰", ["s22"], [point("烧制与窑炉", "认识烧制过程和窑炉类型，实际操作遵守工作室规程。"), point("装饰与修整", "比较表面装饰与烧制后的修整方式，由教师指导操作。")]),
    ],
    practices: [practice("sample", "成型试样比较", ["material", "forming"], "在教师指导下制作两种成型试样，记录形态差异和工具使用。", "试样照片、材料信息与制作记录。"), practice("glaze-record", "釉面试验档案", ["glaze", "experiment"], "整理工作室已有试样的条件和结果；未经教师确认不试配原料。", "一份有条件说明的釉面效果对照表。"), practice("process", "工艺过程复盘", ["finish"], "回看教师指导的制作过程，记录修整和安全检查点。", "一份工艺过程档案，不包含未经验证的烧制参数。")],
  },
};

export const courseKnowledgeCount = Object.values(courseKnowledge).reduce((total, graph) => total + graph.branches.reduce((n, b) => n + b.points.length, 0), 0);
export function courseAtlasUrl(id) { return `/my-learning?atlas=course&atlasCourse=${encodeURIComponent(id)}`; }

// The renderer shares a layout grammar, not the course contents or branch counts.
// Each branch has its own vertical lane; links route around circles, never through labels.
export function buildCourseGraph(course) {
  const graph = courseKnowledge[course?.id];
  if (!graph) return null;
  const width = Math.max(960, graph.branches.length * 250 + 60);
  const start = (width - (graph.branches.length - 1) * 250) / 2;
  const leafBottom = 450 + (Math.max(...graph.branches.map((b) => b.points.length)) - 1) * 145;
  const taskY = leafBottom + 230;
  const root = { id: `${course.id}:root`, kind: "root", title: course.title, summary: graph.focus, x: width / 2, y: 105, radius: 76, sources: course.sources.map((s) => s.id) };
  const nodes = [root], edges = [];
  const branchNodes = [];
  graph.branches.forEach((b, index) => {
    const x = start + index * 250;
    const group = { ...b, id: `${course.id}:branch:${b.key}`, kind: "branch", summary: `本主题包含 ${b.points.length} 个知识点。`, x, y: 295, radius: 63 };
    nodes.push(group); branchNodes.push(group);
    edges.push({ from: root.id, to: group.id, kind: "contains", reason: "课程包含此知识主题" });
    b.points.forEach((p, i) => {
      const child = { ...p, id: `${course.id}:point:${b.key}:${i}`, branchKey: b.key, kind: "point", sources: b.sources, x: x + (i % 2 ? 50 : -50), y: 450 + i * 145, radius: 56 };
      nodes.push(child);
      edges.push({ from: group.id, to: child.id, kind: "contains", reason: "主题包含此知识点", corridor: x + (i % 2 ? 122 : -122) });
    });
  });
  graph.practices.forEach((p, i) => {
    const task = { ...p, id: `${course.id}:practice:${p.key}`, kind: "practice", summary: p.instruction, sources: [], x: width * (i + 1) / (graph.practices.length + 1), y: taskY, radius: 65 };
    nodes.push(task);
    for (const key of p.groups) {
      const leaves = nodes.filter((n) => n.kind === "point" && n.branchKey === key);
      // The last displayed point is a route anchor, not a prerequisite or assessment criterion.
      const anchor = leaves.at(-1);
      edges.push({ from: anchor.id, to: task.id, kind: "practice", reason: "将本主题用于平台建议练习", branchKey: key, viaY: leafBottom + 105 });
    }
  });
  return { ...graph, width, height: taskY + 100, nodes, edges, branches: branchNodes, pointCount: nodes.filter((n) => n.kind === "point").length };
}

export function courseGraphPath(graph, edge) {
  const a = graph.nodes.find((n) => n.id === edge.from), b = graph.nodes.find((n) => n.id === edge.to);
  if (!a || !b) return "";
  if (edge.corridor !== undefined) {
    const sign = edge.corridor > a.x ? 1 : -1;
    return `M ${a.x + sign * a.radius} ${a.y} C ${edge.corridor} ${a.y}, ${edge.corridor} ${b.y}, ${b.x + sign * (b.radius + 3)} ${b.y}`;
  }
  const start = a.y + a.radius, end = b.y - b.radius - 4;
  const mid = edge.viaY ?? (start + end) / 2;
  if (edge.kind === "practice") return `M ${a.x} ${start} C ${a.x} ${start + 40}, ${a.x} ${mid}, ${a.x} ${mid} C ${b.x} ${mid}, ${b.x} ${mid}, ${b.x} ${end}`;
  return `M ${a.x} ${start} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${end}`;
}
