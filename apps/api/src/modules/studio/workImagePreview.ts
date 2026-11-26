import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const pending = new Map<string, Promise<string>>();
sharp.concurrency(1);

// Cache by source identity and modification time. Originals remain available separately.
export async function workImagePreview(source: string, uploadRoot: string): Promise<string> {
  const info = await stat(source);
  const key = createHash('sha256').update(`${source}:${info.size}:${info.mtimeMs}`).digest('hex');
  const directory = path.join(uploadRoot, '.image-previews');
  const target = path.join(directory, key + '.webp');
  try { await stat(target); return target; } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  if (pending.has(target)) return pending.get(target)!;
  const job = (async () => {
    await mkdir(directory, {recursive:true});
    const temporary = target + '.' + randomUUID();
    try {
      await sharp(source, {limitInputPixels:40_000_000}).rotate()
        .resize({width:640,height:480,fit:'cover',position:'centre',withoutEnlargement:true})
        .webp({quality:76}).toFile(temporary);
      await rename(temporary, target);
      return target;
    } finally { await rm(temporary, {force:true}); }
  })();
  pending.set(target, job);
  try { return await job; } finally { pending.delete(target); }
}
