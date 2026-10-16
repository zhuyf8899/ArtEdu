import { z } from 'zod';

const text = (max: number) => z.string().max(max);
const id = text(160).min(1);
const webUrl = z.string().max(2000).refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, '请输入 HTTP(S) 链接');
const profile = z.object({
  name: text(30).min(1), bio: text(300), school: text(60), major: text(60), grade: text(30), work: text(60),
  background: text(700_000).refine(value => value === '' || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value), '背景图格式无效'),
  position: z.enum(['center', 'left center', 'right center', 'center top']),
}).strict();
const schemas = {
  profile,
  favorites: z.array(z.object({ type: z.enum(['course', 'tool']), id }).strict()).max(500),
  remixes: z.array(z.object({ id, sourceCaseId: id, source: text(160), title: text(120).min(1), brief: text(6000).min(1), tools: z.array(text(100)).max(20), createdAt: z.string().datetime() }).strict()).max(100),
  'tool-submissions': z.array(z.object({ id, title: text(80).min(1), url: webUrl, reason: text(3000).min(1), createdAt: z.string().datetime() }).strict()).max(100),
  'curriculum-paths': z.array(z.object({ id, topic: text(200), title: text(200), duration: z.number().nonnegative(), courses: z.array(z.object({ id, title: text(200) }).strict()).min(1).max(100), savedAt: z.string().datetime() }).strict()).max(50),
  'creation-records': z.array(z.object({ id, title: text(120), messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: text(100_000), at: z.string().datetime(), runId: id.optional() }).strict()).max(100) }).strict()).max(50),
} as const;
export const morphKeySchema = z.enum(['profile', 'favorites', 'remixes', 'tool-submissions', 'curriculum-paths', 'creation-records']);
export type MorphKey = z.infer<typeof morphKeySchema>;
export const morphWriteSchema = z.object({ version: z.number().int().min(0), value: z.unknown() }).strict();
export function parseMorphValue(key: MorphKey, value: unknown) {
  const parsed = schemas[key].parse(value);
  if (Buffer.byteLength(JSON.stringify(parsed), 'utf8') > 800_000) throw new Error('保存内容超过大小限制，请精简记录');
  return parsed;
}
