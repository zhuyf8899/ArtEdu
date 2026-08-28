/**
 * ArtEdu 第一版数据库结构说明。
 *
 * D1 使用 SQLite 语法。真正执行数据库变更时，使用 migrations/ 下的迁移文件；
 * 这里集中记录表的用途，方便后端代码和新人理解数据模型。
 */
export const tables = {
  departments: '院系与组织层级',
  roles: '系统角色：管理员、运营、老师、学生',
  users: '平台用户基础资料',
  userRoles: '用户与角色的多对多关系',
  userIdentities: '学校单点登录或校外本地账号身份',
  courses: '课程基础信息',
  courseInstructors: '课程与讲师关系',
  courseLessons: '课程章节、课时和练习',
  courseResources: '课程中的 PDF、视频、Word、PPT 等资源元数据',
  learningProgress: '用户在各课时的学习进度',
  workflows: '可被课程、案例引用的设计工作流',
  workflowVersions: '工作流版本、节点定义和提示词模板',
  tools: '自研、外部或嵌入式设计工具',
  modelProviders: '模型供应商',
  modelConfigs: '可启用的模型配置，不保存真实密钥',
  works: '学生或老师发布的案例作品',
  workAssets: '作品图片、视频等文件的存储元数据',
  workWorkflows: '作品与工作流的多对多关系',
  tags: '课程、作品、工作流和工具的筛选标签',
  books: '资源库中独立展示和推荐的设计书籍',
  comments: '实名作品评论与回复',
  workLikes: '作品点赞',
  workFavorites: '作品收藏',
  conversations: '教学、设计和生成任务的对话会话',
  conversationMessages: '会话中的用户、助手和系统消息',
  userUsageLimits: '用户调用额度',
  usageRecords: '模型或工具的调用审计',
  generationJobs: '图像、视频、网页、图案、PDF 与知识图生成任务',
  generationOutputs: '生成任务的文件输出元数据',
  auditRecords: '作品和资源的审核记录',
  assetModerationRecords: '图片、课件和对话附件的内容审核结果',
} as const;

export const initialMigration = '0001_initial';
