import type { AgentToolContext } from "./agent-runtime";
import type { ModelToolCall, ModelToolDefinition } from "../generation/model-adapter";

export const platformToolDefinitions: readonly ModelToolDefinition[] = [
  { type: "function", function: { name: "search_platform", description: "搜索当前用户可见的课程、工作流和案例作品。", parameters: { type: "object", properties: { query: { type: "string", minLength: 1 }, type: { type: "string", enum: ["all", "course", "workflow", "work"] }, limit: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"] } } },
  { type: "function", function: { name: "get_course_lesson", description: "读取已发布课程和课时、资料摘要及学习进度。", parameters: { type: "object", properties: { courseId: { type: "string" }, lessonId: { type: "string" } }, required: ["courseId"] } } },
  { type: "function", function: { name: "get_workflow_detail", description: "读取已发布工作流的步骤、节点、提示模板和入口信息。", parameters: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } } },
  { type: "function", function: { name: "get_case_detail", description: "读取已发布案例的作品信息、作者、资源和关联工作流。", parameters: { type: "object", properties: { workId: { type: "string" } }, required: ["workId"] } } },
  { type: "function", function: { name: "create_agent_artifact", description: "保存用户确认后的设计说明、网页规格、图案提示词或学习笔记草稿。", parameters: { type: "object", properties: { artifactType: { type: "string", enum: ["brief", "webpage", "pattern", "document"] }, content: { type: "string", minLength: 1 } }, required: ["artifactType", "content"] } } },
  { type: "function", function: { name: "start_workflow_run", description: "在用户明确确认后启动已发布工作流，不执行任意外部 URL。", parameters: { type: "object", properties: { workflowId: { type: "string" }, context: { type: "object" } }, required: ["workflowId"] } } },
];

const placeholderNames = new Set(platformToolDefinitions.map((tool) => tool.function.name));

/** Placeholder executor: individual branches will be replaced by authorized service calls. */
export async function executePlatformTool(call: ModelToolCall, _context: AgentToolContext) {
  if (!placeholderNames.has(call.function.name)) throw new Error(`未注册的平台工具: ${call.function.name}`);
  return { status: "not_implemented", tool: call.function.name, message: "工具接口已预留，当前版本尚未执行该业务操作。" };
}
