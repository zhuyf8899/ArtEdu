import { uploadFile } from "./uploadFile.js";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: {
        ...(options.body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      ...options,
    });
  } catch (error) {
    // 主动暂停时 fetch 抛的是 AbortError，必须原样上抛：它不是网络故障，
    // 调用方要据此显示「已暂停」而不是「无法连接服务」。
    if (error?.name === "AbortError") throw error;
    const networkError = new Error("无法连接服务，请确认 API 已启动后重试");
    networkError.code = "NETWORK_ERROR";
    throw networkError;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join("；") : data?.message;
    const error = new Error(message || `请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    if (response.status === 401) error.message = "登录状态已失效，请重新登录";
    if (response.status === 403 && !message) error.message = "当前账号没有执行此操作的权限";
    if (response.status === 403 && message === "跨站写请求被拒绝") error.message = "当前访问地址未获服务器授权，请联系管理员配置此地址后重试";
    throw error;
  }
  return data ?? {};
}

export const getAdminUsers = () => request("/admin/users");
export const getAdminReviews = () => request("/admin/reviews");
export const getAdminDashboard = () => request("/admin/dashboard");
export const getApiHealth = () => request("/health");
export const getCurrentUser = () => request("/auth/me");
export const pairBridgeDevice = (displayName, tokenDays) => request("/local-bridge/pair", { method: "POST", body: JSON.stringify({ displayName, tokenDays }) });
export const getBridgeDevices = () => request("/local-bridge/status");
export const revokeBridgeDevice = (deviceId) => request(`/local-bridge/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
export const loginLocal = (username, password) => request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ username, password }),
});
export const logoutLocal = () => request("/auth/logout", { method: "POST" });
export const getPortalHome = () => request("/portal/home");
export const searchPortal = (query, type = "all", tag = "") => {
  const params = new URLSearchParams({ query, type });
  if (tag) params.set("tag", tag);
  return request(`/portal/search?${params.toString()}`);
};
export const getCourses = (query = "") => request(`/courses${query ? `?query=${encodeURIComponent(query)}` : ""}`);
export const getCourse = (courseId) => request(`/courses/${courseId}`);
export const enrollCourse = (courseId) => request(`/courses/${courseId}/enroll`, { method: "POST" });
export const updateLessonProgress = (courseId, lessonId, progressPercent) => request(`/courses/${courseId}/lessons/${lessonId}/progress`, {
  method: "PUT",
  body: JSON.stringify({ progressPercent }),
});
export const getMyLearning = () => request("/me/learning-progress");
export const getLearningSpace = () => request("/me/learning-space");
export const createLearningTask = (input) => request("/me/learning-space/tasks", {
  method: "POST",
  body: JSON.stringify(input),
});
export const updateLearningTask = (taskId, input) => request(`/me/learning-space/tasks/${taskId}`, {
  method: "PATCH",
  body: JSON.stringify(input),
});
export const deleteLearningTask = (taskId) => request(`/me/learning-space/tasks/${taskId}`, { method: "DELETE" });
export const createLearningNote = (input) => request("/me/learning-space/notes", {
  method: "POST",
  body: JSON.stringify(input),
});
export const updateLearningNote = (noteId, input) => request(`/me/learning-space/notes/${noteId}`, {
  method: "PATCH",
  body: JSON.stringify(input),
});
export const deleteLearningNote = (noteId) => request(`/me/learning-space/notes/${noteId}`, { method: "DELETE" });

export const getAdminCourses = () => request("/admin/courses");
export const createAdminCourse = (input) => request("/admin/courses", {
  method: "POST",
  body: JSON.stringify(input),
});
export const submitCourseReview = (courseId) => request(`/admin/courses/${courseId}/submit-review`, { method: "POST" });
export const getCourseReviews = () => request("/admin/course-reviews");
export const decideCourseReview = (reviewId, decision) => request(`/admin/course-reviews/${reviewId}/decision`, {
  method: "POST",
  body: JSON.stringify(decision),
});
export const uploadCourseResource = (courseId, file) => {
  const form = new FormData();
  form.append("file", file);
  return request(`/admin/courses/${courseId}/resources`, { method: "POST", body: form });
};

export const createGenerationJob = (input) => request("/generation-jobs", {
  method: "POST",
  body: JSON.stringify(input),
});

export const runGenerationJob = (input, options = {}) => request("/generation-jobs/run", {
  method: "POST",
  body: JSON.stringify(input),
  signal: options.signal,
});

export const createAgentRun = (input, options = {}) => request("/agent-runs", {
  method: "POST",
  body: JSON.stringify(input),
  signal: options.signal,
});

export const executeAgentRun = (runId, input = {}, options = {}) => request(`/agent-runs/${encodeURIComponent(runId)}/execute`, {
  method: "POST",
  body: JSON.stringify({ mode: "server", ...input }),
  signal: options.signal,
});

/**
 * 流式执行：POST /agent-runs/:id/execute-stream，逐帧解析 SSE。
 * 正文增量经 options.onDelta 实时回调；最终返回的 run 对象与 executeAgentRun
 * 完全同构（放在 done 事件里），所以调用方的映射逻辑不用区分是否流式。
 * 服务端或反代不支持流式时自动退回一次性调用，行为一致（只是没有增量）。
 */
