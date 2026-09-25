#!/usr/bin/env bash
# Восстановление из резервной копии (см. backup.sh). ЗАМЕНЯЕТ текущие данные.
#
#   ./deploy/restore.sh /var/backups/crm/20260925-030000 --yes
set -euo pipefail

cd "$(dirname "$0")/.."
dir=${1:?Укажите каталог бэкапа}
PROJECT=${COMPOSE_PROJECT_NAME:-crmyerevan}

if [ "${2:-}" != "--yes" ]; then
  echo "Текущие данные CRM будут заменены копией из $dir. Повторите с --yes." >&2
  exit 1
fi
(cd "$dir" && sha256sum -c SHA256SUMS)

# Пока идёт восстановление, никто не должен писать в базу.
docker compose --profile app stop web api nocodb
docker compose up -d --wait postgres

docker compose exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' \
  <"$dir/postgres.dump"

docker run --rm \
  -v "${PROJECT}_files:/data/files" \
  -v "$dir:/backup:ro" \
  postgres:16-alpine sh -c 'rm -rf /data/files/* && tar -xzf /backup/files.tar.gz -C /data'

docker compose up -d --wait nocodb redis
# Приложение запускается, если его образы уже собраны (на сервере — всегда).
if docker image inspect "${PROJECT}-api" >/dev/null 2>&1; then
  docker compose --profile app up -d
fi
echo "Восстановлено из $dir"
