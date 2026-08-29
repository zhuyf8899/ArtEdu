import { BadRequestException } from "@nestjs/common";
import { type ZodType } from "zod";

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: "请求参数不符合要求",
      issues: result.error.flatten(),
    });
  }
  return result.data;
}