export const executeAgentRunStream = async (runId, input = {}, options = {}) => {
  const { onDelta, signal } = options;
  const response = await fetch(`${API_BASE_URL}/agent-runs/${encodeURIComponent(runId)}/execute-stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ mode: "server", ...input }),
    signal,
  });
  if (!response.ok || !response.body || !String(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return executeAgentRun(runId, input, { signal });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim() ?? "message";
      const payloadText = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
      if (payloadText) {
        let payload = null;
        try { payload = JSON.parse(payloadText); } catch { payload = null; }
        if (event === "delta" && typeof payload?.text === "string") onDelta?.(payload.text);
        else if (event === "done") completed = payload?.run ?? null;
        else if (event === "error") throw new Error(payload?.message || "生成失败");
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (!completed) throw new Error("生成未完成：连接已中断");
  return completed;
};

export const getTemporaryCreationFiles = () => request("/creation-files");
export const deleteTemporaryCreationFile = (fileId) => request(`/creation-files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
export const uploadTemporaryCreationFile = (file, conversationLocalId) => {
  const form = new FormData(); form.append("file", file);
  return request(`/creation-files${conversationLocalId ? `?conversationLocalId=${encodeURIComponent(conversationLocalId)}` : ""}`, { method: "POST", body: form });
};

export const getWorkflows = (query = "") => request(`/workflows${query ? `?query=${encodeURIComponent(query)}` : ""}`);
export const getWorkflow = (workflowId) => request(`/workflows/${workflowId}`);
export const getToolDirectoryLinks = () => request("/tool-directory-links");
export const getManagedToolDirectoryLinks = () => request("/admin/tool-directory-links");
export const createToolDirectoryLink = (input) => request("/admin/tool-directory-links", { method: "POST", body: JSON.stringify(input) });
export const updateToolDirectoryLink = (toolLinkId, input) => request(`/admin/tool-directory-links/${encodeURIComponent(toolLinkId)}`, { method: "PATCH", body: JSON.stringify(input) });
export const getAdminWorkflows = (query = "") => request(`/admin/workflows${query ? `?query=${encodeURIComponent(query)}` : ""}`);
export const getAdminWorkflow = (workflowId) => request(`/admin/workflows/${workflowId}`);
export const createWorkflow = (input) => request("/workflows", { method: "POST", body: JSON.stringify(input) });
export const updateWorkflow = (workflowId, input) => request(`/admin/workflows/${workflowId}`, { method: "PUT", body: JSON.stringify(input) });
export const createWorkflowVersion = (workflowId, input) => request(`/workflows/${workflowId}/versions`, { method: "POST", body: JSON.stringify(input) });
export const startWorkflowRun = (workflowId, context = {}) => request(`/workflows/${workflowId}/runs`, {
  method: "POST",
  body: JSON.stringify({ context }),
});
export const getMyWorkflowRuns = () => request("/me/workflow-runs");
export const updateWorkflowRun = (runId, input) => request(`/workflow-runs/${runId}/progress`, {
  method: "PATCH",
  body: JSON.stringify(input),
});
export const executeWorkflowRun = (runId, input = {}) => request(`/workflow-runs/${runId}/execute`, {
  method: "POST",
  body: JSON.stringify(input),
});

export const getWorks = (query = "") => request(`/works${query ? `?query=${encodeURIComponent(query)}` : ""}`);
export const getMyWorks = () => request("/me/works");
export const getWork = (workId) => request(`/works/${workId}`);
export const createWork = (input) => request("/works", {
  method: "POST",
  body: JSON.stringify(input),
});
export const submitWork = (workId) => request(`/works/${workId}/submit`, { method: "POST" });
export const updateWork = (workId, input) => request(`/works/${workId}`, { method: "PUT", body: JSON.stringify(input) });
export const getWorkUploadPolicy = () => request('/work-upload-policy');
export const getRuntimeStatus = () => request('/health/runtime');
export const uploadWorkAsset = (workId, file, options) => uploadFile(`${API_BASE_URL}/works/${encodeURIComponent(workId)}/assets`, file, options);
export const addWorkComment = (workId, content) => request(`/works/${workId}/comments`, {
  method: "POST",
  body: JSON.stringify({ content }),
});
export const reportWork = (workId, input) => request(`/works/${workId}/reports`, { method: "POST", body: JSON.stringify(input) });
export const reportComment = (commentId, input) => request(`/comments/${commentId}/reports`, { method: "POST", body: JSON.stringify(input) });
export const toggleWorkReaction = (workId, reaction) => request(`/works/${workId}/${reaction}`, { method: "POST" });

export const updateUserQuota = (userId, quota) => request(`/admin/users/${userId}/quota`, {
  method: "PUT",
  body: JSON.stringify(quota),
});

export const updateUsersQuota = (userIds, quota) => request("/admin/users/quota/bulk", {
  method: "POST",
  body: JSON.stringify({ userIds, quota }),
});

export const updateUserStatus = (userId, status) => request(`/admin/users/${userId}/status`, {
  method: "PATCH",
  body: JSON.stringify({ status }),
});

export const reviewSubmission = (reviewId, decision) => request(`/admin/reviews/${reviewId}/decision`, {
  method: "POST",
  body: JSON.stringify(decision),
});
export const getAdminReports = () => request("/admin/reports");
export const decideReport = (reportId, decision) => request(`/admin/reports/${reportId}/decision`, { method: "POST", body: JSON.stringify(decision) });
