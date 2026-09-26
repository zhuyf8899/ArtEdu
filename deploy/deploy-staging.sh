#!/usr/bin/env bash
# ArtEdu staging 部署脚本：串行构建、迁移与重启。
# 2026-09-20 事故说明：低内存机器上即使存在 swap，vm.swappiness=0 也会让内核几乎
# 不换页；docker build 峰值会使 sshd 无法 fork，表现为 TCP 能连接但没有 SSH banner。
# 所以本脚本检查当前可用内存和 swappiness，不能只看总内存或 swap 是否存在。
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.staging.yml)
export ARTEDU_VERSION="$(git rev-parse --short HEAD)"
MIN_AVAILABLE_MB="${ARTEDU_MIN_AVAILABLE_MB:-150}"

# 2026-09-26 事故：本脚本曾两次"静默死亡"——set -e 下某条命令失败后直接退出，日志停在
# 阶段标题上、干干净净没有任何报错，排障时极易误判成"还在跑"。加 ERR trap 兜底，
# 任何失败都留下行号，并把最后一条 [n/14] 标题指认为失败阶段。
trap 'status=$?; printf "[deploy] ✘ 命令失败（第 %s 行，退出码 %s）；上方最后一条 [n/14] 标题即失败阶段。\n" "$LINENO" "$status" >&2' ERR

# 2026-09-26 事故：线上容器属于 compose 项目 artedu。compose 默认按**当前目录名**推导项目名，
# 从 worktree 目录（如 ~/artedu-positive-negative-<date>）运行时得到的是另一个项目名，
# 于是 start/up 找不到既有容器（"service embedding has no container to start"），
# 构建出的镜像也被打上无人会用的前缀。这里显式钉死，可用 COMPOSE_PROJECT_NAME 覆盖。
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-artedu}"

# 2026-09-26 事故：部署目录常常只有 .env.example（线上变量由 --env-file /
# COMPOSE_ENV_FILES 注入）。缺少解析来源时 compose 会在插值阶段失败，这里提前给出
# 可操作的提示，而不是中途抛一个看不懂的错。
if ! "${COMPOSE[@]}" config --quiet >/dev/null 2>&1; then
  cat >&2 <<'MSG'
  ✘ compose 配置无法解析（通常就是缺少 .env）：部署目录只有 .env.example 属正常现象。
    本仓库通过环境变量注入线上配置，请这样运行：
      COMPOSE_ENV_FILES=$HOME/artedu/.env bash deploy/deploy-staging.sh
MSG
  exit 1
fi
echo "  compose 项目名：${COMPOSE_PROJECT_NAME}（若与线上容器不一致，下面会找不到容器）"
MEMORY_MONITOR_FILE=""
MEMORY_MONITOR_PID=""
OPTIONAL_SERVICES_STOPPED=0

mem_available_mb() { awk '/^MemAvailable:/ { printf "%d", $2 / 1024; exit }' /proc/meminfo; }
memory_total_mb() { awk '/^MemTotal:/ { printf "%d", $2 / 1024; exit }' /proc/meminfo; }
swap_total_mb() { awk '/^SwapTotal:/ { printf "%d", $2 / 1024; exit }' /proc/meminfo; }
swappiness() { cat /proc/sys/vm/swappiness; }

print_memory_diagnostics() {
  printf '  物理内存 %s MB / 当前可用 %s MB / swap %s MB / swappiness %s\n' \
    "$(memory_total_mb)" "$(mem_available_mb)" "$(swap_total_mb)" "$(swappiness)"
}

