import type {
  ContentReview,
  Enrollment,
  GenerationOutput,
  LearningContent,
  ResourceFile,
  Review,
  Subject,
  Tag,
  User,
} from "../domain/types.js";

export const users: User[] = [
  { id: "U-1042", name: "林知夏", initials: "林", department: "信息艺术设计", identity: "学生", status: "active", plan: "教学基础", dailyLimit: 30, dailyUsed: 8, monthlyLimit: 600, monthlyUsed: 428, concurrentLimit: 2, activeTasks: 0, works: 12, lastActive: "2 分钟前" },
  { id: "U-1038", name: "陈明远", initials: "陈", department: "视觉传达", identity: "学生", status: "active", plan: "教学进阶", dailyLimit: 60, dailyUsed: 12, monthlyLimit: 1200, monthlyUsed: 1018, concurrentLimit: 3, activeTasks: 1, works: 24, lastActive: "18 分钟前" },
  { id: "U-1029", name: "周可", initials: "周", department: "染织服装", identity: "学生", status: "active", plan: "教学基础", dailyLimit: 30, dailyUsed: 3, monthlyLimit: 600, monthlyUsed: 186, concurrentLimit: 2, activeTasks: 0, works: 12, lastActive: "1 小时前" },
  { id: "U-1016", name: "王雅琳", initials: "王", department: "视觉传达", identity: "教师", status: "active", plan: "教师账户", dailyLimit: 120, dailyUsed: 16, monthlyLimit: 3000, monthlyUsed: 1740, concurrentLimit: 5, activeTasks: 0, works: 38, lastActive: "今天 09:40" },
  { id: "U-1008", name: "赵子涵", initials: "赵", department: "工艺美术", identity: "学生", status: "limited", plan: "教学基础", dailyLimit: 10, dailyUsed: 10, monthlyLimit: 300, monthlyUsed: 300, concurrentLimit: 1, activeTasks: 0, works: 9, lastActive: "昨天 21:18" },
  { id: "U-0997", name: "刘思远", initials: "刘", department: "工业设计", identity: "学生", status: "suspended", plan: "已暂停", dailyLimit: 0, dailyUsed: 0, monthlyLimit: 0, monthlyUsed: 0, concurrentLimit: 0, activeTasks: 0, works: 4, lastActive: "8 月 24 日" }
];

export const reviews: Review[] = [
  { id: "CASE-0281", title: "生成式纹样：夏夜标本", author: "林知夏", department: "信息艺术设计", kind: "工作流案例", model: "Flux.1-dev", submittedAt: "今天 13:26", machineStatus: "机器预审通过", prompt: "以植物标本册为灵感，生成青绿色夜光纹样，保留手工丝网印刷的颗粒质感。", assets: 6, cover: "linear-gradient(135deg,#b9f5da,#0d7560)", status: "pending" },
  { id: "CASE-0279", title: "宋韵茶饮包装视觉提案", author: "周可", department: "染织服装", kind: "案例投稿", model: "Ideogram 3", submittedAt: "今天 11:02", machineStatus: "机器预审通过", prompt: "将宋代山水的留白与现代茶饮包装结合，输出三组正视图与材质说明。", assets: 4, cover: "linear-gradient(135deg,#f4dfb0,#9d6330)", status: "pending" },
  { id: "CASE-0274", title: "校园导视图标系统", author: "陈明远", department: "视觉传达", kind: "案例投稿", model: "Midjourney V6.1", submittedAt: "昨天 18:40", machineStatus: "需要人工复核", prompt: "面向新生的校园导视图标，统一线宽与圆角，覆盖教学楼、食堂、运动场等场景。", assets: 12, cover: "linear-gradient(135deg,#c6d5ff,#465dcf)", status: "pending" },
  { id: "CASE-0268", title: "工业机械品牌动态海报", author: "刘思远", department: "工业设计", kind: "课程作业", model: "GPT-4o + Flux", submittedAt: "8 月 25 日", machineStatus: "机器预审通过", prompt: "以精密制造和机械结构为核心，生成一组高对比黑白品牌海报。", assets: 3, cover: "linear-gradient(135deg,#ededed,#333)", status: "pending" }
];

export const models = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", capability: "创意规划 / 视觉理解", cost: 1, online: true },
  { id: "flux-1-dev", name: "Flux.1-dev", provider: "Black Forest Labs", capability: "高质量图像生成", cost: 2, online: true },
  { id: "midjourney-v6", name: "Midjourney V6.1", provider: "Midjourney", capability: "艺术图像生成", cost: 3, online: true },
  { id: "ideogram-3", name: "Ideogram 3", provider: "Ideogram", capability: "字体 / 海报生成", cost: 2, online: true }
];

