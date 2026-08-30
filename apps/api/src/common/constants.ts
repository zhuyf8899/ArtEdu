export const ADMIN_MANAGEMENT_ROLES = ["admin", "teacher"] as const;
export const REVIEW_ROLES = ["admin", "operator", "teacher"] as const;
export const COURSE_REVIEW_ROLES = ["admin", "operator"] as const;

// 目前管理台展示的是“生成额度”。教学对话等能力后续可配置独立 capability。
export const MANAGED_QUOTA_CAPABILITY = "image_generation";
