#!/usr/bin/env bash
# Выкладка на сервере (её вызывает GitHub Actions по SSH, можно и вручную):
#
#   ./deploy/deploy.sh <commit-sha|ветка>
#
# Порядок: бэкап → сборка образов → миграции и перезапуск → проверка /api/health.
# Если новая версия не поднялась, возвращается предыдущий коммит.
set -euo pipefail

cd "$(dirname "$0")/.."
ref=${1:-origin/main}
compose=(docker compose --profile app)

health() {
  for _ in $(seq 1 60); do
    if "${compose[@]}" exec -T api wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

git fetch --prune origin
previous=$(git rev-parse HEAD)
# Ветку берём с origin (локальная на сервере может отставать), коммит — как есть.
target=$(git rev-parse --verify --quiet "origin/$ref^{commit}" || git rev-parse --verify "$ref^{commit}")
echo "Выкладка $(git rev-parse --short "$target") (было $(git rev-parse --short "$previous"))"

# Бэкап перед выкладкой — если стек уже работает.
if "${compose[@]}" ps --status running --services | grep -qx postgres; then
  ./deploy/backup.sh
fi

git checkout --quiet --detach "$target"
"${compose[@]}" build --pull
"${compose[@]}" up -d --remove-orphans

if health; then
  docker image prune -f >/dev/null
  echo "Готово: $(git rev-parse --short HEAD)"
  exit 0
fi

echo "Новая версия не прошла проверку здоровья — откат на $(git rev-parse --short "$previous")" >&2
"${compose[@]}" logs --tail 100 api >&2 || true
git checkout --quiet --detach "$previous"
"${compose[@]}" build
"${compose[@]}" up -d --remove-orphans
health || echo "Откат тоже не поднялся — нужна ручная проверка" >&2
exit 1