export const workflows = [
  { id: "WF-001", title: "用 AI 生成 3 组视觉方向", category: "视觉传达", difficulty: "教师精选", duration: 16, users: "1.8k", progress: 38, steps: ["关键词拆解与风格定义", "初稿图案生成", "色彩系统调整", "丝巾版式适配", "最终导出与资产整理"] },
  { id: "WF-002", title: "从需求分析到交互原型", category: "UI 创作", difficulty: "新手友好", duration: 28, users: "2.9k", progress: 0, steps: ["拆解需求", "信息架构", "界面视觉", "交互原型"] },
  { id: "WF-003", title: "传统图案的生成式再设计", category: "染织服装", difficulty: "可做商稿", duration: 32, users: "1.2k", progress: 64, steps: ["文化母题研究", "纹样提示词", "连续图案生成", "材质模拟", "展示板输出"] }
];

export const resources = [
  { id: "R-101", title: "国潮茶饮包装：宋风意境", category: "视觉传达", type: "案例", author: "周可", views: 5513, likes: 743, model: "Ideogram 3", cover: "linear-gradient(135deg,#e6d7b5,#8d552e)" },
  { id: "R-102", title: "毕设海报：断裂与重建", category: "信息艺术", type: "案例", author: "陈明远", views: 3679, likes: 481, model: "Flux.1-dev", cover: "linear-gradient(135deg,#f2a9b9,#663752)" },
  { id: "R-103", title: "透明背景 Icon 生成指南", category: "UI 创作", type: "课程", author: "王雅琳", views: 2280, likes: 316, model: "GPT-4o", cover: "linear-gradient(135deg,#bde5ff,#456cdb)" },
  { id: "R-104", title: "传统纹样数字采样包", category: "工艺美术", type: "素材", author: "平台资源组", views: 8064, likes: 902, model: "—", cover: "linear-gradient(135deg,#f5d7ff,#7950a2)" }
];

export const subjects: Subject[] = [
  { id: "SUB-01", code: "visual-communication", name: "视觉传达", sortOrder: 1, enabled: true },
  { id: "SUB-02", code: "information-art", name: "信息艺术设计", sortOrder: 2, enabled: true },
  { id: "SUB-03", code: "fashion-textile", name: "染织服装", sortOrder: 3, enabled: true },
  { id: "SUB-04", code: "industrial-design", name: "工业设计", sortOrder: 4, enabled: true },
  { id: "SUB-05", code: "environment-art", name: "环境艺术", sortOrder: 5, enabled: true },
  { id: "SUB-06", code: "craft-art", name: "工艺美术", sortOrder: 6, enabled: true },
  { id: "SUB-07", code: "art-history", name: "艺术史论", sortOrder: 7, enabled: true },
  { id: "SUB-08", code: "interdisciplinary", name: "跨学科实验", sortOrder: 8, enabled: true },
];

export const tags: Tag[] = [
  { id: "TAG-TEACHER", name: "教师精选", kind: "feature" },
  { id: "TAG-BEGINNER", name: "新手友好", kind: "difficulty" },
  { id: "TAG-REMAKE", name: "可做同款", kind: "feature" },
  { id: "TAG-VIBE", name: "Vibe Coding", kind: "topic" },
  { id: "TAG-PATTERN", name: "纹样生成", kind: "topic" },
  { id: "TAG-BRAND", name: "品牌设计", kind: "topic" },
];

export const resourceFiles: ResourceFile[] = [
  { id: "FILE-001", name: "UI需求访谈模板.pdf", mimeType: "application/pdf", byteSize: 842311, storageKey: "courses/ui-research-template.pdf", url: "/demo-files/ui-research-template.pdf", safetyStatus: "safe", createdBy: "U-1016", createdAt: "2026-08-20T09:00:00.000Z" },
  { id: "FILE-002", name: "传统纹样采样包.zip", mimeType: "application/zip", byteSize: 12304871, storageKey: "courses/pattern-samples.zip", url: "/demo-files/pattern-samples.zip", safetyStatus: "safe", createdBy: "U-1016", createdAt: "2026-08-21T09:00:00.000Z" },
  { id: "FILE-003", name: "品牌视觉规范示例.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", byteSize: 5201081, storageKey: "courses/brand-guideline.pptx", url: "/demo-files/brand-guideline.pptx", safetyStatus: "safe", createdBy: "U-1016", createdAt: "2026-08-22T09:00:00.000Z" },
];

const now = "2026-08-29T10:00:00.000Z";

