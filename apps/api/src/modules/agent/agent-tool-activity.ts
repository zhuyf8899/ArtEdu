/**
 * 工具调用的用户可见描述。
 *
 * 模型一旦开始调工具（读上传文件、写工作区、生成文档），正文可能几十秒没有输出，
 * 界面上只有一个空气泡，用户会以为卡死或"直接结束了"。这里把工具名翻成一句人话，
 * 由 SSE 在工具开始/结束时推给前端，界面据此显示实时进度。
 */
export interface AgentToolActivity {
  id: string;
  name: string;
  label: string;
  detail: string;
  phase: "start" | "end";
  status?: "succeeded" | "failed";
}

const TOOL_LABELS: Record<string, string> = {
  list_uploaded_files: "查找已上传文件",
  read_uploaded_file: "读取上传文件",
  list_workspace_files: "查看工作区文件",
  read_workspace_file: "读取工作区文件",
  write_workspace_file: "写入工作区文件",
  write_workspace_files: "写入工作区文件",
  create_workspace_directory: "新建工作区目录",
  change_workspace_directory: "切换工作目录",
  open_workspace_file: "打开工作区文件",
  generate_document: "生成文档",
  create_agent_artifact: "保存成果草稿",
  list_saved_artifacts: "查看已保存成果",
  search_platform: "检索平台内容",
  list_published_content: "列出平台内容",
  list_courses: "列出课程",
  list_workflows: "列出工作流",
  search_cases: "检索社区案例",
  search_web: "联网检索",
  get_course_lesson: "读取课程与课时",
  get_workflow_detail: "读取工作流详情",
  get_case_detail: "读取案例详情",
  get_workflow_run_result: "查看工作流进度",
  start_workflow_run: "启动工作流",
  harness_probe: "内部检查",
};

export function toolActivityLabel(name: string) {
  const label = TOOL_LABELS[name];
  if (label) return label;
  // 未知工具也要显示出来，否则新增工具时界面又会「悄悄结束」。
  return `调用 ${name}`;
}

/** 从工具参数里挑出用户真正关心的那一项（文件名、检索词、格式），作为一行的补充说明。 */
export function describeToolCall(name: string, rawArguments: string | undefined) {
  const args = parseArguments(rawArguments);
  if (!args) return "";
  switch (name) {
    case "write_workspace_files": {
      const files = Array.isArray(args.files) ? args.files : [];
      const paths = files
        .map((file) => (file && typeof file === "object" && typeof (file as { path?: unknown }).path === "string" ? (file as { path: string }).path : ""))
        .filter(Boolean);
      if (!paths.length) return "";
      return paths.length > 3 ? `${paths.slice(0, 3).join("、")} 等 ${paths.length} 个文件` : paths.join("、");
    }
    case "write_workspace_file":
    case "read_workspace_file":
    case "open_workspace_file":
      return clip(firstString(args, ["path"]));
    case "create_workspace_directory":
    case "change_workspace_directory":
      return clip(firstString(args, ["directory"]));
    case "search_platform":
    case "search_web":
      return clip(firstString(args, ["query"]));
    case "search_cases":
      return clip(firstString(args, ["keyword", "tag", "medium", "author"]));
    case "generate_document": {
      const format = firstString(args, ["format"]);
      return format ? `格式 ${format.toUpperCase()}` : "";
    }
    case "get_workflow_detail":
    case "start_workflow_run":
    case "get_workflow_run_result":
      return clip(firstString(args, ["workflowId", "runId"]));
    case "get_course_lesson":
      return clip(firstString(args, ["courseId", "lessonId"]));
    case "get_case_detail":
      return clip(firstString(args, ["workId"]));
    default:
      return "";
  }
}

function parseArguments(rawArguments: string | undefined): Record<string, unknown> | null {
  if (typeof rawArguments !== "string" || !rawArguments.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(rawArguments);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    // 参数不是合法 JSON 时不影响展示：上层本来就会把这次调用记成失败。
    return null;
  }
}

function firstString(args: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function clip(value: string) {
  return value.length > 80 ? `${value.slice(0, 79)}…` : value;
}
