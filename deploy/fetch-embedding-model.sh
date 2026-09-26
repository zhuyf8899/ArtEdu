#!/usr/bin/env bash
# 准备本地 embedding 模型（BAAI/bge-base-zh-v1.5 的 ONNX int8 导出）。
#
# 模型文件不打进镜像，也不提交 Git：默认落在 ARTEDU_MODEL_DIR（./models），
# 由 docker-compose.staging.yml 只读挂载到容器 /model。
# 已存在且校验值一致时跳过，因此重复部署不会重复下载。
set -euo pipefail

cd "$(dirname "$0")/.."

# 解析优先级：环境变量 > 项目目录 .env > 默认 ./models。
# 注意：部署目录常常没有 .env（只有 .env.example，线上变量由 compose 的 --env-file /
# COMPOSE_ENV_FILES 注入）。所以必须先判断文件是否存在——否则 grep 会以退出码 2 结束，
# 在 set -e + pipefail 下直接把整个部署**静默中止**（2026-09-26 实测事故，日志无任何报错）。
MODEL_DIR="${ARTEDU_MODEL_DIR:-}"
if [ -z "$MODEL_DIR" ] && [ -f .env ]; then
  MODEL_DIR="$(grep -E '^ARTEDU_MODEL_DIR=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
fi
MODEL_DIR="${MODEL_DIR:-./models}"
MODEL_BASE_URL="${RAG_EMBEDDING_MODEL_BASE_URL:-https://huggingface.co/Xenova/bge-base-zh-v1.5/resolve/main}"

# 固定校验值：换模型、换版本或换来源时必须同步更新，避免部署到未预期的权重。
ONNX_SHA256=b665f3bba56c3119bc76ba131ebcc544d720a7408cb11581bdf354aaa0198d43
TOKENIZER_SHA256=7dfbf1966ebf99d471c3796e9b457329d2b2182b817e144f1e904b957745c839
CONFIG_SHA256=855206771223efad2dfb8e212a716b20c4c71c8094309ca2da79d31bacb03276

mkdir -p "$MODEL_DIR"
if [ ! -w "$MODEL_DIR" ]; then
  cat >&2 <<MSG
  ! 模型目录不可写：$MODEL_DIR
    该目录若曾被 Docker 以 root 创建，请先交给当前用户：
      sudo chown $(id -u):$(id -g) "$MODEL_DIR"
MSG
  exit 1
fi

verify() { printf '%s  %s\n' "$2" "$1" | sha256sum -c - >/dev/null 2>&1; }

download() { # 参数：url 目标路径 期望 sha256
  local url="$1" target="$2" expected="$3"
  if [ -s "$target" ] && verify "$target" "$expected"; then
    echo "  已存在且校验通过：$(basename "$target")"
    return
  fi
  echo "  下载 $(basename "$target")"
  curl -fL --retry 3 --retry-delay 2 -o "$target.part" "$url"
  mv "$target.part" "$target"
  if ! verify "$target" "$expected"; then
    echo "  ! $(basename "$target") 校验失败，请检查模型来源与版本" >&2
    exit 1
  fi
}

download "$MODEL_BASE_URL/onnx/model_quantized.onnx" "$MODEL_DIR/model_quantized.onnx" "$ONNX_SHA256"
download "$MODEL_BASE_URL/tokenizer.json" "$MODEL_DIR/tokenizer.json" "$TOKENIZER_SHA256"
download "$MODEL_BASE_URL/config.json" "$MODEL_DIR/config.json" "$CONFIG_SHA256"

echo "  模型就绪：$MODEL_DIR（$(du -h "$MODEL_DIR/model_quantized.onnx" | cut -f1)）"
