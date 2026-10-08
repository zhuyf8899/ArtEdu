// 通用课程图谱：人工核对用户提供的《AI课程设计》十个目录后提炼。
// atlas ID 不是数据库课程 ID；推荐关系和练习是编辑建议，不是原书的先修要求。
// 原始 PDF 仅在本地私有目录核对，不进入代码、静态资源或下载接口。
import { courseKnowledge } from "./courseKnowledge.js";
export const atlasVersion = "2026-10-08-course-maps";
export const atlasDomains = [
  { id: "foundation", label: "设计基础" },
  { id: "method", label: "方法与体验" },
  { id: "visual", label: "视觉表达" },
  { id: "interaction", label: "交互实践" },
  { id: "material", label: "材料与造型" },
];

const source = (id, title, inspected) => ({ id, title, inspected });
export const atlasCourses = [
  {
    id: "atlas-thinking", title: "设计思维与问题建构", lines: ["设计思维", "与问题建构"], domain: "foundation", x: 135, y: 215,
    cue: "观察 · 质疑 · 重构", summary: "从日常观察出发，重新理解问题，建立自己的设计思考方式。",
    knowledge: ["设计思维与方法论", "质疑、反思与问题重构", "发散思维与系统思维", "日常用品的再设计"],
    sources: [source("s18", "设计思维与方法", "PDF 第 9–10 页目录、第 12–20 页概念与学习方法"), source("s19", "设计中的设计", "内容简介与再设计章节目录")],
    exercise: "选择一件日常用品，记录使用中的不便，从不同角度写出三个可以验证的设计问题。",
    outcome: "一张问题定义卡：使用者、情境、问题与验证方式。",
    aiPractice: "让 AI 提出不同的问题表述，再用真实观察逐项核对；不要把推测当作用户事实。", searchTerm: "设计思维",
  },
  {
    id: "atlas-semiotics", title: "设计理论之符号学原理", lines: ["设计理论", "符号学原理"], domain: "foundation", x: 135, y: 495,
    cue: "符号 · 意义 · 语境", summary: "理解视觉形式如何承载意义，辨别符号在不同语境中的解读。",
    knowledge: ["能指与所指", "意指作用", "组合段与系统", "外延与内涵"],
    sources: [source("s20", "符号学原理（结构主义文学理论文选）", "PDF 第 129 页起的《符号学原理》及其分节目录")],
    exercise: "选择三个图标或视觉符号，比较它们的形式、含义和文化语境。",
    outcome: "一张符号分析表，说明同一符号为何可能有不同解读。",
    aiPractice: "用 AI 比较符号解释，保留文化语境与人工判断，检查刻板印象。", searchTerm: "符号",
  },
  {
    id: "atlas-methods", title: "设计方法与策略", lines: ["设计方法", "与策略"], domain: "method", x: 405, y: 205,
    cue: "研究 · 构思 · 评估", summary: "把问题转为可执行的研究、构思和评估流程，选择合适的方法。",
    knowledge: ["用户观察与访谈", "问题界定与要求清单", "头脑风暴与形态分析", "原型评估与方案决策"],
    sources: [source("s21", "设计方法与策略：代尔夫特设计指南", "PDF 第 4–5 页方法目录")],
    exercise: "围绕一个设计问题，选择研究、构思、评估各一种方法，说明选择理由。",
    outcome: "一份三步设计方案，附每一步要收集的证据。",
    aiPractice: "请 AI 帮你整理备选方法与访谈提纲，实际访谈和验证仍由你完成。", searchTerm: "设计方法",
  },
  {
    id: "atlas-ux", title: "用户体验设计", lines: ["用户体验", "设计"], domain: "method", x: 405, y: 495,
    cue: "需求 · 架构 · 体验", summary: "从用户需求到视觉呈现，理解体验设计各层之间的关系。",
    knowledge: ["用户需求与产品目标", "战略、范围与结构层", "框架层与线框图", "表现层与视觉一致性"],
    sources: [source("s01", "以用户为中心的系统设计", "封面、前言：用户、认知与系统设计的关系"), source("s02", "用户体验的要素", "PDF 第 16–18 页五层模型目录")],
    exercise: "选择一个常用服务，用五层模型检查需求、功能、导航和视觉呈现是否一致。",
    outcome: "一张体验诊断表与一个改进后的低保真页面。",
    aiPractice: "用 AI 辅助整理需求和体验检查项；对目标用户的判断要以调研为依据。", searchTerm: "用户体验",
  },
  {
    id: "atlas-type", title: "字体与版式设计", lines: ["字体与", "版式设计"], domain: "visual", x: 710, y: 160,
    cue: "网格 · 层级 · 节奏", summary: "让文字、图像与留白形成清晰的阅读秩序，提升表达的可读性。",
    knowledge: ["网格与版心结构", "字体、行距与栏宽", "比例、对比与视觉层级", "文本与形式的统一"],
    sources: [source("s16", "平面设计中的网格系统", "PDF 第 6 页目录"), source("s17", "文字设计", "PDF 第 6 页中英文章节目录")],
    exercise: "将同一段文字分别排成两种网格，比较标题层级、行距和留白。",
    outcome: "两张版式对照稿与选择理由。",
    aiPractice: "让 AI 提供排版检查清单，最终在真实尺寸下检查字距、层级和可读性。", searchTerm: "版式",
  },
  {
    id: "atlas-data", title: "信息可视化与数据叙事", lines: ["信息可视化", "与数据叙事"], domain: "visual", x: 975, y: 160,
    cue: "数据 · 关系 · 叙事", summary: "用恰当的图形结构表达数据与关系，让信息可以被理解而非只被观看。",
    knowledge: ["信息图表的形式与功能", "视觉编码与图表选择", "树状、网络与关联结构", "从信息表现到解读"],
    sources: [source("s12", "不只是美：信息图表设计原理与经典案例", "PDF 第 19–22 页目录"), source("s13", "视觉繁美：信息可视化方法与案例解析", "PDF 第 22 页网络模型与视觉语言目录"), source("s14", "从表现到解读：谈信息图形设计的特征", "全文 3 页"), source("s15", "论信息图形", "篇名、页面预览")],
    exercise: "选择一组来源明确的数据，先写要回答的问题，再比较两种图表表达。",
    outcome: "一张标注数据来源、单位和主要发现的信息图。",
    aiPractice: "请 AI 辅助提出图表方案；核对数据、尺度与解释，避免编造和误导。", searchTerm: "可视化",
  },
  {
    id: "atlas-interaction", title: "交互设计", lines: ["交互", "设计"], domain: "interaction", x: 710, y: 360,
    cue: "目标 · 场景 · 原型", summary: "从人物目标与情境出发，设计可理解、可操作的行为流程。",
    knowledge: ["目标导向设计", "人物模型与用户目标", "场景与设计需求", "交互框架与行为反馈"],
    sources: [source("s24", "About Face 4：交互设计精髓", "PDF 第 21–24 页目标、研究、人物模型与框架目录")],
    exercise: "围绕一个用户目标，绘制主要任务流程和一个可点击的原型。",
    outcome: "一条完整任务路径，包含成功反馈与异常情况。",
    aiPractice: "让 AI 辅助检查流程遗漏；用实际操作测试验证，不以生成代码代替体验评估。", searchTerm: "交互",
  },
  {
    id: "atlas-arduino", title: "实体交互之Arduino实操", lines: ["实体交互", "Arduino 实操"], domain: "interaction", x: 975, y: 360,
    cue: "输入 · 输出 · 调试", summary: "把感知与反馈带入实体装置，理解硬件输入、程序逻辑和输出之间的关系。",
    knowledge: ["Arduino 平台与基础电路", "数字输入输出与通信", "模拟输入与传感器", "驱动输出、测试与代码优化"],
    sources: [source("s03", "爱上 Arduino（第 3 版）", "PDF 第 16–18 页平台、传感器与输入输出目录"), ...["Drivers and Output", "Optimise your code", "Analog Input and Sensors", "Digital Communication and Test", "Knowing InnoKit", "Output and Input", "The First Electric Circuit"].map((title, i) => source(`s${String(i + 4).padStart(2, "0")}`, `交互技术一-${i + 1}：${title}`, "讲义首页与课堂内容"))],
    exercise: "在教师指导下完成一个传感器输入与灯光输出的小实验，记录调试过程。",
    outcome: "一张连接示意图、一段带注释的程序与测试记录。",
    aiPractice: "用 AI 辅助解释代码；通电前由教师检查电路与元件规格，不直接照搬生成接线。", searchTerm: "Arduino",
  },
  {
    id: "atlas-form", title: "陶瓷造型设计", lines: ["陶瓷造型", "设计"], domain: "material", x: 710, y: 585,
    cue: "比例 · 功能 · 形态", summary: "结合生活需求和工艺条件，理解陶瓷器物的形态与艺术规律。",
    knowledge: ["造型部位与功能分析", "造型与生活、工艺的关系", "变化统一与比例尺度", "纸面作业与实体作业"],
    sources: [source("s11", "陶瓷造型基础", "PDF 第 4–5 页造型常识、艺术规律与作业方法目录")],
    exercise: "为一个明确的使用场景设计器物，比较三个轮廓与比例方案。",
    outcome: "一份造型草图，标注尺寸、用途和拟采用的成型方式。",
    aiPractice: "用 AI 辅助发散造型方案；图像只能作草图参考，工艺可行性需人工确认。", searchTerm: "陶瓷",
  },
  {
    id: "atlas-ceramics", title: "陶瓷材料工艺与实践", lines: ["陶瓷材料工艺", "与实践"], domain: "material", x: 975, y: 585,
    cue: "材料 · 成型 · 釉烧", summary: "理解黏土、成型、釉面与烧制的联系，将造型想法转为可验证的实践。",
    knowledge: ["黏土、工具与安全流程", "手工、模具与拉坯成型", "釉料与表层效果", "试釉、烧制与结果记录"],
    sources: [source("s22", "陶艺制作圣经：从材料到制作工艺的完全指南", "PDF 第 4–5 页材料、塑形、釉色及烧制目录"), source("s23", "陶艺的釉", "PDF 第 9–11 页原料、釉层与试验方法目录")],
    exercise: "在教师指导下比较材料或成型试样，记录方法与结果；烧制遵守工作室安全规程。",
    outcome: "一份材料实验记录，附试样照片与工艺参数。",
    aiPractice: "用 AI 辅助整理实验记录，不把生成的配方、烧制参数当作已验证工艺。", searchTerm: "陶艺",
  },
];

