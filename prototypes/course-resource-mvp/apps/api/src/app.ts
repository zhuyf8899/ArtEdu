import cors from "cors";
import express from "express";
import { z } from "zod";
import {
  contentReviews,
  enrollments,
  generationOutputs,
  learningContents,
  models,
  resourceFiles,
  resources,
  reviews,
  subjects,
  tags,
  users,
  workflows,
} from "./data/seed.js";
import { consume, QuotaError } from "./services/quota.service.js";
import { enroll, listCatalog, subjectCatalogCounts, updateProgress, withRelations } from "./services/learning.service.js";
import type { CourseStep, LearningContent, ResourceFile } from "./domain/types.js";

export const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

const currentUser = () => users[0]!;
const asyncTasks = new Map<string, Record<string, unknown>>();

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "aigc-art-api", time: new Date().toISOString() }));
app.get("/api/models", (_req, res) => res.json({ items: models }));
app.get("/api/subjects", (_req, res) => res.json({ items: subjectCatalogCounts() }));
app.get("/api/tags", (_req, res) => res.json({ items: tags }));
app.get("/api/courses", (req, res) => {
  const type = req.query.type === "project" || req.query.type === "course" ? req.query.type : undefined;
  const featured = req.query.featured === undefined ? undefined : req.query.featured === "true";
  const items = listCatalog({ q: String(req.query.q ?? "") || undefined, subjectId: String(req.query.subjectId ?? "") || undefined, tagId: String(req.query.tagId ?? "") || undefined, type, featured }, currentUser().id);
  res.json({ items, total: items.length });
});
app.get("/api/courses/:id", (req, res) => {
  const item = learningContents.find((content) => content.id === req.params.id && content.status === "published");
  if (!item) return res.status(404).json({ message: "课程或学习项目不存在" });
  res.json(withRelations(item, currentUser().id));
});
app.post("/api/courses/:id/enroll", (req, res) => {
  const enrollment = enroll(currentUser().id, req.params.id);
  if (!enrollment) return res.status(404).json({ message: "课程或学习项目不存在" });
  res.status(201).json(enrollment);
});
app.get("/api/me/learning-progress", (_req, res) => res.json({ items: enrollments.filter((item) => item.userId === currentUser().id) }));
app.put("/api/courses/:id/progress", (req, res) => {
  const input = z.object({ stepId: z.string().min(1), completed: z.boolean() }).parse(req.body);
  const progress = updateProgress(currentUser().id, req.params.id, input.stepId, input.completed);
  if (!progress) return res.status(404).json({ message: "课程步骤不存在" });
  res.json(progress);
});
app.get("/api/resources", (req, res) => {
  const category = String(req.query.category ?? "全部");
  res.json({ items: category === "全部" ? resources : resources.filter((item) => item.category === category) });
});
app.get("/api/workflows", (_req, res) => res.json({ items: workflows }));
app.get("/api/workflows/:id", (req, res) => {
  const workflow = workflows.find((item) => item.id === req.params.id);
  if (!workflow) return res.status(404).json({ message: "工作流不存在" });
  res.json(workflow);
});
app.get("/api/search", (req, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  if (q.length < 2) return res.json({ courses: [], resources: [], workflows: [] });
  res.json({
    courses: listCatalog({ q }, currentUser().id).slice(0, 10),
    resources: resources.filter((item) => `${item.title} ${item.category} ${item.author}`.toLowerCase().includes(q)).slice(0, 10),
    workflows: workflows.filter((item) => `${item.title} ${item.category}`.toLowerCase().includes(q)).slice(0, 10),
  });
});
app.get("/api/recommendations", (_req, res) => res.json({ items: listCatalog({ featured: true }, currentUser().id).sort((a, b) => b.enrollmentCount - a.enrollmentCount).slice(0, 6) }));
app.get("/api/me/quota", (_req, res) => {
  const user = currentUser();
  res.json({ userId: user.id, status: user.status, daily: { used: user.dailyUsed, limit: user.dailyLimit }, monthly: { used: user.monthlyUsed, limit: user.monthlyLimit }, concurrent: { used: user.activeTasks, limit: user.concurrentLimit } });
});

