import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const sourceRoot = process.argv[2] ?? "/data/uploads/imports/AI课程设计";
const uploadRoot = process.env.UPLOAD_ROOT ?? "/data/uploads";
const ownerId = process.env.COURSE_IMPORT_OWNER_ID ?? "user-admin-demo";
const sourceName = "AI课程设计.zip";
const copyrightNote = "仅限校内教学与 AI 检索使用；学生端不公开原始文件。";

const categories: Record<string, string> = {
  "用户体验设计": "交互设计",
  "实体交互之Arduino实操": "交互设计",
  "陶瓷造型设计": "陶瓷艺术",
  "信息可视化与数据叙事": "信息设计",
  "字体与版式设计": "视觉设计",
  "设计思维与问题建构": "设计基础",
  "设计理论之符号学原理": "设计理论",
  "设计方法与策略": "设计方法",
  "陶瓷材料工艺与实践": "陶瓷艺术",
  "交互设计": "交互设计",
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL 未配置");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const owner = await client.query("SELECT id FROM users WHERE id = $1", [ownerId]);
    if (!owner.rowCount) throw new Error(`课程创建者不存在: ${ownerId}`);

    const directories = (await readdir(sourceRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
    if (!directories.length) throw new Error(`未找到课程目录: ${sourceRoot}`);

    await mkdir(uploadRoot, { recursive: true, mode: 0o700 });
    let imported = 0;
    let skipped = 0;

    for (const directory of directories) {
      const courseId = `course-import-${digest(directory.name)}`;
      const lessonId = `lesson-import-${digest(directory.name)}`;
      const slug = `import-${digest(directory.name)}`;
      const coursePath = path.join(sourceRoot, directory.name);
      const files = (await readdir(coursePath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf") && !entry.name.startsWith("._"))
        .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

      await client.query("BEGIN");
      try {
        await client.query(`
          INSERT INTO courses (id, slug, title, summary, category, difficulty, status, created_by, estimated_minutes, published_at)
          VALUES ($1, $2, $3, $4, $5, 'beginner', 'published', $6, 120, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `, [courseId, slug, directory.name, `${directory.name}课程资料，供校内教学与 AI 辅助学习使用。`, categories[directory.name] ?? "设计教育", ownerId]);
        await client.query(`
          INSERT INTO course_lessons (id, course_id, title, summary, lesson_type, sort_order, estimated_minutes, status)
          VALUES ($1, $2, '课程资料学习', '通过课程资料与 AI 教练开展自主学习。', 'lesson', 0, 120, 'published')
          ON CONFLICT (id) DO NOTHING
        `, [lessonId, courseId]);

        for (const file of files) {
          const sourcePath = path.join(coursePath, file.name);
          if (!(await isPdf(sourcePath))) {
            console.warn(`跳过非 PDF 内容: ${sourcePath}`);
            continue;
          }
          const resourceId = `course-resource-import-${digest(`${directory.name}/${file.name}`)}`;
          const existing = await client.query("SELECT id FROM course_resources WHERE id = $1", [resourceId]);
          if (existing.rowCount) {
            skipped += 1;
            continue;
          }

          const storageKey = `${randomUUID()}-${randomUUID()}`;
          const targetPath = path.join(uploadRoot, storageKey);
          const metadata = await stat(sourcePath);
          await copyFile(sourcePath, targetPath);
          try {
            await client.query(`
              INSERT INTO course_resources (
                id, course_id, lesson_id, title, resource_type, storage_key, file_name, mime_type,
                file_size, source_name, copyright_note, sort_order, status
              ) VALUES ($1, $2, $3, $4, 'pdf', $5, $6, 'application/pdf', $7, $8, $9, $10, 'published')
            `, [resourceId, courseId, lessonId, withoutExtension(file.name), storageKey, file.name, metadata.size, sourceName, copyrightNote, imported + skipped]);
            imported += 1;
          } catch (error) {
            await rm(targetPath, { force: true });
            throw error;
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log(JSON.stringify({ sourceRoot, imported, skipped, courseCount: directories.length }));
  } finally {
    await client.end();
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function withoutExtension(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").trim();
}

async function isPdf(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, header.length, 0);
    return header.toString("ascii") === "%PDF-";
  } finally {
    await handle.close();
  }
}

void main();
