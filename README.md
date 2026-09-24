# CRM агентства недвижимости (Ереван)

Веб-CRM: воронки объявлений и клиентов, парсер list.am, таблица, дашборд,
администрирование и партнёрская программа. План и принятые решения — в [docs/PLAN.md](docs/PLAN.md).

## Структура

| Путь              | Назначение                                                         |
| ----------------- | ------------------------------------------------------------------ |
| `apps/api`        | BFF на NestJS: авторизация, права, бизнес-правила, работа с NocoDB |
| `apps/web`        | SPA на React + Mantine (mobile-first)                              |
| `packages/shared` | Общие типы и константы: роли, этапы воронок, справочники, телефоны |
| `packages/nocodb` | Клиент NocoDB API, схема данных, миграции и сиды                   |
| `deploy/`         | Конфигурация Caddy                                                 |

Все бизнес-данные хранятся в NocoDB (НФТ-1). Приложение работает с ними только через
REST API NocoDB; интерфейс NocoDB доступен только техадмину (порт проброшен на `127.0.0.1`).

## Локальная разработка

Требуется Node 22+, pnpm 10, Docker.

```bash
cp .env.example .env
pnpm install
pnpm infra:up        # Postgres, Redis, NocoDB
pnpm build
pnpm migrate         # при первом запуске выпустит API-токен — сохраните его в .env
pnpm build           # после добавления токена
pnpm --filter @crm/api create-owner <логин> "Имя"   # первый Владелец, печатает временный пароль
pnpm --filter @crm/api dev
pnpm --filter @crm/web dev   # http://localhost:5173
```

Проверки:

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration   # нужен запущенный NocoDB (pnpm infra:up)
```

## Автоимпорт объявлений

Пока объявления добавляются вручную. Места, где подключается автоматический сбор,
помечены в коде тегом `TODO(auto-import)` — подробности в [docs/PLAN.md](docs/PLAN.md#6-автоимпорт-объявлений-отложен).

## Схема данных

Схема описана в коде: `packages/nocodb/src/schema.ts`. `pnpm migrate` создаёт недостающие
таблицы и колонки и заполняет системные этапы и справочники. Миграция идемпотентна и ничего
не удаляет; смена типа колонки останавливает миграцию с ошибкой (такие изменения — вручную).

## Запуск всего стека в Docker

```bash
cp .env.example .env   # задайте пароли, секреты и SITE_ADDRESS
docker compose --profile app up -d --build
```

Сервис `migrate` выполняет миграции перед стартом `api`. Caddy (`web`) раздаёт SPA и
проксирует `/api` на API; при `SITE_ADDRESS=домен` сам выпускает TLS-сертификат.
