import { BadRequestException } from "@nestjs/common";
import { type ZodTypeAny, type output } from "zod";

export function parseInput<T extends ZodTypeAny>(schema: T, input: unknown): output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: "请求参数不符合要求",
      issues: result.error.flatten(),
    });
  }
  return result.data;
}