// 有向边表示编辑建议的推进方向；迁移边表示知识在不同方向的复用。
// 全部边都是推荐，不依赖用户学习事件，也不宣称教材规定了课程先修关系。
export const atlasRelations = [
  { from: "atlas-thinking", to: "atlas-semiotics", kind: "route", reason: "明确问题后，进一步理解视觉符号表达的意义与语境。" },
  { from: "atlas-thinking", to: "atlas-methods", kind: "route", reason: "先明确问题，再选择研究与构思方法。" },
  { from: "atlas-thinking", to: "atlas-ux", kind: "route", reason: "把问题放到具体用户和使用情境中理解。" },
  { from: "atlas-semiotics", to: "atlas-type", kind: "transfer", reason: "用符号意义和语境检查视觉表达是否恰当。" },
  { from: "atlas-methods", to: "atlas-type", kind: "route", reason: "将研究与构思转为有阅读秩序的视觉方案。" },
  { from: "atlas-type", to: "atlas-data", kind: "route", reason: "用网格、层级与对比组织数据和叙事。" },
  { from: "atlas-ux", to: "atlas-interaction", kind: "route", reason: "把需求和信息架构进一步落实为任务流程。" },
  { from: "atlas-interaction", to: "atlas-arduino", kind: "route", reason: "把屏幕上的行为反馈延伸到实体输入与输出。" },
  { from: "atlas-methods", to: "atlas-form", kind: "route", reason: "从情境与方案评估进入器物功能和造型设计。" },
  { from: "atlas-form", to: "atlas-ceramics", kind: "route", reason: "用材料和工艺试验验证造型的实现条件。" },
  { from: "atlas-ux", to: "atlas-data", kind: "transfer", reason: "依据受众和阅读任务选择信息表达方式。" },
  { from: "atlas-semiotics", to: "atlas-form", kind: "transfer", reason: "从文化语境理解器物形式与意义。" },
  { from: "atlas-data", to: "atlas-interaction", kind: "transfer", reason: "把静态信息表达延伸为可探索的信息交互。" },
];

