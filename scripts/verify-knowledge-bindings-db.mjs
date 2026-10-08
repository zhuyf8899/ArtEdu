// Transaction-isolated local integration QA. No login, real course changes or model calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "apps/api");
const require = createRequire(path.join(api, "package.json"));
const env = require("dotenv").parse(await readFile(path.join(api, ".env")));
const databaseUrl = new URL(env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) throw new Error("QA only supports the local database");
for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value;
require("reflect-metadata");
require("ts-node").register({ project: path.join(api, "tsconfig.json"), transpileOnly: true });
const { CoursesService } = require(path.join(api, "src/modules/courses/courses.service.ts"));
const { createCourseSchema, courseKnowledgeBindingsSchema } = require(path.join(api, "src/modules/courses/courses.contracts.ts"));
const { LearningService } = require(path.join(api, "src/modules/learning/learning.service.ts"));
const { StudioService } = require(path.join(api, "src/modules/studio/studio.service.ts"));
const { workflowInputSchema, workflowVersionInputSchema } = require(path.join(api, "src/modules/studio/studio.contracts.ts"));
const { AuthService } = require(path.join(api, "src/modules/auth/auth.service.ts"));
const pool = new (require("pg").Pool)({ connectionString: env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const people = await client.query("SELECT id,username,display_name FROM users WHERE username IN ('admin.demo','student.demo','teacher.demo')");
  const actor = (username, role) => { const row = people.rows.find((item) => item.username === username); if (!row) throw new Error(`Missing local QA account: ${username}`); return { id: row.id, username, displayName: row.display_name, accountStatus: "active", roles: [role] }; };
  const admin = actor("admin.demo", "admin"), student = actor("student.demo", "student"), teacher = actor("teacher.demo", "teacher");
  // All service writes use this one outer transaction and are always rolled back.
  // Serialize Promise.all reads on the single rollback-only connection (pg 9-safe).
  let queued = Promise.resolve();
  const query = (...args) => { const next = queued.then(() => client.query(...args)); queued = next.catch(() => undefined); return next; };
  const database = { query, transaction: (work) => work({ query }) };
  const auth = new AuthService(database);
  const courses = new CoursesService(database, auth, {});
  const studio = new StudioService(database, auth);
  const learning = new LearningService(database);
  const created = await courses.create(admin, createCourseSchema.parse({ title: "QA 纹样转译", category: "视觉设计", lessons: [
    { title: "观察与提取", learningSteps: ["比较骨架"], practiceTask: "画出结构", completionCriteria: "说明形态", estimatedMinutes: 5 },
    { title: "配色方案", learningSteps: ["比较冷暖色"], estimatedMinutes: 5 },
  ] }));
  let detail = await courses.getManagedDetail(admin, created.id);
  assert.deepEqual(detail.lessons[0].learningSteps, ["比较骨架"]);
  await client.query("UPDATE courses SET status='published' WHERE id=$1", [created.id]);
  const input = courseKnowledgeBindingsSchema.parse({ knowledgePoints: ["纹样提取", "色彩搭配", "版式表达"], lessons: [
    { lessonId: detail.lessons[0].id, knowledgePoints: ["纹样提取"] },
    { lessonId: detail.lessons[1].id, knowledgePoints: ["色彩搭配"] },
  ] });
  await assert.rejects(courses.updateKnowledgeBindings(student, created.id, input), /无权/);
  await assert.rejects(courses.updateKnowledgeBindings(teacher, created.id, input), /自己创建/);
  await assert.rejects(courses.updateKnowledgeBindings(admin, created.id, { ...input, lessons: [{ lessonId: "foreign-lesson", knowledgePoints: [] }] }), /不属于/);
  detail = await courses.updateKnowledgeBindings(admin, created.id, input);
  assert.deepEqual(detail.knowledgePoints, input.knowledgePoints);
  assert.deepEqual(detail.lessons[0].knowledgePoints, ["纹样提取"]);
  assert.equal(detail.lessons[0].completionCriteria, "说明形态");
  assert.equal(detail.status, "published");
  await courses.enroll(student, created.id);
  await courses.updateProgress(student, created.id, detail.lessons[0].id, { progressPercent: 100, completionConfirmed: true, watchedSeconds: 0, lastPositionSeconds: 0 });
  await courses.updateKnowledgeBindings(admin, created.id, input);
  const dashboard = await learning.getDashboard(student);
  const learned = dashboard.learningLessons.find((lesson) => lesson.id === detail.lessons[0].id);
  assert.equal(learned.progressPercent, 100);
  assert.deepEqual(learned.knowledgePoints, ["纹样提取"]);
  assert.equal((await learning.getDashboard(teacher)).learningLessons.some((lesson) => lesson.courseId === created.id), false);
  const workflow = await studio.createWorkflow(admin, workflowInputSchema.parse({ name: "QA 纹样实践", description: "事务内教学说明，绝不调用模型", category: "视觉设计", entryType: "workbench" }));
  const definition = { nodes: [{ id: "n", type: "note", position: { x: 0, y: 0 }, data: { label: "观察纹样" } }], edges: [], learning: { knowledgePoints: ["纹样提取"], tools: ["DeepSeek"], abilityGoals: ["比较纹样骨架"] } };
  await studio.createWorkflowVersion(admin, workflow.id, workflowVersionInputSchema.parse({ definition, publish: true }));
  const run = await studio.startWorkflow(student, workflow.id, { context: {} });
  await studio.createWorkflowVersion(admin, workflow.id, workflowVersionInputSchema.parse({ definition: { ...definition, learning: { ...definition.learning, tools: ["Figma"] } }, publish: true }));
  const record = (await learning.getDashboard(student)).workflowRuns.find((item) => item.id === run.id);
  assert.deepEqual(record.learningBindings.tools, ["DeepSeek"], "historical run must keep original version bindings");
  console.log("PASS: real PostgreSQL course bindings, access checks, preserved progress/steps, per-user dashboard, workflow version isolation; all QA writes rolled back.");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}
