import assert from "node:assert/strict";
import test from "node:test";
import type { ModelToolCall } from "../generation/model-adapter";
import { AgentService } from "./agent.service";
import { executePlatformTool } from "./agent-tools";
import type { AgentToolContext } from "./agent-runtime";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { StudioService } from "../studio/studio.service";
import { AgentWorkspaceService } from "./agent-workspace.service";

const actor: Actor = { id: "student-1", username: "student-1", displayName: "测试学生", accountStatus: "active", roles: ["student"] };
const baseContext: AgentToolContext = { round: 1, request: { jobType: "chat", prompt: "查询课程" }, messages: [{ role: "user", content: "查询课程" }] };

function call(name: string, args: Record<string, unknown>): ModelToolCall {
  return { id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

test("平台 Agent 工具返回已发布课程和课时事实，而不是占位结果", async () => {
  let calls = 0;
  const database = { async query() {
    calls += 1;
    return calls === 1
      ? { rows: [{ id: "course-1", title: "纹样基础", summary: "基础课程", category: "设计", difficulty: "beginner" }] }
      : { rows: [{ id: "lesson-1", title: "认识纹样", summary: "第一课", lesson_type: "video", estimated_minutes: 20, workflow_id: null, progress_percent: 50, progress_status: "in_progress" }] };
  } } as unknown as DatabaseService;
  const result = await executePlatformTool(call("get_course_lesson", { courseId: "course-1" }), baseContext, {
    actor, runId: "run-1", database, agents: {} as AgentService, studio: {} as StudioService,
  });

  assert.deepEqual(result, {
    status: "succeeded",
    course: { id: "course-1", title: "纹样基础", summary: "基础课程", category: "设计", difficulty: "beginner" },
    lessons: [{ id: "lesson-1", title: "认识纹样", summary: "第一课", type: "video", estimatedMinutes: 20, workflowId: null, progressPercent: 50, progressStatus: "in_progress" }],
  });
});

test("成果草稿直接保存，启动工作流仍必须等待用户明确确认", async () => {
  const agents = { async appendArtifact() { return "artifact-1"; } } as unknown as AgentService;
  const dependencies = { actor, runId: "run-1", database: {} as DatabaseService, agents, studio: {} as StudioService };
  const artifact = await executePlatformTool(call("create_agent_artifact", { artifactType: "brief", content: "设计说明" }), baseContext, dependencies);
  const workflow = await executePlatformTool(call("start_workflow_run", { workflowId: "workflow-1" }), baseContext, dependencies);

  assert.equal(artifact.status, "succeeded");
  assert.equal(workflow.status, "confirmation_required");
});

test("用户明确确认后才启动已发布工作流", async () => {
  const studio = { async startWorkflow(receivedActor: Actor, workflowId: string, input: { context: Record<string, unknown> }) {
    return { receivedActor: receivedActor.id, workflowId, context: input.context };
  } } as unknown as StudioService;
  const confirmed: AgentToolContext = { ...baseContext, messages: [{ role: "user", content: "我确认，启动工作流。" }] };
  const result = await executePlatformTool(call("start_workflow_run", { workflowId: "workflow-1", context: { theme: "宋锦" } }), confirmed, {
    actor, runId: "run-1", database: {} as DatabaseService, agents: {} as AgentService, studio,
  });

  assert.deepEqual(result, { status: "succeeded", workflowRun: { receivedActor: "student-1", workflowId: "workflow-1", context: { theme: "宋锦" } }, message: "工作流已启动。" });
});

test("多文件工作区工具一次创建网页所需文件，并限制在当前用户工作区", async () => {
  const received: Array<{ path: string; content: string }> = [];
  const workspace = {
    async writeMany(receivedActor: Actor, files: Array<{ path: string; content: string }>) {
      assert.equal(receivedActor.id, actor.id);
      received.push(...files);
      return { items: files.map((file) => ({ path: file.path, openUrl: `/api/agent-runs/workspace-preview/${file.path}` })), message: "已创建 2 个工作区文件。" };
    },
  } as unknown as AgentWorkspaceService;
  const result = await executePlatformTool(call("write_workspace_files", { files: [{ path: "site/index.html", content: "<link rel=\"stylesheet\" href=\"style.css\">" }, { path: "site/style.css", content: "body { color: #111; }" }] }), baseContext, {
    actor, runId: "run-1", database: {} as DatabaseService, agents: {} as AgentService, studio: {} as StudioService, workspace,
  });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(received.map((file) => file.path), ["site/index.html", "site/style.css"]);
});
