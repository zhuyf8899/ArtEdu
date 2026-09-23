# 第一版课程 RAG 接口

课程正文不会发送到互联网：embedding 由部署在同一台服务器上的本地模型服务承担，检索链路不调用任何外部模型。

当前（2026-09-18）的状态分两层：

- **Provider 已就绪**：`docker-compose.staging.yml` 的 `embedding` 服务已在 staging 上运行，提供 OpenAI 兼容的 `/v1/embeddings`（见下文）。
- **摄取与向量检索已落地**：`rag.worker.ts` 会领取 PDF 索引任务、调用本地 embedding 服务并写入 pgvector；`rag.service.ts` 按余弦相似度召回证据，服务暂时不可用时回退到教师录入的 `transcript_text` 精确匹配。Worker 对失败任务最多重试 3 次，并会回收崩溃 Worker 遗留的过期 processing 任务。

- `POST /api/courses/:courseId/rag/search`：课程提问接口；命中 PDF 向量分块时返回 `vector_evidence`，命中转写文本时返回 `local_text_evidence`，均无命中时返回 `indexed_no_match` 或 `awaiting_embedding_provider`。
- `POST /api/admin/courses/:courseId/resources/:resourceId/rag/reindex`：教师或管理员把 PDF 放入索引队列。
- `GET /api/admin/courses/:courseId/resources/:resourceId/rag/status`：读取索引队列和资料状态。

上传 PDF 会自动入队；DOCX、PPTX、视频不在第一版解析范围。当前的本地文本匹配只读取教师随资源录入的转写文本，且学生必须已加入课程；课程资料正文不会发送给互联网搜索链路。联网搜索只会在本地证据不足时接收用户问题，并由 `allowWebFallback` 明确控制。

## 本地 embedding Provider

| 项 | 值 |
| --- | --- |
| 模型 | `BAAI/bge-base-zh-v1.5`（ONNX int8 导出，取自 `Xenova/bge-base-zh-v1.5`） |
| 规模 | 约 1.02 亿参数（0.1B），模型文件约 98MB |
| 输出维度 | 768（CLS pooling + L2 归一化） |
| 常驻内存 | 约 300MB |
| 服务 | `services/embedding`（FastAPI + onnxruntime），容器 `artedu-embedding` |
| 接口 | `GET /health`、`GET /v1/models`、`POST /v1/embeddings` |

选 0.1B 级别而不是 bge-m3 / Qwen3-Embedding-0.6B：staging 机器只有 1.6G 内存、2 vCPU、无 GPU，0.6B 级模型无法常驻。

模型文件不打进镜像、也不提交 Git。`deploy/fetch-embedding-model.sh` 把它们下载到 `ARTEDU_MODEL_DIR`（默认 `./models`，已 gitignore）并用固定 SHA-256 校验，`docker-compose.staging.yml` 只读挂载到容器 `/model`。`deploy/deploy-staging.sh` 已包含「准备模型 → 构建 embedding 镜像 → 重建容器」三步。

服务器 `.env` 中的接线（密钥只写在服务器，不进镜像、不进前端包）：

```env
ARTEDU_MODEL_DIR=./models
RAG_EMBEDDING_BASE_URL=http://embedding:8080/v1
RAG_EMBEDDING_MODEL=bge-base-zh-v1.5
RAG_EMBEDDING_API_KEY=<与 embedding 容器共用的访问密钥>
RAG_EMBEDDING_DIMENSIONS=768
```

`embedding` 是独立服务：它没起来时只有 RAG 检索不可用，登录、课程、创作、案例都不受影响，因此没有给 api 加 `depends_on`。

### 维度对齐

`migrations/0024_rag_embedding_dimensions.sql` 把 `rag_chunks.embedding` 从占位用的 `vector(1024)` 调整为 `vector(768)` 并重建 HNSW 索引（该表迁移前为空）。部署时 `RAG_EMBEDDING_DIMENSIONS`、列类型和模型输出三者必须保持一致。

### 验证方式

```bash
# 维度与鉴权
docker exec artedu-api-1 node -e "const k=process.env.RAG_EMBEDDING_API_KEY;fetch('http://embedding:8080/v1/embeddings',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+k},body:JSON.stringify({input:'传统纹样'})}).then(r=>r.json()).then(d=>console.log(d.data[0].embedding.length))"

# 语义质量（高/低应明显分开，且模长为 1）
docker exec artedu-embedding python -c "import json,urllib.request,os,numpy as np;k=os.environ['EMBEDDING_API_KEY'];r=urllib.request.Request('http://127.0.0.1:8080/v1/embeddings',json.dumps({'input':['传统纹样','民间剪纸纹样','深度学习']}).encode(),{'content-type':'application/json','authorization':'Bearer '+k});v=np.array([x['embedding'] for x in json.load(urllib.request.urlopen(r))['data']]);print(round(float(v[0]@v[1]),4), round(float(v[0]@v[2]),4), np.linalg.norm(v,axis=1).round(4).tolist())"
```
