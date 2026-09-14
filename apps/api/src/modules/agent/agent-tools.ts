import type { AgentToolContext } from "./agent-runtime";
import type { ModelToolCall, ModelToolDefinition } from "../generation/model-adapter";
import { z } from "zod";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { StudioService } from "../studio/studio.service";
import { AgentService } from "./agent.service";

export const platformToolDefinitions: readonly ModelToolDefinition[] = [
  { type: "function", function: { name: "search_platform", description: "搜索当前用户可见的课程、工作流和案例作品。", parameters: { type: "object", properties: { query: { type: "string", minLength: 1 }, type: { type: "string", enum: ["all", "course", "workflow", "work"] }, limit: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"] } } },
  { type: "function", function: { name: "search_web", description: "联网检索公开互联网，返回可引用的来源列表与检索摘要。仅在用户开启智能搜索时可用；必须基于返回的来源回答并在结尾给出真实链接，不得把未检索到的内容说成搜索结果。", parameters: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 300 } }, required: ["query"] } } },
  { type: "function", function: { name: "get_course_lesson", description: "读取已发布课程和课时、资料摘要及学习进度。", parameters: { type: "object", properties: { courseId: { type: "string" }, lessonId: { type: "string" } }, required: ["courseId"] } } },
  { type: "function", function: { name: "get_workflow_detail", description: "读取已发布工作流的步骤、节点、提示模板和入口信息。", parameters: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } } },
  { type: "function", function: { name: "get_case_detail", description: "读取已发布案例的作品信息、作者、资源和关联工作流。", parameters: { type: "object", properties: { workId: { type: "string" } }, required: ["workId"] } } },
  { type: "function", function: { name: "create_agent_artifact", description: "保存用户确认后的设计说明、网页规格、图案提示词或学习笔记草稿。", parameters: { type: "object", properties: { artifactType: { type: "string", enum: ["brief", "webpage", "pattern", "document"] }, content: { type: "string", minLength: 1 } }, required: ["artifactType", "content"] } } },
  { type: "function", function: { name: "start_workflow_run", description: "在用户明确确认后启动已发布工作流，不执行任意外部 URL。", parameters: { type: "object", properties: { workflowId: { type: "string" }, context: { type: "object" } }, required: ["workflowId"] } } },
];

const getCourseLessonSchema = z.object({ courseId: z.string().trim().min(1).max(160), lessonId: z.string().trim().min(1).max(160).optional() });
const getWorkflowDetailSchema = z.object({ workflowId: z.string().trim().min(1).max(160) });
const getCaseDetailSchema = z.object({ workId: z.string().trim().min(1).max(160) });
const createArtifactSchema = z.object({
  artifactType: z.enum(["brief", "webpage", "pattern", "document"]),
  content: z.string().trim().min(1).max(20_000),
});
const startWorkflowSchema = z.object({ workflowId: z.string().trim().min(1).max(160), context: z.record(z.unknown()).default({}) });

export interface PlatformToolDependencies {
  actor: Actor;
  runId: string;
  agents: AgentService;
  database: DatabaseService;
  studio: StudioService;
}

function parseArguments(call: ModelToolCall): unknown {
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    throw new Error(`${call.function.name} 参数不是合法 JSON`);
  }
}

/**
 * 写入型工具只接受当前会话中用户给出的明确确认，避免模型把“建议保存/建议运行”
 * 误当成已经授权的动作。前端在用户确认后会把确认语句写入 context。
 */
function hasExplicitConfirmation(context: AgentToolContext) {
  const latestUserMessage = [...context.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return /(?:^|[\s，。；;！!])(?:我)?(?:确认|同意|批准|可以执行|开始执行|保存草稿|启动工作流)(?:[\s，。；;！!]|$)/.test(latestUserMessage);
}

async function getCourseLesson(args: z.infer<typeof getCourseLessonSchema>, dependencies: PlatformToolDependencies) {
  const course = await dependencies.database.query<{ id: string; title: string; summary: string | null; category: string | null; difficulty: string | null }>(
    "SELECT id,title,summary,category,difficulty FROM courses WHERE id=$1 AND status='published'", [args.courseId],
  );
  if (!course.rows[0]) throw new Error("课程不存在或尚未发布");
  const lessons = await dependencies.database.query<{ id: string; title: string; summary: string | null; lesson_type: string; estimated_minutes: number; workflow_id: string | null; progress_percent: number | null; progress_status: string | null }>(
    `SELECT lesson.id,lesson.title,lesson.summary,lesson.lesson_type,lesson.estimated_minutes,lesson.workflow_id,
      progress.progress_percent,progress.status AS progress_status
      FROM course_lessons lesson
      LEFT JOIN learning_progress progress ON progress.lesson_id=lesson.id AND progress.user_id=$2
      WHERE lesson.course_id=$1 AND lesson.status='published' ${args.lessonId ? "AND lesson.id=$3" : ""} ORDER BY lesson.sort_order`,
    args.lessonId ? [args.courseId, dependencies.actor.id, args.lessonId] : [args.courseId, dependencies.actor.id],
  );
  if (args.lessonId && !lessons.rows[0]) throw new Error("课时不存在或尚未发布");
  return {
    status: "succeeded",
    course: { id: course.rows[0].id, title: course.rows[0].title, summary: course.rows[0].summary ?? "", category: course.rows[0].category, difficulty: course.rows[0].difficulty },
    lessons: lessons.rows.map((lesson) => ({
      id: lesson.id, title: lesson.title, summary: lesson.summary ?? "", type: lesson.lesson_type,
      estimatedMinutes: lesson.estimated_minutes, workflowId: lesson.workflow_id,
      progressPercent: Number(lesson.progress_percent ?? 0), progressStatus: lesson.progress_status ?? "not_started",
    })),
  };
}

export async function executePlatformTool(call: ModelToolCall, context: AgentToolContext, dependencies: PlatformToolDependencies) {
  const raw = parseArguments(call);
  switch (call.function.name) {
    case "get_course_lesson":
      return getCourseLesson(getCourseLessonSchema.parse(raw), dependencies);
    case "get_workflow_detail":
      {
        const workflow = await dependencies.studio.getWorkflow(getWorkflowDetailSchema.parse(raw).workflowId);
        return { status: "succeeded", workflow, platformRoute: `/studio?workflow=${encodeURIComponent(workflow.id)}` };
      }
    case "get_case_detail":
      return { status: "succeeded", work: await dependencies.studio.getWork(dependencies.actor, getCaseDetailSchema.parse(raw).workId) };
    case "create_agent_artifact": {
      if (!hasExplicitConfirmation(context)) return { status: "confirmation_required", message: "请先向用户展示草稿并取得明确确认，再保存成果。" };
      const input = createArtifactSchema.parse(raw);
      const artifactId = await dependencies.agents.appendArtifact(dependencies.runId, input.artifactType, { content: input.content, createdBy: "platform-agent" });
      return { status: "succeeded", artifactId, artifactType: input.artifactType, message: "已保存到本次创作记录。" };
    }
    case "start_workflow_run": {
      if (!hasExplicitConfirmation(context)) return { status: "confirmation_required", message: "请先取得用户明确确认，再启动工作流。" };
      const input = startWorkflowSchema.parse(raw);
      const run = await dependencies.studio.startWorkflow(dependencies.actor, input.workflowId, { context: input.context });
      return { status: "succeeded", workflowRun: run, message: "工作流已启动。" };
    }
    default:
      throw new Error(`未注册的平台工具: ${call.function.name}`);
  }
}
