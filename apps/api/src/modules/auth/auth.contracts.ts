import { z } from "zod";

export const localLoginSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/, "用户名格式不合法"),
  password: z.string().min(12).max(128),
});

export type LocalLoginInput = z.infer<typeof localLoginSchema>;
