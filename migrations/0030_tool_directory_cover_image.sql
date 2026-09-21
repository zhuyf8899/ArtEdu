-- 每个工作台入口可独立指定背景图；留空时前端按图标使用默认视觉。
ALTER TABLE tool_directory_links
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
