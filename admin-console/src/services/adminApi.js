const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      ...(options.body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `请求失败（HTTP ${response.status}）`);
  }
  return data;
}

export const getAdminUsers = () => request("/admin/users");
export const getAdminReviews = () => request("/admin/reviews");
export const getCurrentUser = () => request("/auth/me");
export const loginLocal = (username, password) => request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ username, password }),
});
export const logoutLocal = () => request("/auth/logout", { method: "POST" });
export const getPortalHome = () => request("/portal/home");
export const getCourses = (query = "") => request(`/courses${query ? `?query=${encodeURIComponent(query)}` : ""}`);
export const getCourse = (courseId) => request(`/courses/${courseId}`);
export const enrollCourse = (courseId) => request(`/courses/${courseId}/enroll`, { method: "POST" });
export const updateLessonProgress = (courseId, lessonId, progressPercent) => request(`/courses/${courseId}/lessons/${lessonId}/progress`, {
  method: "PUT",
  body: JSON.stringify({ progressPercent }),
});
export const getMyLearning = () => request("/me/learning-progress");

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

export const createGenerationJob = (input) => request("/generation-jobs", {
  method: "POST",
  body: JSON.stringify(input),
});

export const getWorkflows = (query = "") => request(`/workflows${query ? `?query=${encodeURIComponent(query)}` : ""}`);
export const getWorkflow = (workflowId) => request(`/workflows/${workflowId}`);
export const startWorkflowRun = (workflowId, context = {}) => request(`/workflows/${workflowId}/runs`, {
  method: "POST",
  body: JSON.stringify({ context }),
});
export const getMyWorkflowRuns = () => request("/me/workflow-runs");
export const updateWorkflowRun = (runId, input) => request(`/workflow-runs/${runId}/progress`, {
  method: "PATCH",
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
export const uploadWorkAsset = (workId, file) => {
  const form = new FormData();
  form.append("file", file);
  return request(`/works/${workId}/assets`, { method: "POST", body: form });
};
export const addWorkComment = (workId, content) => request(`/works/${workId}/comments`, {
  method: "POST",
  body: JSON.stringify({ content }),
});
export const toggleWorkReaction = (workId, reaction) => request(`/works/${workId}/${reaction}`, { method: "POST" });

export const updateUserQuota = (userId, quota) => request(`/admin/users/${userId}/quota`, {
  method: "PUT",
  body: JSON.stringify(quota),
});

export const updateUserStatus = (userId, status) => request(`/admin/users/${userId}/status`, {
  method: "PATCH",
  body: JSON.stringify({ status }),
});

export const reviewSubmission = (reviewId, decision) => request(`/admin/reviews/${reviewId}/decision`, {
  method: "POST",
  body: JSON.stringify(decision),
});
