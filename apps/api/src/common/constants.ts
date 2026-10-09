export const ADMIN_MANAGEMENT_ROLES = ["admin", "teacher"] as const;
export const PLATFORM_ADMIN_ROLES = ["admin"] as const;
export const REVIEW_ROLES = ["admin", "operator", "teacher"] as const;
export const COURSE_REVIEW_ROLES = ["admin", "operator"] as const;

// 管理端和生成任务共享此额度键；image_generation 是沿用的数据键，并非仅限制图片任务。
export const MANAGED_QUOTA_CAPABILITY = "image_generation";
