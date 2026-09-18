"""ArtEdu 校内 embedding 服务（OpenAI 兼容接口）。

用途：为课程 RAG 提供自托管的 embedding Provider，课程资料不出校内网络。
默认加载 BAAI/bge-base-zh-v1.5 的 ONNX int8 量化导出（约 0.1B 参数、768 维），
按 BGE 官方推荐使用 CLS pooling + L2 归一化。

接口：
  GET  /health           健康检查与模型元信息
  GET  /v1/models        模型列表（OpenAI 兼容形状）
  POST /v1/embeddings    {input: str | [str], model?: str}

安全：配置 EMBEDDING_API_KEY 后，所有 /v1 请求必须带 Authorization: Bearer <key>。
资源：int8 模型约 100MB，进程常驻约 300MB，可在 1.6G 内存的 staging 机器上运行。
"""

from __future__ import annotations

import os
import secrets
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Union

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from tokenizers import Tokenizer

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/model"))
MODEL_NAME = os.environ.get("MODEL_NAME", "bge-base-zh-v1.5")
MODEL_FILE = os.environ.get("MODEL_FILE", "model_quantized.onnx")
TOKENIZER_FILE = os.environ.get("TOKENIZER_FILE", "tokenizer.json")
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "512"))
MAX_BATCH = int(os.environ.get("MAX_BATCH", "16"))
POOLING = os.environ.get("POOLING", "cls").strip().lower()
ORT_THREADS = int(os.environ.get("ORT_THREADS", "2"))
API_KEY = os.environ.get("EMBEDDING_API_KEY", "").strip()

state: dict[str, object] = {}
_lock = threading.Lock()


def load_model() -> None:
    tokenizer_path = MODEL_DIR / TOKENIZER_FILE
    model_path = MODEL_DIR / MODEL_FILE
    if not tokenizer_path.is_file() or not model_path.is_file():
        raise RuntimeError(f"模型文件缺失：{tokenizer_path} / {model_path}")

    tokenizer = Tokenizer.from_file(str(tokenizer_path))
    tokenizer.enable_truncation(max_length=MAX_TOKENS)

    options = ort.SessionOptions()
    options.intra_op_num_threads = ORT_THREADS
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])

    hidden = session.get_outputs()[0].shape[-1]
    state.update(
        tokenizer=tokenizer,
        session=session,
        input_names={item.name for item in session.get_inputs()},
        dimensions=int(hidden) if isinstance(hidden, int) else 0,
    )


def encode(texts: List[str]) -> tuple[List[List[float]], int]:
    tokenizer: Tokenizer = state["tokenizer"]  # type: ignore[assignment]
    session: ort.InferenceSession = state["session"]  # type: ignore[assignment]
    input_names: set[str] = state["input_names"]  # type: ignore[assignment]

    encodings = tokenizer.encode_batch(texts)
    width = max(len(item.ids) for item in encodings)
    input_ids = np.zeros((len(encodings), width), dtype=np.int64)
    attention = np.zeros((len(encodings), width), dtype=np.int64)
    token_types = np.zeros((len(encodings), width), dtype=np.int64)
    for index, item in enumerate(encodings):
        length = len(item.ids)
        input_ids[index, :length] = item.ids
        attention[index, :length] = item.attention_mask

    feeds: dict[str, np.ndarray] = {}
    if "input_ids" in input_names:
        feeds["input_ids"] = input_ids
    if "attention_mask" in input_names:
        feeds["attention_mask"] = attention
    if "token_type_ids" in input_names:
        feeds["token_type_ids"] = token_types

    with _lock:
        hidden_state = session.run(None, feeds)[0]

    if POOLING == "mean":
        mask = attention[..., None].astype(np.float32)
        pooled = (hidden_state * mask).sum(axis=1) / np.clip(mask.sum(axis=1), 1e-9, None)
    else:
        # BGE 中文系列使用 CLS token 作为句向量。
        pooled = hidden_state[:, 0]

    norms = np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12, None)
    vectors = (pooled / norms).astype(np.float32).tolist()
    return vectors, int(attention.sum())


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_model()
    yield


app = FastAPI(title="ArtEdu Embedding", version="1.0.0", lifespan=lifespan)


class EmbeddingRequest(BaseModel):
    input: Union[str, List[str]]
    model: str | None = None
    encoding_format: str | None = None


def require_key(authorization: str | None) -> None:
    if not API_KEY:
        return
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, API_KEY):
        raise HTTPException(status_code=401, detail="invalid api key")


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "artedu-embedding",
        "model": MODEL_NAME,
        "dimensions": state.get("dimensions", 0),
        "pooling": POOLING,
        "maxTokens": MAX_TOKENS,
    }


@app.get("/v1/models")
def list_models() -> dict[str, object]:
    return {"object": "list", "data": [{"id": MODEL_NAME, "object": "model", "created": 0, "owned_by": "artedu"}]}


@app.post("/v1/embeddings")
def create_embeddings(payload: EmbeddingRequest, authorization: str | None = Header(default=None)) -> dict[str, object]:
    require_key(authorization)
    texts = [payload.input] if isinstance(payload.input, str) else [text for text in payload.input]
    texts = [text.strip() for text in texts if isinstance(text, str)]
    if not texts:
        raise HTTPException(status_code=400, detail="input 不能为空")
    if len(texts) > MAX_BATCH:
        raise HTTPException(status_code=413, detail=f"单次最多 {MAX_BATCH} 条文本")

    vectors, prompt_tokens = encode(texts)
    return {
        "object": "list",
        "data": [{"object": "embedding", "index": index, "embedding": vector} for index, vector in enumerate(vectors)],
        "model": payload.model or MODEL_NAME,
        "usage": {"prompt_tokens": prompt_tokens, "total_tokens": prompt_tokens},
    }
