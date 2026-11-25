import { z } from "zod";

const localDemoUsernames = new Set(["student.demo", "teacher.demo", "operator.demo", "admin.demo"]);
const minimumPasswordLength = 8;
const passwordLengthMessage = `密码至少需要 ${minimumPasswordLength} 个字符`;
const passwordInput = z.string().max(128, "密码最多支持 128 个字符");
const hasMinimumPasswordLength = (password: string) => Array.from(password).length >= minimumPasswordLength;

export const localPasswordSchema = passwordInput.refine(hasMinimumPasswordLength, passwordLengthMessage);

export const localLoginSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/, "用户名格式不合法"),
  password: passwordInput,
}).superRefine(({ username, password }, context) => {
  if (!hasMinimumPasswordLength(password) && !(localDemoUsernames.has(username) && password === "123456")) {
    context.addIssue({ code: z.ZodIssueCode.too_small, minimum: minimumPasswordLength, inclusive: true, origin: "string", path: ["password"], message: passwordLengthMessage });
  }
});

export type LocalLoginInput = z.infer<typeof localLoginSchema>;
