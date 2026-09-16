#!/usr/bin/env bash
# Restore only into a uniquely named temporary container, never into an existing database.
set -euo pipefail
source_dir=${1:?Usage: bash deploy/verify-backup.sh /absolute/backup-directory}
[[ "$source_dir" = /* && -f "$source_dir/COMPLETE" ]] || { echo 'Incomplete backup' >&2; exit 1; }
(cd "$source_dir" && sha256sum -c SHA256SUMS)
gzip -t "$source_dir/uploads.tar.gz"
tar -tzf "$source_dir/uploads.tar.gz" > /dev/null
name="artedu-restore-check-$(date +%s)-$$"
created=0
cleanup() { if [[ "$created" = 1 ]]; then docker rm -f "$name" > /dev/null; fi; }
trap cleanup EXIT
# No published ports and no external network; data lives only in temporary memory.
docker run -d --name "$name" --network none --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=artedu -e POSTGRES_USER=artedu \
  pgvector/pgvector:pg16 > /dev/null
created=1
ready=0
for _ in $(seq 1 30); do
  if docker exec "$name" pg_isready -U artedu -d artedu > /dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[[ "$ready" = 1 ]] || { echo 'Temporary restore database failed to start' >&2; exit 1; }
docker exec -i "$name" pg_restore --exit-on-error --no-owner --no-privileges -U artedu -d artedu < "$source_dir/database.dump"
docker exec "$name" psql -v ON_ERROR_STOP=1 -U artedu -d artedu -c 'SELECT count(*) AS restored_works FROM works;'
echo 'RESTORE_CHECK_PASSED: isolated database restore + media archive checksum/integrity (not a production restore)'
