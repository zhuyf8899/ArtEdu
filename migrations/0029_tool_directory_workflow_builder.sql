-- 节点工作流作为设计工具的一条入口展示，前端会直接打开画布而非跳转到旧的独立区块。
UPDATE tool_directory_links
SET name = '新建节点工作流',
    detail = '搭建、保存并运行自己的节点画布',
    href = '/studio?builder=1',
    icon_key = 'code',
    launch_mode = 'same_tab',
    is_featured = TRUE,
    status = 'active',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'tool-directory-workflow';
