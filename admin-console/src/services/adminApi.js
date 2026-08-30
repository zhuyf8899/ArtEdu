// Backend integration boundary. Keep endpoint changes here so the UI components
// stay independent from the API implementation chosen by the database team.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const demoAuthEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_AUTH === "true";

let currentTestUserId = demoAuthEnabled ? window.localStorage.getItem("artedu-test-user-id") || "" : "";

export function setTestActor(userId) {
  if (!demoAuthEnabled) return;
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
