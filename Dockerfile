# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/nocodb/package.json packages/nocodb/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm -r build
# Самодостаточные каталоги с prod-зависимостями для рантайм-образов
RUN pnpm --filter @crm/api deploy --prod --legacy /out/api \
 && pnpm --filter @crm/nocodb deploy --prod --legacy /out/nocodb

# API (BFF)
FROM node:22-alpine AS api
ENV NODE_ENV=production FILES_DIR=/data/files
WORKDIR /app
COPY --from=build /out/api .
# Каталог фото — точка монтирования тома, должен принадлежать пользователю node.
RUN mkdir -p /data/files && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

# Одноразовый запуск миграций схемы NocoDB
FROM node:22-alpine AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/nocodb .
USER node
CMD ["node", "dist/cli/migrate.js"]

# Статика SPA + reverse proxy на API
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
