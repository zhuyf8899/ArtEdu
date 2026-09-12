# 第一版课程 RAG 接口

本阶段仅提交数据库与 API 契约，不启动或配置任何 embedding 模型服务。

- `POST /api/courses/:courseId/rag/search`：课程提问接口；当前返回 `awaiting_embedding_provider`，不伪造检索结果。
- `POST /api/admin/courses/:courseId/resources/:resourceId/rag/reindex`：教师或管理员把 PDF 放入索引队列。
- `GET /api/admin/courses/:courseId/resources/:resourceId/rag/status`：读取索引队列和资料状态。

上传 PDF 会自动入队；DOCX、PPTX、视频不在第一版解析范围。后续仅接入校内 embedding Provider 后，Worker 才会读取 PDF、生成向量并写入 pgvector。课程资料正文不会发送给互联网搜索链路；联网搜索只会在本地证据不足时接收用户问题，并由 `allowWebFallback` 明确控制。
