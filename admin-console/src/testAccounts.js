export const TEST_ACCOUNTS = [
  {
    id: "user-student-demo",
    name: "学生 · 演示学生",
    shortName: "演示学生",
    role: "student",
    roleLabel: "学生",
    description: "体验课程进度、AI 创作工作台与作品社区。",
    accent: "purple",
  },
  {
    id: "user-teacher-demo",
    name: "教师 · 演示老师",
    shortName: "演示老师",
    role: "teacher",
    roleLabel: "教师",
    description: "体验教学资源入口，并可进入管理工作台。",
    accent: "lime",
  },
  {
    id: "user-operator-demo",
    name: "运营 · 演示运营",
    shortName: "演示运营",
    role: "operator",
    roleLabel: "运营审核",
    description: "体验作品审核队列与内容运营入口。",
    accent: "orange",
  },
  {
    id: "user-admin-demo",
    name: "管理员 · 演示管理员",
    shortName: "演示管理员",
    role: "admin",
    roleLabel: "平台管理员",
    description: "体验用户额度、审核与平台总览。",
    accent: "ink",
  },
];

export const canEnterAdmin = (account) => ["admin", "teacher", "operator"].includes(account.role);
