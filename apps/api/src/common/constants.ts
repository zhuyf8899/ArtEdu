export const ADMIN_MANAGEMENT_ROLES = ["admin", "teacher"] as const;
// 额度和账户停用属于平台级高风险操作，不随教师内容管理权限下放。
export const PLATFORM_ADMIN_ROLES = ["admin"] as const;
export const REVIEW_ROLES = ["admin", "operator", "teacher"] as const;

// 目前管理台展示的是“生成额度”。教学对话等能力后续可配置独立 capability。
export const MANAGED_QUOTA_CAPABILITY = "image_generation";
