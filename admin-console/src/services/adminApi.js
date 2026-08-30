// Backend integration boundary. Keep endpoint changes here so the UI components
// stay independent from the API implementation chosen by the database team.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

let currentTestUserId = window.localStorage.getItem("artedu-test-user-id") || "";

export function setTestActor(userId) {
  currentTestUserId = userId;
  if (userId) window.localStorage.setItem("artedu-test-user-id", userId);
  else window.localStorage.removeItem("artedu-test-user-id");
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(currentTestUserId ? { "x-user-id": currentTestUserId } : {}),
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
