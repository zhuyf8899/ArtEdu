/**
 * 工具调用的用户可见描述。
 *
 * 模型一旦开始调工具（读上传文件、写工作区、生成文档），正文可能几十秒没有输出，
 * 界面上只有一个空气泡，用户会以为卡死或"直接结束了"。这里把工具名翻成一句人话，
 * 由 SSE 在工具开始/结束时推给前端，界面据此显示实时进度。
 */
export interface AgentToolActivity {
  id: string;
  /** 真实工具名（如 write_workspace_files），界面用来显示"到底调了什么"。 */
  name: string;
  /** 中文一句话说明，便于快速扫读。 */
  label: string;
  /** 一行参数摘要（文件名、检索词、格式）。 */
  detail: string;
  phase: "start" | "end";
  status?: "succeeded" | "failed";
  /**
   * 调用参数（已压缩：超长字符串截断、数组截断）。
   * 界面默认只显示 label/detail，展开后才看这份原始参数——
   * 与 Codex/Trae 那种"折叠式工具调用"一致。
   */
  arguments?: string;
  /** 结果摘要（成功看要点、失败看原因）。 */
  result?: string;
  /** 本次工具耗时，毫秒。 */
  durationMs?: number;
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

const MAX_ARGUMENT_CHARS = 700;
const MAX_ARGUMENT_STRING = 120;
const MAX_ARGUMENT_ITEMS = 8;

/**
 * 参数用于"展开查看"，因此要保留结构但压掉体积：
 * 写入网页时 content 可能上万字符，直接传会让气泡和会话存储一起膨胀。
 * 这里截断长字符串、截断长数组，并限制嵌套深度。
 */
export function sanitizeToolArguments(rawArguments: string | undefined) {
  const parsed = parseArguments(rawArguments);
  if (!parsed) return "";
  let serialized: string;
  try {
    serialized = JSON.stringify(shrinkValue(parsed));
  } catch {
    return "";
  }
  if (!serialized || serialized === "{}") return "";
  return serialized.length > MAX_ARGUMENT_CHARS ? `${serialized.slice(0, MAX_ARGUMENT_CHARS)}…` : serialized;
}

function shrinkValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > MAX_ARGUMENT_STRING ? `${value.slice(0, MAX_ARGUMENT_STRING)}…（共 ${value.length} 字符）` : value;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARGUMENT_ITEMS).map((item) => shrinkValue(item, depth + 1));
    if (value.length > MAX_ARGUMENT_ITEMS) items.push(`…共 ${value.length} 项`);
    return items;
  }
  if (value && typeof value === "object") {
    if (depth >= 3) return "…";
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 12).map(([key, item]) => [key, shrinkValue(item, depth + 1)]);
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * 结果摘要：只挑用户能看懂的那一句。
 * 工具返回结构五花八门，这里按"有 message 用 message、有列表报条数、
 * 有链接给链接"的顺序取，取不到就留空，不编造。
 */
export function summarizeToolResult(output: unknown) {
  if (!output || typeof output !== "object") return "";
  const value = output as Record<string, unknown>;
  if (typeof value.message === "string" && value.message.trim()) return clipLong(value.message.trim(), 160);
  if (Array.isArray(value.items)) return `返回 ${value.items.length} 项`;
  const document = value.document;
  if (document && typeof document === "object") {
    const fileName = (document as { fileName?: unknown }).fileName;
    return typeof fileName === "string" && fileName ? `已生成 ${fileName}` : "已生成文档";
  }
  if (value.workflowRun && typeof value.workflowRun === "object") return "已启动工作流";
  if (typeof value.path === "string" && value.path) return value.path;
  if (typeof value.openUrl === "string" && value.openUrl) return value.openUrl;
  if (value.status === "failed") return "执行失败";
  return "";
}

function clipLong(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
