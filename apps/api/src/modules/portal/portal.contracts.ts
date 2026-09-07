import { z } from "zod";

export const portalSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(80),
  type: z.enum(["all", "course", "workflow", "work"]).default("all"),
  tag: z.string().trim().min(1).max(40).optional(),
});

export type PortalSearchQuery = z.infer<typeof portalSearchQuerySchema>;

const SEARCH_ALIASES: Record<string, string[]> = {
  ui: ["界面", "交互", "视觉设计", "设计系统"],
  "ui创作": ["界面", "交互", "视觉设计", "设计系统"],
  vibe: ["vibe coding", "网页", "代码", "交互"],
  "vibecoding": ["网页", "代码", "交互"],
  "图案生成": ["纹样", "图案", "材质", "视觉实验"],
  "图片生成": ["图像", "视觉", "生成式ai"],
};

export function buildPortalSearchPatterns(value: string) {
  const query = value.trim();
  const normalized = query.toLowerCase().replace(/[\s_-]+/g, "");
  const terms = [query, ...(SEARCH_ALIASES[normalized] ?? [])];
  return [...new Set(terms.map((term) => `%${term}%`))];
}