app.post("/api/generations", (req, res, next) => {
  try {
    const input = z.object({ prompt: z.string().trim().min(4).max(2000), modelId: z.string(), workflowId: z.string().optional(), contentId: z.string().optional(), stepId: z.string().optional() }).parse(req.body);
    const model = models.find((item) => item.id === input.modelId);
    if (!model) return res.status(400).json({ message: "所选模型不可用" });
    const boundContent = input.contentId
      ? learningContents.find((item) => item.id === input.contentId)
      : learningContents.find((item) => item.steps.some((step) => step.workflowId === input.workflowId));
    const boundStep = boundContent?.steps.find((item) => item.id === input.stepId || (!input.stepId && item.workflowId === input.workflowId));
    const contentId = input.contentId ?? boundContent?.id;
    const stepId = input.stepId ?? boundStep?.id;
    if ((input.contentId || input.stepId) && (!boundContent || !boundStep || boundStep.kind !== "workflow")) return res.status(400).json({ message: "课程工作流步骤无效" });
    if (boundStep?.modelIds?.length && !boundStep.modelIds.includes(input.modelId)) return res.status(400).json({ message: "该课程步骤不允许使用所选模型" });
    const user = currentUser();
    consume(user, model.cost);
    const taskId = `TASK-${Date.now().toString(36).toUpperCase()}`;
    const task = { id: taskId, status: "queued", prompt: input.prompt, model, workflowId: input.workflowId, contentId, stepId, cost: model.cost, createdAt: new Date().toISOString() };
    asyncTasks.set(taskId, task);
    setTimeout(() => {
      const output = { id: `OUT-${Date.now().toString(36).toUpperCase()}`, taskId, userId: user.id, contentId, stepId, modelId: input.modelId, prompt: input.prompt, type: "image" as const, url: null, createdAt: new Date().toISOString() };
      generationOutputs.push(output);
      asyncTasks.set(taskId, { ...task, status: "succeeded", output: { ...output, message: "演示任务已完成；接入模型供应商后将在此返回实际作品。" } });
      if (contentId && stepId) updateProgress(user.id, contentId, stepId, true);
      user.activeTasks = Math.max(0, user.activeTasks - 1);
    }, 1800);
    res.status(202).json(task);
  } catch (error) { next(error); }
});
app.get("/api/generations/:id", (req, res) => {
  const task = asyncTasks.get(req.params.id);
  if (!task) return res.status(404).json({ message: "生成任务不存在" });
  res.json(task);
});
app.get("/api/me/generation-outputs", (_req, res) => res.json({ items: generationOutputs.filter((item) => item.userId === currentUser().id) }));

app.post("/api/resources/submissions", (req, res) => {
  const input = z.object({ title: z.string().min(2), prompt: z.string().min(4), model: z.string(), kind: z.string().default("案例投稿") }).parse(req.body);
  const item = { id: `CASE-${String(282 + reviews.length).padStart(4, "0")}`, title: input.title, author: currentUser().name, department: currentUser().department, kind: input.kind, model: input.model, submittedAt: "刚刚", machineStatus: "等待机器预审", prompt: input.prompt, assets: 1, cover: "linear-gradient(135deg,#d8ff82,#385500)", status: "pending" as const };
  reviews.unshift(item);
  res.status(201).json(item);
});

