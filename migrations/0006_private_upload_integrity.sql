-- 私有上传文件的完整性元数据。既有外部演示资源保留为空；新上传文件必须记录大小和 SHA-256。

BEGIN;

ALTER TABLE work_assets
  ADD COLUMN IF NOT EXISTS sha256 TEXT;

ALTER TABLE work_assets
  DROP CONSTRAINT IF EXISTS work_assets_file_size_check;

ALTER TABLE work_assets
  ADD CONSTRAINT work_assets_file_size_check
  CHECK (file_size IS NULL OR file_size >= 0);

ALTER TABLE work_assets
  DROP CONSTRAINT IF EXISTS work_assets_sha256_check;

ALTER TABLE work_assets
  ADD CONSTRAINT work_assets_sha256_check
  CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');

COMMIT;
