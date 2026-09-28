/** Install the nine previously approved, publicly displayable community cases.
 * The bundle contains images only: no source documents, video, passwords or
 * private authorization notes. Verify every byte before changing the DB.
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bundleRoot = path.join(repositoryRoot, 'seed', 'community-showcase');
const manifestPath = path.join(bundleRoot, 'manifest.json');
const uploadRoot = path.resolve(process.env.UPLOAD_ROOT || path.join(process.cwd(), 'data', 'uploads'));
const allowedKey = /^users\/[A-Za-z0-9_-]+\/works\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;
const allowedHash = /^[a-f0-9]{64}$/;
const allowedMime = /^image\/(png|jpeg|webp|gif)$/;

export function targetForKey(root, key) {
  if (!allowedKey.test(key)) throw new Error('Unsafe showcase storage key');
  const target = path.resolve(root, ...key.split('/'));
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Showcase path escapes upload root');
  return target;
}

async function digest(file) {
  const sha = createHash('sha256');
  for await (const chunk of createReadStream(file)) sha.update(chunk);
  return sha.digest('hex');
}

export async function verifyBundle(root = bundleRoot) {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.cases?.length !== 9) throw new Error('Expected nine curated cases');
  const workIds = new Set();
  const assetIds = new Set();
  let imageCount = 0;
  let bytes = 0;
  for (const work of manifest.cases) {
    if (!work.id || workIds.has(work.id) || !work.title || !Array.isArray(work.assets)) throw new Error('Invalid showcase case');
    if (work.authorId !== 'user-student-demo' || work.story?.authorizationNote || work.story?.allowDocumentDownload) throw new Error('Private case metadata is not allowed in the public bundle');
    workIds.add(work.id);
    for (const asset of work.assets) {
      if (!asset.id || assetIds.has(asset.id) || !allowedHash.test(asset.sha256) || !allowedMime.test(asset.mimeType)) throw new Error('Invalid showcase image metadata');
      targetForKey(uploadRoot, asset.storageKey);
      if (!asset.storageKey.includes(`/works/${work.id}/`)) throw new Error('Image belongs to a different case');
      assetIds.add(asset.id);
      const source = path.join(root, 'media', asset.sha256);
      const info = await stat(source);
      if (info.size !== asset.fileSize || await digest(source) !== asset.sha256) throw new Error(`Bundled image checksum mismatch: ${asset.id}`);
      imageCount++;
      bytes += info.size;
    }
  }
  if (imageCount !== 53) throw new Error('Expected 53 public showcase images');
  return { manifest, imageCount, bytes };
}

async function installFile(source, target, expectedHash) {
  try {
    if (await digest(target) !== expectedHash) throw new Error(`Existing image differs: ${target}`);
    return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.showcase-${randomUUID()}`;
  try {
    await pipeline(createReadStream(source), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    if (await digest(temporary) !== expectedHash) throw new Error('Image changed during copy');
    // link is exclusive: never overwrite a user-uploaded file during a repeat install.
    const { link } = await import('node:fs/promises');
    await link(temporary, target);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST' && await digest(target) === expectedHash) return false;
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function install(manifest) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  let restored = 0;
  for (const work of manifest.cases) for (const asset of work.assets) {
    const source = path.join(bundleRoot, 'media', asset.sha256);
    if (await installFile(source, targetForKey(uploadRoot, asset.storageKey), asset.sha256)) restored++;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let created = 0;
  try {
    await client.query('BEGIN');
    // A non-login author record is enough for fresh staging databases. Normal
    // db:seed can later add the demo account identity without changing the ID.
    await client.query(`INSERT INTO users(id,username,display_name,status)
      VALUES ('user-student-demo','student.demo','演示学生','active') ON CONFLICT (id) DO NOTHING`);
    for (const work of manifest.cases) {
      const sameTitle = await client.query('SELECT id FROM works WHERE title=$1 AND id<>$2', [work.title, work.id]);
      if (sameTitle.rowCount) throw new Error(`Case title already exists with another ID: ${work.title}`);
      const existing = await client.query('SELECT title,status,author_id FROM works WHERE id=$1', [work.id]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.title !== work.title || row.status !== 'approved' || row.author_id !== work.authorId) throw new Error(`Existing case differs: ${work.id}`);
      } else {
        await client.query(`INSERT INTO works(id,author_id,title,summary,discipline,is_featured,featured_rank,status,published_at,created_at,story_json)
          VALUES($1,$2,$3,$4,$5,$6,$7,'approved',$8,$9,$10::jsonb)`,
          [work.id, work.authorId, work.title, work.summary, work.discipline, work.isFeatured, work.featuredRank, work.publishedAt, work.createdAt, JSON.stringify(work.story)]);
        created++;
      }
      for (const tag of work.tags) {
        await client.query('INSERT INTO tags(id,name,slug) VALUES($1,$2,$3) ON CONFLICT (name) DO NOTHING', [tag.id, tag.name, tag.slug]);
        const actual = await client.query('SELECT id FROM tags WHERE name=$1', [tag.name]);
        await client.query('INSERT INTO work_tags(work_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [work.id, actual.rows[0].id]);
      }
      for (const asset of work.assets) {
        const existingAsset = await client.query('SELECT work_id,storage_key,sha256,asset_type FROM work_assets WHERE id=$1', [asset.id]);
        if (existingAsset.rowCount) {
          const row = existingAsset.rows[0];
          if (row.work_id !== work.id || row.storage_key !== asset.storageKey || row.sha256 !== asset.sha256 || row.asset_type !== 'image') throw new Error(`Existing asset differs: ${asset.id}`);
          continue;
        }
        await client.query(`INSERT INTO work_assets(id,work_id,file_name,mime_type,storage_key,file_size,sha256,asset_type,alt_text,sort_order,moderation_status,created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,'image',$8,$9,'approved',$10)`,
          [asset.id, work.id, asset.fileName, asset.mimeType, asset.storageKey, asset.fileSize, asset.sha256, asset.altText, asset.sortOrder, asset.createdAt]);
      }
    }
    await client.query('COMMIT');
    return { created, restored, cases: manifest.cases.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (!['--verify', '--install'].includes(mode)) throw new Error('Usage: node scripts/install-community-showcase.mjs --verify|--install');
  const { manifest, imageCount, bytes } = await verifyBundle();
  console.log(JSON.stringify(mode === '--install' ? { ...await install(manifest), images: imageCount, bytes } : { cases: manifest.cases.length, images: imageCount, bytes }));
}
