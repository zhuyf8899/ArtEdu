# 本地 embedding 服务

为课程 RAG（`apps/api/src/modules/rag`）提供自托管的 OpenAI 兼容 embedding 接口，课程正文不出服务器。

它是 staging 部署的一部分，由 `docker-compose.staging.yml` 的 `embedding` 服务运行，不是旁挂脚本。

## 模型

| 项 | 值 |
| --- | --- |
| 模型 | `BAAI/bge-base-zh-v1.5`（ONNX int8 导出，取自 `Xenova/bge-base-zh-v1.5`） |
| 参数量 | 约 1.02 亿（0.1B），模型文件约 98MB |
| 输出维度 | **768** |
| Pooling | CLS + L2 归一化（BGE 官方推荐） |
| 常驻内存 | 约 300MB |

选它的原因：staging 机器只有 1.6G 内存、2 vCPU、无 GPU，0.6B 级模型（bge-m3 / Qwen3-Embedding-0.6B）无法常驻，0.1B 的 bge-base-zh-v1.5 在中文检索质量与内存之间比较平衡。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，返回模型名、维度、pooling 方式 |
| GET | `/v1/models` | 模型列表 |
| POST | `/v1/embeddings` | OpenAI 兼容；`{ "input": "文本" }` 或 `{ "input": ["a","b"] }` |

容器用 `EMBEDDING_API_KEY`（来自服务器 `.env` 的 `RAG_EMBEDDING_API_KEY`）保护 `/v1`，请求必须携带 `Authorization: Bearer <key>`。服务不映射任何宿主机端口，只在 compose 内网可达。

## 部署与运维

模型权重不进镜像也不进 Git：`deploy/fetch-embedding-model.sh` 下载到 `ARTEDU_MODEL_DIR`（默认 `./models`）并校验固定 SHA-256，compose 只读挂载到容器 `/model`。换模型或换版本时必须同步更新脚本里的校验值和 `RAG_EMBEDDING_DIMENSIONS`。

```bash
# 单独准备/更新模型
bash deploy/fetch-embedding-model.sh

# 只重建这一个服务（不动 api/web）
docker compose -f docker-compose.staging.yml up -d --build embedding

# 日志与健康状态
docker compose -f docker-compose.staging.yml logs --tail=50 embedding
docker compose -f docker-compose.staging.yml ps embedding
```

`deploy/deploy-staging.sh` 已把它纳入标准部署流程（准备模型 → 构建镜像 → 重建容器），并在末尾报告它的健康状况；未就绪只会提示，不会让整次部署失败，因为它不影响站点其它功能。

## 与 RAG 代码的接线

`api` 与 `rag-worker` 通过 `RAG_EMBEDDING_BASE_URL` 等四个变量访问本服务（见 `deploy/staging.env.example`）。RAG Worker 会使用 `pdftotext` 提取 PDF、按页切片、批量调用本服务并写入 pgvector；查询按余弦相似度召回分块，服务异常时回退到 `transcript_text` 精确匹配。任务最多重试 3 次，崩溃 Worker 遗留的 processing 任务会在 15 分钟后自动回收。生产环境仍应在完成数据验证后再把 `RAG_ENABLED` 设为 `true`。

## 维度对齐

`migrations/0016_rag_pgvector_foundation.sql` 最初把 `rag_chunks.embedding` 定为 `vector(1024)`；`migrations/0024_rag_embedding_dimensions.sql` 已把它对齐到本模型的 768 维并重建 HNSW 索引（该表迁移前为空）。部署时模型输出、`RAG_EMBEDDING_DIMENSIONS` 与列类型三者必须一致。
