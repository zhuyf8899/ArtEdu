import { z } from "zod";

const localDemoUsernames = new Set(["student.demo", "teacher.demo", "operator.demo", "admin.demo"]);

export const localLoginSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/, "用户名格式不合法"),
  password: z.string().max(128),
}).superRefine(({ username, password }, context) => {
  const localDemoPassword = process.env.NODE_ENV !== "production" && password === "123456" && localDemoUsernames.has(username);
  if (password.length < 12 && !localDemoPassword) context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 12, inclusive: true, type: "string", path: ["password"], message: "密码至少需要 12 位" });
});

export type LocalLoginInput = z.infer<typeof localLoginSchema>;
