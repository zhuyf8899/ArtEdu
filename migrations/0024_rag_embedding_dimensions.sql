-- 把课程 RAG 的向量维度从占位用的 1024 对齐到实际部署的本地 embedding 模型。
--
-- 模型：BAAI/bge-base-zh-v1.5（ONNX int8，见 services/embedding 与 docker-compose.staging.yml
-- 的 embedding 服务），输出 768 维，与 RAG_EMBEDDING_DIMENSIONS=768 一致。
-- 该表在本迁移前为空（取证：rag_documents / rag_ingestion_jobs / rag_chunks 均为 0 行），
-- 因此可以直接改列类型；HNSW 索引必须随维度重建。
BEGIN;

DROP INDEX IF EXISTS idx_rag_chunks_embedding_hnsw;
ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(768);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw
  ON rag_chunks USING hnsw (embedding vector_cosine_ops);

COMMIT;
