#!/usr/bin/env bash
# ArtEdu staging 部署脚本：构建 api/web → 迁移 → 重启容器
# 由 Hermes 生成，2026-09-11；不含任何密钥（密钥在 ~/artedu/.env，git 忽略）
#
# ⚠ 2026-09-11 教训：本机（阿里云免费机，1.6G 内存、无 swap）执行
#   `docker compose build api web` 并行构建两个 Node 镜像时内存耗尽，
#   整机失去响应（SSH 握手超时、站点不可达）近一小时。
#   因此现在改为**串行构建**，并在内存不足时要求显式确认。
set -euo pipefail

cd "$HOME/artedu"
COMPOSE="docker compose -f docker-compose.staging.yml"

echo "[0/6] 部署前版本"
git log --oneline -1

echo "[0/6] 资源检查"
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

echo "[1/6] 构建 api 镜像（串行，避免同时占用内存）"
$COMPOSE build api

echo "[2/6] 构建 web 镜像（串行）"
$COMPOSE build web

echo "[3/6] 确保 postgres 运行并健康"
$COMPOSE up -d postgres
for _ in $(seq 1 30); do
  if docker exec artedu-postgres-1 pg_isready -U artedu -d artedu >/dev/null 2>&1; then
    echo "  postgres 就绪"
    break
  fi
  sleep 2
done

echo "[4/6] 应用数据库迁移"
$COMPOSE run --rm api npm run db:migrate

echo "[5/6] 重建应用、RAG Worker 与检索容器"
$COMPOSE up -d api rag-worker websearch crawler web

echo "[6/6] 容器状态与健康检查"
$COMPOSE ps
sleep 5
if curl -fsS -m 15 http://127.0.0.1:8080/api/health >/dev/null; then
  echo "  健康检查通过"
else
  echo "  ! 健康检查未通过，请查看：$COMPOSE logs --tail=80 api rag-worker web"
fi
echo "DEPLOY_DONE"