cleanup_build_guard() {
  if [ -n "$MEMORY_MONITOR_PID" ] && kill -0 "$MEMORY_MONITOR_PID" 2>/dev/null; then
    kill "$MEMORY_MONITOR_PID" 2>/dev/null || true
    wait "$MEMORY_MONITOR_PID" 2>/dev/null || true
  fi
  [ -z "$MEMORY_MONITOR_FILE" ] || rm -f "$MEMORY_MONITOR_FILE"
  # 即使构建失败也恢复临时停掉的服务，避免保护措施扩大故障面。
  if [ "$OPTIONAL_SERVICES_STOPPED" = 1 ]; then "${COMPOSE[@]}" start embedding rag-worker >/dev/null 2>&1 || true; fi
}
trap cleanup_build_guard EXIT

start_build_memory_monitor() {
  MEMORY_MONITOR_FILE="$(mktemp "${TMPDIR:-/tmp}/artedu-build-memory.XXXXXX")"
  (
    while :; do
      available="$(mem_available_mb)"
      printf '%s %s\n' "$(date '+%F %T')" "$available" >> "$MEMORY_MONITOR_FILE"
      if [ "$available" -lt "$MIN_AVAILABLE_MB" ]; then
        echo "  ! 警告：构建期间 MemAvailable 仅 ${available}MB（安全线 ${MIN_AVAILABLE_MB}MB）" >&2
      fi
      sleep 5
    done
  ) &
  MEMORY_MONITOR_PID=$!
}

report_build_memory() {
  local lowest
  lowest="$(awk 'NR == 1 || $3 < min { min = $3 } END { print min }' "$MEMORY_MONITOR_FILE")"
  echo "  构建期间 MemAvailable 最低值：${lowest}MB（构建前：${BUILD_MEMORY_BEFORE_MB}MB）"
  if [ "$lowest" -lt "$MIN_AVAILABLE_MB" ]; then
    echo "  ! 构建期间跌破 ${MIN_AVAILABLE_MB}MB 安全线；请检查容器额度和构建缓存。" >&2
  fi
}

build_service() {
  local service="$1"
  echo "  构建前可用内存：$(mem_available_mb)MB"
  "${COMPOSE[@]}" build "$service"
  echo "  构建后可用内存：$(mem_available_mb)MB"
}

echo "[0/14] 部署前版本"
git log --oneline -1
echo "[1/14] 内存前置检查"
BUILD_MEMORY_BEFORE_MB="$(mem_available_mb)"
TOTAL_MB="$(memory_total_mb)"
SWAP_TOTAL="$(swap_total_mb)"
SWAPPINESS="$(swappiness)"
print_memory_diagnostics
if [ "${ARTEDU_ALLOW_LOW_MEMORY:-0}" = 1 ]; then
  echo "  ! 已通过 ARTEDU_ALLOW_LOW_MEMORY=1 强制绕过内存检查。"
elif [ "$SWAPPINESS" -eq 0 ] && [ "$TOTAL_MB" -lt 2048 ]; then
  cat <<'WARN'
  ✘ 低内存主机的 swappiness=0：即使已有 swap，内核也几乎不会换页，swap 形同虚设。
    docker build 峰值会使 sshd 无法 fork，导致 SSH banner 与用户态服务同时失联。
    请先执行（需 root）：sysctl -w vm.swappiness=60
    确认持久化配置后再重试；紧急强制放行才使用 ARTEDU_ALLOW_LOW_MEMORY=1。
WARN
  exit 1
elif [ "$BUILD_MEMORY_BEFORE_MB" -lt "$MIN_AVAILABLE_MB" ]; then
  echo "  ✘ 当前可用内存仅 ${BUILD_MEMORY_BEFORE_MB}MB，低于 ${MIN_AVAILABLE_MB}MB 安全线。"
  echo "    请等待现有负载下降；紧急强制放行才使用 ARTEDU_ALLOW_LOW_MEMORY=1。"
  exit 1
elif [ "$SWAP_TOTAL" -lt 256 ] && [ "$TOTAL_MB" -lt 2048 ]; then
  echo "  ✘ 低内存主机的可用 swap 小于 256MB；确认系统交换空间后再部署。"
  exit 1
fi