export function findAtlasCourses(query = "", domain = "all") {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return atlasCourses.filter((course) => {
    const concepts = courseKnowledge[course.id]?.branches.flatMap((b) => [b.title, ...b.points.map((p) => p.title)]) ?? [];
    const text = [course.title, course.summary, ...course.knowledge, ...concepts, ...course.sources.map((s) => s.title)].join(" ").toLocaleLowerCase();
    return (domain === "all" || course.domain === domain) && terms.every((term) => text.includes(term));
  });
}

export function atlasNeighbors(id) {
  return atlasRelations.filter((edge) => edge.from === id || edge.to === id).map((edge) => ({
    ...edge, direction: edge.from === id ? "next" : "before",
    course: atlasCourses.find((course) => course.id === (edge.from === id ? edge.to : edge.from)),
  }));
}

// Cut edges at circle boundaries, not their centers. Separate outer routes avoid crossing node labels.
export function atlasEdgePath(edge) {
  const a = atlasCourses.find((c) => c.id === edge.from);
  const b = atlasCourses.find((c) => c.id === edge.to);
  if (!a || !b) return "";
  if (edge.from === "atlas-semiotics" && edge.to === "atlas-type") return `M ${a.x + 76} ${a.y} C 250 495, 220 90, ${b.x - 78} ${b.y}`;
  if (edge.from === "atlas-ux" && edge.to === "atlas-data") return `M ${a.x + 76} ${a.y} C 560 495, 540 80, 838 80 S 970 75, ${b.x} ${b.y - 78}`;
  if (edge.from === "atlas-semiotics" && edge.to === "atlas-form") return `M ${a.x} ${a.y + 76} C 135 680, 580 690, ${b.x - 78} ${b.y}`;
  const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
  const start = { x: a.x + dx / distance * 76, y: a.y + dy / distance * 76 };
  const end = { x: b.x - dx / distance * 80, y: b.y - dy / distance * 80 };
  return `M ${start.x} ${start.y} C ${start.x + dx * .35} ${start.y}, ${end.x - dx * .35} ${end.y}, ${end.x} ${end.y}`;
}
