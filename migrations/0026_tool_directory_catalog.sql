-- 设计工作台的每个入口都由数据表驱动，避免“前端写死一半、后台新增一半”的两套来源。
-- created_by 对系统预置工具没有实际维护人，因此允许为空；管理员后来新增或编辑的记录仍会保存操作者。
ALTER TABLE tool_directory_links ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE tool_directory_links ADD COLUMN IF NOT EXISTS icon_key TEXT NOT NULL DEFAULT 'link'
  CHECK (icon_key IN ('design', 'image', 'idea', 'learning', 'ai', 'code', 'link'));
ALTER TABLE tool_directory_links ADD COLUMN IF NOT EXISTS launch_mode TEXT NOT NULL DEFAULT 'new_tab'
  CHECK (launch_mode IN ('new_tab', 'same_tab'));
ALTER TABLE tool_directory_links ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tool_directory_links ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- 预置入口也进入同一数据结构。ON CONFLICT 使升级不会覆盖管理员已调整过的内容。
INSERT INTO tool_directory_links (id, category, name, detail, href, icon_key, launch_mode, is_featured, sort_order, status)
VALUES
  ('tool-directory-figma', '界面与版式', 'Figma', '协作界面与原型设计', 'https://www.figma.com/', 'design', 'new_tab', TRUE, 10, 'active'),
  ('tool-directory-canva', '界面与版式', 'Canva', '版式、海报与演示设计', 'https://www.canva.com/', 'design', 'new_tab', FALSE, 20, 'active'),
  ('tool-directory-photopea', '界面与版式', 'Photopea', '浏览器内图片编辑', 'https://www.photopea.com/', 'image', 'new_tab', FALSE, 30, 'active'),
  ('tool-directory-behance', '灵感与素材', 'Behance', '查看设计作品与案例', 'https://www.behance.net/', 'idea', 'new_tab', TRUE, 10, 'active'),
  ('tool-directory-unsplash', '灵感与素材', 'Unsplash', '寻找可用视觉素材', 'https://unsplash.com/', 'image', 'new_tab', FALSE, 20, 'active'),
  ('tool-directory-piying', '灵感与素材', '数字皮影实验室', '探索数字皮影的生成、演绎与制作', 'https://piying.woooostudio.com/', 'design', 'new_tab', TRUE, 30, 'active'),
  ('tool-directory-create', '平台工具', 'AI 创作助手', '生成图像、网页或文档草稿', '/create', 'ai', 'same_tab', TRUE, 10, 'active'),
  ('tool-directory-community', '平台工具', '案例社区', '查看优秀案例与复用方法', '/community', 'idea', 'same_tab', FALSE, 20, 'active'),
  ('tool-directory-learning', '平台工具', '课程中心', '学习课程与阅读课件', '/learning', 'learning', 'same_tab', FALSE, 30, 'active')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS tool_directory_links_catalog_idx
  ON tool_directory_links (status, category, is_featured DESC, sort_order, created_at);