echo "[2/14] 暂停非必需容器，为构建腾出内存"
# 容器可能尚未创建（首次部署/项目名不匹配）。此处失败不应终止整个部署，
# 但必须留下痕迹——2026-09-26 就是在这里被 set -e 静默杀掉的。
if "${COMPOSE[@]}" stop embedding rag-worker; then
  OPTIONAL_SERVICES_STOPPED=1
else
  echo "  ! 暂停 embedding/rag-worker 未成功（容器可能尚未创建）；继续构建。" >&2
  OPTIONAL_SERVICES_STOPPED=0
fi
start_build_memory_monitor
echo "[3/14] 构建 api 镜像（串行）"; build_service api
echo "[4/14] 构建 rag-worker 镜像（串行）"; build_service rag-worker
# 不要写成 ARTEDU_MODEL_DIR="${ARTEDU_MODEL_DIR:-}"：那会把变量强制成"已定义但为空"，
# 反而让下游的 ${ARTEDU_MODEL_DIR:-$(grep .env)} 兜底逻辑真的去执行 grep(1)。原样透传即可，
# 由脚本内部按 环境变量 > .env > ./models 解析。
echo "[5/14] 准备本地 embedding 模型"; bash deploy/fetch-embedding-model.sh
echo "[6/14] 构建 embedding 镜像（串行）"; build_service embedding
echo "[7/14] 构建 web 镜像（串行）"; build_service web
report_build_memory
echo "[8/14] 恢复暂时停掉的 embedding 与 RAG Worker"
if ! "${COMPOSE[@]}" start embedding rag-worker; then
  # 不影响后续：第 12 步的 up -d 会按需创建/重建这两个服务。
  echo "  ! start embedding/rag-worker 未成功；交给第 12 步的 up -d 处理。" >&2
fi
OPTIONAL_SERVICES_STOPPED=0
echo "[9/14] 确保 postgres 运行并健康"
"${COMPOSE[@]}" up -d postgres
db_ready=0
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U artedu -d artedu >/dev/null 2>&1; then db_ready=1; break; fi
  sleep 2
done
if [ "$db_ready" != 1 ]; then echo '数据库未就绪，停止部署' >&2; exit 1; fi
echo "[10/14] 备份数据库与上传文件"
bash deploy/backup-staging.sh "$(pwd -P)/backups/predeploy-$(date +%Y%m%d-%H%M%S)-$$"
echo "[11/14] 应用数据库迁移"
"${COMPOSE[@]}" run --rm api npm run db:migrate
echo "[12/14] 重建 embedding、应用与 RAG Worker"
"${COMPOSE[@]}" up -d embedding api rag-worker web
echo "[13/14] 容器状态与健康检查"
"${COMPOSE[@]}" ps
sleep 5
ready=0
for _ in $(seq 1 12); do
  if curl -fsS -m 10 "http://127.0.0.1:${ARTEDU_HTTP_PORT:-8080}/api/health/ready" >/dev/null; then ready=1; break; fi
  sleep 5
done
if [ "$ready" != 1 ]; then
  echo '  ! 健康检查未通过，请查看：docker compose -f docker-compose.staging.yml logs --tail=80 api rag-worker web'
  exit 1
fi
echo '  健康检查通过'
embedding_health=$("${COMPOSE[@]}" ps --format '{{.Health}}' embedding 2>/dev/null | head -1)
if [ "$embedding_health" = healthy ]; then echo "  embedding 服务健康（模型：${RAG_EMBEDDING_MODEL:-bge-base-zh-v1.5}）"; else echo '  ! embedding 未就绪；只影响 RAG，请查看 embedding 日志。'; fi
echo "[14/14] 部署后内存体检"
free -h
swapon --show || true
"${COMPOSE[@]}" stats --no-stream || true
echo '  本次部署期间 MemAvailable 最低值见上方构建内存报告。'
echo DEPLOY_DONE
