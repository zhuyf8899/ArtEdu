#!/usr/bin/env bash
# 低内存部署包装：这台机器只有 1.6G 内存且无 swap，
# 并行构建两个 Node 镜像曾把整机拖死（2026-09-11）。
# deploy-staging.sh 已改为串行构建，这里再加一层内存快照与显式放行。
#
# 2026-09-13 起 crawler / websearch 容器已删除：联网检索改走 DeepSeek 原生搜索
# （检索与正文抽取都在服务商侧完成），不再需要本地 Chromium，
# 因此本脚本不再需要"先停非必需容器腾内存"那一步。
set -uo pipefail

cd "$HOME/artedu"

echo "[lowmem] 部署前可用内存："
free -m | head -2

echo "[lowmem] 开始部署（串行构建由 deploy-staging.sh 保证）"
ARTEDU_ALLOW_LOW_MEMORY=1 bash deploy/deploy-staging.sh
STATUS=$?

echo "[lowmem] 结束，deploy 退出码 $STATUS"
echo "LOWMEM_DEPLOY_DONE status=$STATUS"
exit $STATUS
