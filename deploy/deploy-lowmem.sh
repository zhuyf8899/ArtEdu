#!/usr/bin/env bash
# 低内存部署包装：目标机为 1.6G 内存，已配置 swapfile 与 zram。
# swap 只有在 swappiness 正确配置时才真正可用；默认不绕过主脚本保护。
# 2026-09-20 事故证明：无条件设置 ARTEDU_ALLOW_LOW_MEMORY 会让安全检查形同虚设。
set -uo pipefail
cd "$HOME/artedu"
LOG_FILE="deploy/last-deploy.log"
snapshot() {
  {
    echo "===== $(date '+%F %T %z') $1 ====="
    echo '[free -m]'; free -m
    echo '[swapon --show]'; swapon --show || true
    echo '[vm.swappiness]'; cat /proc/sys/vm/swappiness
    echo '[docker stats --no-stream]'; docker stats --no-stream || true
    echo
  } | tee -a "$LOG_FILE"
}
snapshot '部署前内存快照'
if [ "${ALLOW_LOW_MEMORY:-0}" = 1 ]; then
  echo '[lowmem] ! 已通过 ALLOW_LOW_MEMORY=1 强制绕过内存检查。' | tee -a "$LOG_FILE"
  ARTEDU_ALLOW_LOW_MEMORY=1 bash deploy/deploy-staging.sh
else
  unset ARTEDU_ALLOW_LOW_MEMORY
  echo '[lowmem] 开始部署：内存保护已启用。' | tee -a "$LOG_FILE"
  bash deploy/deploy-staging.sh
fi
STATUS=$?
snapshot '部署后内存快照'
echo "[lowmem] 结束，deploy 退出码 $STATUS"
echo "LOWMEM_DEPLOY_DONE status=$STATUS"
exit $STATUS