export const learningContents: LearningContent[] = [
  {
    id: "PROJECT-001", slug: "vibe-coding-ui-prototype", type: "project", title: "需求分析到交互原型的 Vibe Coding 路径",
    summary: "从用户访谈提炼需求、梳理任务流，到用 AI 编程工具生成可交互原型。", subjectIds: ["SUB-02"], tagIds: ["TAG-TEACHER", "TAG-VIBE"],
    instructorId: "U-1016", instructorName: "王雅琳", difficulty: "intermediate", estimatedMinutes: 90, cover: "UI", status: "published", featured: true, enrollmentCount: 9280, version: 3,
    steps: [
      { id: "P001-S1", title: "用户需求与访谈整理", summary: "使用模板整理访谈记录并提炼目标用户。", sortOrder: 1, kind: "resource", estimatedMinutes: 15, resourceFileIds: ["FILE-001"] },
      { id: "P001-S2", title: "任务流与信息架构", summary: "将需求转换为页面和任务流。", sortOrder: 2, kind: "lesson", estimatedMinutes: 20, resourceFileIds: [] },
      { id: "P001-S3", title: "AI 生成界面方向", summary: "进入工作流生成三组视觉方向。", sortOrder: 3, kind: "workflow", estimatedMinutes: 30, resourceFileIds: [], workflowId: "WF-002", modelIds: ["gpt-4o", "flux-1-dev"] },
      { id: "P001-S4", title: "提交可交互原型", summary: "整理结果并提交课程成果。", sortOrder: 4, kind: "assignment", estimatedMinutes: 25, resourceFileIds: [] },
    ], createdAt: now, updatedAt: now, publishedAt: now,
  },
  {
    id: "PROJECT-002", slug: "traditional-pattern-extension", type: "project", title: "传统图案拆解与纹样 AI 延展创作",
    summary: "将非遗纹样拆解为形态语素与配色规律，生成丝巾、包装和海报应用。", subjectIds: ["SUB-03", "SUB-06"], tagIds: ["TAG-REMAKE", "TAG-PATTERN"],
    instructorId: "U-1016", instructorName: "王雅琳", difficulty: "beginner", estimatedMinutes: 120, cover: "纹样", status: "published", featured: true, enrollmentCount: 6730, version: 2,
    steps: [
      { id: "P002-S1", title: "纹样文化母题研究", summary: "认识纹样来源与构成规则。", sortOrder: 1, kind: "resource", estimatedMinutes: 20, resourceFileIds: ["FILE-002"] },
      { id: "P002-S2", title: "生成连续纹样", summary: "使用工作流生成并比较不同方向。", sortOrder: 2, kind: "workflow", estimatedMinutes: 45, resourceFileIds: [], workflowId: "WF-003", modelIds: ["midjourney-v6", "ideogram-3"] },
      { id: "P002-S3", title: "应用与成果提交", summary: "完成应用样机并提交案例。", sortOrder: 3, kind: "assignment", estimatedMinutes: 55, resourceFileIds: [] },
    ], createdAt: now, updatedAt: now, publishedAt: now,
  },
  {
    id: "PROJECT-003", slug: "product-concept-render", type: "project", title: "产品概念草图到多角度 AI 渲染流程",
    summary: "上传产品草图，识别造型语言并生成多角度效果图。", subjectIds: ["SUB-04"], tagIds: ["TAG-TEACHER"],
    instructorId: "U-1016", instructorName: "王雅琳", difficulty: "intermediate", estimatedMinutes: 80, cover: "3D", status: "published", featured: true, enrollmentCount: 4510, version: 1,
    steps: [
      { id: "P003-S1", title: "草图上传与造型分析", summary: "上传草图并提取设计语言。", sortOrder: 1, kind: "workflow", estimatedMinutes: 35, resourceFileIds: [], workflowId: "WF-001", modelIds: ["gpt-4o"] },
      { id: "P003-S2", title: "多角度渲染与汇报", summary: "生成汇报级意向图。", sortOrder: 2, kind: "assignment", estimatedMinutes: 45, resourceFileIds: [] },
    ], createdAt: now, updatedAt: now, publishedAt: now,
  },
  {
    id: "COURSE-001", slug: "ai-ui-design", type: "course", title: "AI 辅助 UI 设计全流程",
    summary: "从需求到交互稿，再到 Vibe Coding 实现，完整贯通 AI 设计工作流。", subjectIds: ["SUB-02"], tagIds: ["TAG-TEACHER", "TAG-VIBE"],
    instructorId: "U-1016", instructorName: "王雅琳", difficulty: "intermediate", estimatedMinutes: 360, cover: "UI", status: "published", featured: true, enrollmentCount: 18000, version: 4,
    steps: Array.from({ length: 12 }, (_, index) => ({ id: `C001-S${index + 1}`, title: ["课程导览", "需求拆解", "信息架构", "界面风格", "组件系统", "提示词结构", "首屏生成", "页面迭代", "交互联调", "响应式适配", "设计验收", "成果发布"][index]!, summary: "完成本课时并记录学习结果。", sortOrder: index + 1, kind: index === 6 ? "workflow" : index === 11 ? "assignment" : "lesson", estimatedMinutes: 30, resourceFileIds: index === 1 ? ["FILE-001"] : [], workflowId: index === 6 ? "WF-002" : undefined, modelIds: index === 6 ? ["gpt-4o", "flux-1-dev"] : undefined })),
    createdAt: now, updatedAt: now, publishedAt: now,
  },
  {
    id: "COURSE-002", slug: "heritage-pattern-course", type: "course", title: "非遗纹样数字创作课",
    summary: "拆解传统纹样规律，用多模型延展为当代视觉应用。", subjectIds: ["SUB-03", "SUB-06"], tagIds: ["TAG-BEGINNER", "TAG-PATTERN"],
    instructorId: "U-1016", instructorName: "王雅琳", difficulty: "beginner", estimatedMinutes: 240, cover: "纹样", status: "published", featured: true, enrollmentCount: 9310, version: 2,
    steps: Array.from({ length: 8 }, (_, index) => ({ id: `C002-S${index + 1}`, title: `纹样创作第 ${index + 1} 课`, summary: "学习传统纹样数字化方法。", sortOrder: index + 1, kind: index === 5 ? "workflow" : index === 7 ? "assignment" : "lesson", estimatedMinutes: 30, resourceFileIds: index === 0 ? ["FILE-002"] : [], workflowId: index === 5 ? "WF-003" : undefined, modelIds: index === 5 ? ["midjourney-v6", "ideogram-3"] : undefined })),
    createdAt: now, updatedAt: now, publishedAt: now,
  },
  {
    id: "COURSE-003", slug: "brand-visual-system", type: "course", title: "品牌视觉系统速成课",
    summary: "从关键词到 Logo、主色板和字体搭配，形成完整品牌规范。", subjectIds: ["SUB-01"], tagIds: ["TAG-BEGINNER", "TAG-BRAND"],
    instructorId: "U-1016", instructorName: "王雅琳", difficulty: "beginner", estimatedMinutes: 270, cover: "品牌", status: "published", featured: false, enrollmentCount: 22000, version: 1,
    steps: Array.from({ length: 9 }, (_, index) => ({ id: `C003-S${index + 1}`, title: `品牌系统第 ${index + 1} 课`, summary: "建立可落地的品牌视觉系统。", sortOrder: index + 1, kind: index === 7 ? "workflow" : index === 8 ? "assignment" : "lesson", estimatedMinutes: 30, resourceFileIds: index === 0 ? ["FILE-003"] : [], workflowId: index === 7 ? "WF-001" : undefined, modelIds: index === 7 ? ["gpt-4o", "ideogram-3"] : undefined })),
    createdAt: now, updatedAt: now,
  },
  {
    id: "COURSE-DRAFT-001", slug: "spatial-atmosphere", type: "course", title: "展陈空间氛围图生成",
    summary: "从概念词到多版本渲染图，迭代材质与光线。", subjectIds: ["SUB-05"], tagIds: ["TAG-TEACHER"],
    instructorId: "U-1016", instructorName: "王雅琳", difficulty: "intermediate", estimatedMinutes: 210, cover: "空间", status: "draft", featured: false, enrollmentCount: 0, version: 1,
    steps: [{ id: "CD01-S1", title: "空间概念词", summary: "整理场地与叙事关键词。", sortOrder: 1, kind: "lesson", estimatedMinutes: 30, resourceFileIds: [] }], createdAt: now, updatedAt: now,
  },
];

