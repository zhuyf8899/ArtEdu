-- 案例社区与课程中心已有独立导航，不在设计工作台重复展示。
-- 节点工作流是平台内的创作工具，因此作为一条独立工具入口保留在同一目录。
UPDATE tool_directory_links
SET status = 'archived', updated_at = CURRENT_TIMESTAMP
WHERE id IN ('tool-directory-community', 'tool-directory-learning');

INSERT INTO tool_directory_links (id, category, name, detail, href, icon_key, launch_mode, is_featured, sort_order, status)
VALUES ('tool-directory-workflow', '平台工具', '节点工作流', '通过节点画布组织并运行创作流程', '/studio#workflow-catalog', 'code', 'same_tab', TRUE, 40, 'active')
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  detail = EXCLUDED.detail,
  href = EXCLUDED.href,
  icon_key = EXCLUDED.icon_key,
  launch_mode = EXCLUDED.launch_mode,
  is_featured = EXCLUDED.is_featured,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;
