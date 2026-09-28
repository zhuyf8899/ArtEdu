/** One-time, explicit export of the nine authorized public-display cases.
 * Never export arbitrary uploads, source documents, videos or auth notes.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ids = [
  'work-442627ce-0bc5-47c6-96ed-c80cd0015f4b',
  'work-91a7a847-3c8f-46cf-bf1c-56e095bc708a',
  'work-77d4e707-c163-4aab-9c71-056dc31f24b1',
  'work-1573e353-3626-4fe9-9137-ed9cde87f047',
  'work-6279eb9b-4eb5-41a3-b75b-92dd2bb0e042',
  'work-763623bc-75e4-4e55-8920-94f00e1f7dd8',
  'work-52815e54-8eb4-4f63-8d1d-9f57c6aee132',
  'work-83a2ce9f-043d-4f7e-9372-c3685f6c923d',
  'work-e922c1f0-a526-45ab-8a54-7fe48b43801f',
];
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bundleRoot = path.join(repositoryRoot, 'seed', 'community-showcase');
const uploadRoot = path.resolve(process.env.UPLOAD_ROOT || path.join(process.cwd(), 'data', 'uploads'));

async function hash(file) {
  const sha = createHash('sha256');
  for await (const chunk of createReadStream(file)) sha.update(chunk);
  return sha.digest('hex');
}

if (process.argv[2] !== '--export-approved-public' || !process.env.DATABASE_URL) {
  throw new Error('Explicit --export-approved-public and DATABASE_URL are required');
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const cases = [];
  await mkdir(path.join(bundleRoot, 'media'), { recursive: true });
  for (const id of ids) {
    const result = await client.query(`SELECT id,author_id,title,summary,discipline,is_featured,featured_rank,
      published_at,created_at,story_json FROM works WHERE id=$1 AND status='approved'`, [id]);
    if (result.rowCount !== 1 || result.rows[0].author_id !== 'user-student-demo') throw new Error(`Not an approved curated case: ${id}`);
    const row = result.rows[0];
    const tags = await client.query(`SELECT t.id,t.name,t.slug FROM tags t
      JOIN work_tags wt ON wt.tag_id=t.id WHERE wt.work_id=$1 ORDER BY t.name`, [id]);
    const images = await client.query(`SELECT id,file_name,mime_type,storage_key,file_size,sha256,alt_text,sort_order,created_at
      FROM work_assets WHERE work_id=$1 AND asset_type='image' AND moderation_status='approved'
      ORDER BY sort_order,created_at`, [id]);
    if (!images.rowCount) throw new Error(`Missing public images: ${id}`);
    const assets = [];
    for (const image of images.rows) {
      if (!/^users\/[A-Za-z0-9_-]+\/works\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(image.storage_key)
        || !/^image\/(png|jpeg|webp|gif)$/.test(image.mime_type)
        || !/^[a-f0-9]{64}$/.test(image.sha256)) throw new Error('Unsafe public image');
      const source = path.resolve(uploadRoot, ...image.storage_key.split('/'));
      if (!source.startsWith(uploadRoot + path.sep) || await hash(source) !== image.sha256) throw new Error(`Image checksum mismatch: ${image.id}`);
      await copyFile(source, path.join(bundleRoot, 'media', image.sha256));
      assets.push({
        id: image.id, fileName: image.file_name, mimeType: image.mime_type,
        storageKey: image.storage_key, fileSize: image.file_size, sha256: image.sha256,
        altText: image.alt_text, sortOrder: image.sort_order, createdAt: image.created_at,
      });
    }
    const { authorizationNote, ...publicStory } = row.story_json;
    if (publicStory.authorization !== 'confirmed' || publicStory.origin !== 'collected') throw new Error(`Case authorization is not confirmed: ${id}`);
    publicStory.allowDocumentDownload = false;
    cases.push({
      id, authorId: row.author_id, title: row.title, summary: row.summary,
      discipline: row.discipline, isFeatured: row.is_featured,
      featuredRank: row.featured_rank, publishedAt: row.published_at,
      createdAt: row.created_at, story: publicStory, tags: tags.rows, assets,
    });
  }
  if (cases.length !== 9 || cases.reduce((sum, item) => sum + item.assets.length, 0) !== 53) throw new Error('Unexpected showcase size');
  await writeFile(path.join(bundleRoot, 'manifest.json'), JSON.stringify({ version: 1, cases }, null, 2) + '\n');
  console.log(JSON.stringify({ cases: cases.length, images: 53, privateNotesExported: false }));
} finally {
  await client.end();
}