export const enrollments: Enrollment[] = [
  { id: "ENR-001", userId: "U-1042", contentId: "PROJECT-001", status: "in_progress", completedStepIds: ["P001-S1"], lastStepId: "P001-S2", progressPercent: 25, startedAt: "2026-08-24T09:00:00.000Z", updatedAt: now },
  { id: "ENR-002", userId: "U-1042", contentId: "PROJECT-002", status: "in_progress", completedStepIds: ["P002-S1"], lastStepId: "P002-S2", progressPercent: 33, startedAt: "2026-08-25T09:00:00.000Z", updatedAt: now },
  { id: "ENR-003", userId: "U-1042", contentId: "COURSE-001", status: "in_progress", completedStepIds: ["C001-S1", "C001-S2", "C001-S3", "C001-S4", "C001-S5"], lastStepId: "C001-S6", progressPercent: 42, startedAt: "2026-08-20T09:00:00.000Z", updatedAt: now },
  { id: "ENR-004", userId: "U-1042", contentId: "COURSE-002", status: "completed", completedStepIds: Array.from({ length: 8 }, (_, index) => `C002-S${index + 1}`), lastStepId: "C002-S8", progressPercent: 100, startedAt: "2026-08-10T09:00:00.000Z", updatedAt: now, completedAt: now },
];

export const contentReviews: ContentReview[] = [];
export const generationOutputs: GenerationOutput[] = [];
