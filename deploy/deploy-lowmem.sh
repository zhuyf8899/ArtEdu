#!/usr/bin/env bash
# 低内存部署包装：这台机器只有 1.6G 内存且无 swap，
# 并行构建两个 Node 镜像曾把整机拖死（2026-09-11）。
# 因此先把非必需的 crawler/websearch 停掉腾内存，串行构建，跑完再拉起它们。
set -uo pipefail

cd "$HOME/artedu"
COMPOSE="docker compose -f docker-compose.staging.yml"

echo "[lowmem] 可用内存："
free -m | head -2
echo "[lowmem] 停止 crawler + websearch（只影响智能搜索工具，不影响站点与创作页）"
$COMPOSE stop crawler websearch || true
sleep 2
echo "[lowmem] 停止后可用内存："
free -m | head -2

echo "[lowmem] 开始部署（串行构建由 deploy-staging.sh 保证）"
ARTEDU_ALLOW_LOW_MEMORY=1 bash deploy/deploy-staging.sh
STATUS=$?

echo "[lowmem] 恢复 crawler + websearch"
$COMPOSE up -d crawler websearch || true

echo "[lowmem] 结束，deploy 退出码 $STATUS"
echo "LOWMEM_DEPLOY_DONE status=$STATUS"
exit $STATUS