app.get("/api/admin/users", (_req, res) => res.json({ items: users }));
app.get("/api/admin/subjects", (_req, res) => res.json({ items: subjects }));
app.get("/api/admin/tags", (_req, res) => res.json({ items: tags }));
app.get("/api/admin/resource-files", (_req, res) => res.json({ items: resourceFiles }));
app.post("/api/admin/resource-files", (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(240), mimeType: z.string().min(3).max(160), byteSize: z.number().int().min(0).max(500 * 1024 * 1024) }).parse(req.body);
  const id = `FILE-${Date.now().toString(36).toUpperCase()}`;
  const file: ResourceFile = { id, ...input, storageKey: `uploads/${id}/${input.name}`, url: `/demo-files/${encodeURIComponent(input.name)}`, safetyStatus: "pending", createdBy: "U-1016", createdAt: new Date().toISOString() };
  resourceFiles.unshift(file);
  res.status(201).json({ ...file, upload: { method: "PUT", url: `/api/admin/resource-files/${id}/content`, expiresIn: 900, demoOnly: true } });
});
app.get("/api/admin/courses", (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status as LearningContent["status"] : undefined;
  const items = (status ? learningContents.filter((item) => item.status === status) : learningContents).map((item) => withRelations(item));
  res.json({ items, total: items.length });
});
const stepSchema = z.object({ id: z.string().optional(), title: z.string().trim().min(2).max(240), summary: z.string().max(2000).default(""), sortOrder: z.number().int().min(1), kind: z.enum(["lesson", "resource", "workflow", "assignment"]), estimatedMinutes: z.number().int().min(0).max(1440).default(15), resourceFileIds: z.array(z.string()).default([]), workflowId: z.string().optional(), modelIds: z.array(z.string()).optional() });
const contentInputSchema = z.object({ title: z.string().trim().min(2).max(240), summary: z.string().trim().min(4).max(3000), type: z.enum(["project", "course"]), subjectIds: z.array(z.string()).min(1), tagIds: z.array(z.string()).default([]), difficulty: z.enum(["beginner", "intermediate", "advanced"]), estimatedMinutes: z.number().int().min(1).max(10000), featured: z.boolean().default(false), cover: z.string().max(120).default("AI"), steps: z.array(stepSchema).min(1) });
app.post("/api/admin/courses", (req, res) => {
  const input = contentInputSchema.parse(req.body);
  if (input.subjectIds.some((id) => !subjects.some((subject) => subject.id === id))) return res.status(400).json({ message: "包含不存在的学科" });
  const id = `${input.type === "course" ? "COURSE" : "PROJECT"}-${Date.now().toString(36).toUpperCase()}`;
  const created: LearningContent = { ...input, id, slug: `${input.type}-${Date.now().toString(36)}`, instructorId: "U-1016", instructorName: "王雅琳", status: "draft", enrollmentCount: 0, version: 1, steps: input.steps.map((step, index) => ({ ...step, id: step.id ?? `${id}-S${index + 1}` } as CourseStep)), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  learningContents.unshift(created);
  res.status(201).json(withRelations(created));
});
app.put("/api/admin/courses/:id", (req, res) => {
  const input = contentInputSchema.parse(req.body);
  const content = learningContents.find((item) => item.id === req.params.id);
  if (!content) return res.status(404).json({ message: "课程或学习项目不存在" });
  if (content.status === "pending_review") return res.status(409).json({ message: "审核中的内容不能编辑" });
  Object.assign(content, input, { version: content.version + 1, status: content.status === "published" ? "draft" : content.status, updatedAt: new Date().toISOString(), steps: input.steps.map((step, index) => ({ ...step, id: step.id ?? `${content.id}-S${index + 1}` })) });
  res.json(withRelations(content));
});
app.post("/api/admin/courses/:id/submit-review", (req, res) => {
  const content = learningContents.find((item) => item.id === req.params.id);
  if (!content) return res.status(404).json({ message: "课程或学习项目不存在" });
  if (!["draft", "rejected"].includes(content.status)) return res.status(409).json({ message: "当前状态不能提交审核" });
  if (contentReviews.some((review) => review.contentId === content.id && review.status === "pending")) return res.status(409).json({ message: "已有待处理审核" });
  content.status = "pending_review";
  content.updatedAt = new Date().toISOString();
  const review = { id: `CR-${Date.now().toString(36).toUpperCase()}`, contentId: content.id, contentTitle: content.title, contentType: content.type, submitterId: content.instructorId, submitterName: content.instructorName, status: "pending" as const, submittedAt: new Date().toISOString(), snapshotVersion: content.version };
  contentReviews.unshift(review);
  res.status(201).json(review);
});
app.get("/api/admin/content-reviews", (_req, res) => res.json({ items: contentReviews }));
app.post("/api/admin/content-reviews/:id/decision", (req, res) => {
  const input = z.object({ status: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000).optional() }).parse(req.body);
  const review = contentReviews.find((item) => item.id === req.params.id);
  if (!review || review.status !== "pending") return res.status(404).json({ message: "待审核记录不存在" });
  const content = learningContents.find((item) => item.id === review.contentId);
  if (!content) return res.status(404).json({ message: "审核内容不存在" });
  review.status = input.status;
  review.note = input.note;
  review.reviewerId = "U-1016";
  review.decidedAt = new Date().toISOString();
  content.status = input.status === "approved" ? "published" : "rejected";
  content.rejectionNote = input.status === "rejected" ? input.note : undefined;
  content.publishedAt = input.status === "approved" ? new Date().toISOString() : content.publishedAt;
  content.updatedAt = new Date().toISOString();
  res.json({ review, content: withRelations(content) });
});
app.get("/api/admin/analytics/courses", (_req, res) => {
  const published = learningContents.filter((item) => item.status === "published");
  const totalEnrollments = published.reduce((sum, item) => sum + item.enrollmentCount, 0);
  const activeEnrollments = enrollments.filter((item) => item.status === "in_progress");
  res.json({
    totals: { contents: learningContents.length, published: published.length, pendingReview: learningContents.filter((item) => item.status === "pending_review").length, enrollments: totalEnrollments, learnersInProgress: activeEnrollments.length, completions: enrollments.filter((item) => item.status === "completed").length },
    bySubject: subjectCatalogCounts(),
    popular: published.slice().sort((a, b) => b.enrollmentCount - a.enrollmentCount).slice(0, 5).map((item) => ({ id: item.id, title: item.title, type: item.type, enrollmentCount: item.enrollmentCount })),
  });
});
app.put("/api/admin/users/:id/quota", (req, res) => {
  const input = z.object({ dailyLimit: z.number().int().min(0), monthlyLimit: z.number().int().min(0), concurrentLimit: z.number().int().min(0).max(20) }).parse(req.body);
  const user = users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  Object.assign(user, input);
  user.status = input.monthlyLimit > user.monthlyUsed && input.dailyLimit > user.dailyUsed ? "active" : "limited";
  res.json(user);
});
app.patch("/api/admin/users/:id/status", (req, res) => {
  const input = z.object({ status: z.enum(["active", "limited", "suspended"]) }).parse(req.body);
  const user = users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  user.status = input.status;
  res.json(user);
});
app.get("/api/admin/reviews", (_req, res) => res.json({ items: reviews }));
app.post("/api/admin/reviews/:id/decision", (req, res) => {
  const input = z.object({ status: z.enum(["approved", "rejected"]), note: z.string().max(1000).optional() }).parse(req.body);
  const review = reviews.find((item) => item.id === req.params.id);
  if (!review) return res.status(404).json({ message: "审核记录不存在" });
  review.status = input.status;
  review.note = input.note;
  res.json(review);
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ message: "请求参数不正确", issues: error.issues });
  if (error instanceof QuotaError) return res.status(error.status).json({ code: error.code, message: error.message });
  console.error(error);
  res.status(500).json({ message: "服务器内部错误" });
});
