// Backend integration boundary. Keep endpoint changes here so the UI components
// stay independent from the API implementation chosen by the database team.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
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
export const getAdminCourses = () => request("/admin/courses");
export const getAdminSubjects = () => request("/admin/subjects");
export const getAdminTags = () => request("/admin/tags");
export const getAdminResourceFiles = () => request("/admin/resource-files");
export const getContentReviews = () => request("/admin/content-reviews");
export const getCourseAnalytics = () => request("/admin/analytics/courses");

export const createCourse = (course) => request("/admin/courses", {
  method: "POST",
  body: JSON.stringify(course),
});

export const submitCourseReview = (courseId) => request(`/admin/courses/${courseId}/submit-review`, {
  method: "POST",
});

export const reviewCourse = (reviewId, decision) => request(`/admin/content-reviews/${reviewId}/decision`, {
  method: "POST",
  body: JSON.stringify(decision),
});

export const registerResourceFile = (file) => request("/admin/resource-files", {
  method: "POST",
  body: JSON.stringify(file),
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
