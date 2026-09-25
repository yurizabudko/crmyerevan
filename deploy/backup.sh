#!/usr/bin/env bash
# Резервная копия CRM: дамп Postgres (все данные NocoDB) и том с фото объявлений.
#
#   ./deploy/backup.sh                 # в BACKUP_DIR (по умолчанию /var/backups/crm)
#   BACKUP_DIR=/mnt/backup KEEP_DAYS=30 ./deploy/backup.sh
#
# Необязательно:
#   BACKUP_RSYNC_TARGET=user@host:/path  — копия на другой сервер (rsync по SSH);
#   BACKUP_PING_URL=https://hc-ping.com/<uuid> — сигнал мониторингу об успехе/ошибке.
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR=${BACKUP_DIR:-/var/backups/crm}
KEEP_DAYS=${KEEP_DAYS:-14}
PROJECT=${COMPOSE_PROJECT_NAME:-crmyerevan}
stamp=$(date -u +%Y%m%d-%H%M%S)
dir="$BACKUP_DIR/$stamp"

ping_monitor() {
  [ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 --retry 3 "$BACKUP_PING_URL$1" >/dev/null || true
}
trap 'ping_monitor /fail; echo "Бэкап не выполнен" >&2' ERR

mkdir -p "$dir"
chmod 700 "$BACKUP_DIR" "$dir"

# Custom-формат pg_dump: сжат и восстанавливается выборочно через pg_restore.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  >"$dir/postgres.dump"
# Проверка, что дамп читается, а не просто создан.
docker compose exec -T postgres pg_restore --list <"$dir/postgres.dump" >/dev/null

docker run --rm \
  -v "${PROJECT}_files:/data/files:ro" \
  -v "$dir:/backup" \
  postgres:16-alpine tar -czf /backup/files.tar.gz -C /data files

(cd "$dir" && sha256sum postgres.dump files.tar.gz >SHA256SUMS)
echo "Бэкап: $dir ($(du -sh "$dir" | cut -f1))"

# Ротация: старше KEEP_DAYS дней удаляются.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +

if [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  rsync -a --delete "$BACKUP_DIR/" "$BACKUP_RSYNC_TARGET"
fi
ping_monitor ''
