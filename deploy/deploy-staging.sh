#!/usr/bin/env bash
# ArtEdu staging 部署脚本：构建 api/web → 迁移 → 重启容器
# 由 Hermes 生成，2026-09-11；不含任何密钥（密钥在 ~/artedu/.env，git 忽略）
set -euo pipefail

cd "$HOME/artedu"
COMPOSE="docker compose -f docker-compose.staging.yml"

echo "[0/5] 部署前版本"
git log --oneline -1
echo "[0/5] 可用内存"
free -m | head -2
echo "[0/5] swap"
swapon --show 2>/dev/null || echo "(无 swap)"

echo "[1/5] 构建 api 与 web 镜像（npm ci + tsc + vite build，耗时较长）"
$COMPOSE build api web

echo "[2/5] 确保 postgres 运行并健康"
$COMPOSE up -d postgres
for i in $(seq 1 30); do
  if docker exec artedu-postgres-1 pg_isready -U artedu -d artedu >/dev/null 2>&1; then
    echo "  postgres 就绪"
    break
  fi
  sleep 2
done

echo "[3/5] 应用数据库迁移（应包含 0013_temporary_creation_uploads）"
$COMPOSE run --rm api npm run db:migrate

echo "[4/5] 重建 api 与 web 容器"
$COMPOSE up -d api web

echo "[5/5] 容器状态"
$COMPOSE ps
echo "DEPLOY_DONE"
