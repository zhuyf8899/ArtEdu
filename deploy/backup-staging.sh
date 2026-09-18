#!/usr/bin/env bash
# Paired database/media snapshot. This deliberately pauses writers, never deletes volumes.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
compose=(docker compose -f "${ARTEDU_COMPOSE_FILE:-docker-compose.staging.yml}")
destination=${1:?Usage: bash deploy/backup-staging.sh /absolute/new-backup-directory}
[[ "$destination" = /* && ! -e "$destination" ]] || { echo 'Use a new absolute directory; existing backups are never overwritten.' >&2; exit 1; }
mkdir -p "$destination"
destination=$(cd "$destination" && pwd -P)
running=()
running_services=$("${compose[@]}" ps --status running --services)
while IFS= read -r service; do
  case "$service" in api|web|rag-worker) running+=("$service");; esac
done <<< "$running_services"
resume() {
  code=$?
  trap - EXIT
  if ((${#running[@]})); then "${compose[@]}" start "${running[@]}" || code=1; fi
  exit "$code"
}
trap resume EXIT
if ((${#running[@]})); then "${compose[@]}" stop -t 180 "${running[@]}"; fi
"${compose[@]}" exec -T postgres pg_dump -U artedu -d artedu -Fc > "$destination/database.dump"
"${compose[@]}" run --rm --no-deps -T --entrypoint tar api -czf - -C /data/uploads . > "$destination/uploads.tar.gz"
git rev-parse HEAD > "$destination/source-commit.txt"
# 镜像 ID 只是辅助元数据。containerd 镜像存储会回收被重新构建替换掉的旧镜像，
# 而运行中的容器仍引用这些已不存在的 ID，此时 compose images 会整体报错
# （No such image）并中断整次备份。失败时退化为逐个容器 inspect，如实记录。
if ! "${compose[@]}" images -q > "$destination/image-ids.txt" 2>/dev/null; then
  echo "  ! compose images 失败（容器引用的旧镜像可能已被镜像存储回收），改用容器 inspect 记录" >&2
  : > "$destination/image-ids.txt"
  docker ps -a --format '{{.Names}} {{.Image}}' >> "$destination/image-ids.txt"
fi
(cd "$destination" && sha256sum database.dump uploads.tar.gz source-commit.txt image-ids.txt > SHA256SUMS)
touch "$destination/COMPLETE"
echo "BACKUP_COMPLETE: $destination"
