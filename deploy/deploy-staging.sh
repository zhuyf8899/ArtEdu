#!/usr/bin/env bash
# ArtEdu staging 部署脚本：构建 api/web/rag-worker → 迁移 → 重启容器
# 由 Hermes 生成，2026-09-11；不含任何密钥（密钥在 ~/artedu/.env，git 忽略）
#
# ⚠ 2026-09-11 教训：本机（阿里云免费机，1.6G 内存、无 swap）执行
#   `docker compose build api web` 并行构建两个 Node 镜像时内存耗尽，
#   整机失去响应（SSH 握手超时、站点不可达）近一小时。
#   因此现在改为**串行构建**，并在内存不足时要求显式确认。
#
# ⚠ 2026-09-14 教训：rag-worker 与 api **共用 deploy/Dockerfile.api**，
#   只 build api/web 时 rag-worker 镜像不会重建，容器会一直跑旧代码
#   （实测线上 rag-worker 停在 09-12 的镜像上，而 api/web 已是当天构建）。
#   因此第 2 步显式补建 rag-worker；同 Dockerfile 走层缓存，几乎不额外耗时。
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.staging.yml"
export ARTEDU_VERSION="$(git rev-parse --short HEAD)"

echo "[0/11] 部署前版本"
git log --oneline -1

echo "[1/11] 资源检查"
free -m | head -2
SWAP_TOTAL=$(free -m | awk '/^Swap:/ {print $2}')
TOTAL_MB=$(free -m | awk '/^Mem:/ {print $2}')
echo "  内存 ${TOTAL_MB}MB / swap ${SWAP_TOTAL}MB"
if [ "${SWAP_TOTAL:-0}" -lt 256 ] && [ "${TOTAL_MB:-0}" -lt 2048 ] && [ "${ARTEDU_ALLOW_LOW_MEMORY:-0}" != "1" ]; then
  cat <<'WARN'
  ✘ 内存不足且没有 swap：并行/连续构建 Node 镜像会拖死整机。
    先加 2G swap（需要 root）再重试：
      sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
        && sudo mkswap /swapfile && sudo swapon /swapfile \
        && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    确认要继续（风险自担）可加环境变量：ARTEDU_ALLOW_LOW_MEMORY=1
WARN
  exit 1
fi

echo "[2/11] 构建 api 镜像（串行，避免同时占用内存）"
$COMPOSE build api

echo "[3/11] 构建 rag-worker 镜像（与 api 同 Dockerfile，走层缓存，几乎不耗时）"
$COMPOSE build rag-worker

echo "[4/11] 准备本地 embedding 模型（缺失时下载约 100MB 并校验 SHA-256）"
ARTEDU_MODEL_DIR="${ARTEDU_MODEL_DIR:-}" bash deploy/fetch-embedding-model.sh

echo "[5/11] 构建 embedding 镜像（与 api/web 串行，避免同时占用内存）"
$COMPOSE build embedding

echo "[6/11] 构建 web 镜像（串行）"
$COMPOSE build web

echo "[7/11] 确保 postgres 运行并健康"
$COMPOSE up -d postgres
db_ready=0
for _ in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U artedu -d artedu >/dev/null 2>&1; then
    echo "  postgres 就绪"
    db_ready=1
    break
  fi
  sleep 2
done
if [ "$db_ready" != 1 ]; then echo '数据库未就绪，停止部署' >&2; exit 1; fi

# Keep data and media together before any schema migration. Existing backups are never overwritten.
bash deploy/backup-staging.sh "$(pwd -P)/backups/predeploy-$(date +%Y%m%d-%H%M%S)-$$"

echo "[8/11] 应用数据库迁移"
$COMPOSE run --rm api npm run db:migrate

echo "[9/11] 重建 embedding、应用与 RAG Worker"
$COMPOSE up -d embedding api rag-worker web

echo "[10/11] 容器状态与健康检查"
$COMPOSE ps
sleep 5
ready=0
for _ in $(seq 1 12); do
  if curl -fsS -m 10 "http://127.0.0.1:${ARTEDU_HTTP_PORT:-8080}/api/health/ready" >/dev/null; then ready=1; break; fi
  sleep 5
done
if [ "$ready" = 1 ]; then
  echo "  健康检查通过"
else
  echo "  ! 健康检查未通过，请查看：$COMPOSE logs --tail=80 api rag-worker web"
  exit 1
fi

# embedding 是独立服务：未就绪只影响课程 RAG 检索，不阻断站点。
embedding_health=$($COMPOSE ps --format '{{.Health}}' embedding 2>/dev/null | head -1)
if [ "$embedding_health" = "healthy" ]; then
  echo "  embedding 服务健康（模型：${RAG_EMBEDDING_MODEL:-bge-base-zh-v1.5}，维度：${RAG_EMBEDDING_DIMENSIONS:-768}）"
else
  echo "  ! embedding 服务未就绪（RAG 检索暂不可用，其它功能不受影响），请查看：$COMPOSE logs --tail=40 embedding"
fi

echo "DEPLOY_DONE"
