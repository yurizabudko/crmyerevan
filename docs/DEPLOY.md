# Развёртывание на VPS

Весь стек (Postgres, NocoDB, Redis, API, Caddy с TLS) запускается через Docker Compose на
одном сервере. Выкладка новых версий идёт из GitHub Actions по SSH, либо вручную
командой `./deploy/deploy.sh`.

> Приватные ключи, пароли и токены не отправляются в чат и не коммитятся в репозиторий.
> Они хранятся только на сервере (в `.env`) и в секретах GitHub.

## 1. Сервер

- Ubuntu 24.04 LTS, от 2 vCPU и 4 ГБ RAM, 40 ГБ диска.
- Доменное имя с A-записью на IP сервера (например, `crm.example.am`).
- Открытые порты: 22, 80, 443.

```bash
# от root
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
mkdir -p /opt/crm /var/backups/crm && chown deploy:deploy /opt/crm /var/backups/crm
```

## 2. Код на сервере

Репозиторий приватный, поэтому серверу нужен ключ **только на чтение**:

```bash
# от пользователя deploy
ssh-keygen -t ed25519 -C "crm-server" -f ~/.ssh/github_readonly -N ""
cat ~/.ssh/github_readonly.pub
```

Этот публичный ключ добавьте в GitHub: репозиторий → Settings → Deploy keys → Add deploy key.
Флажок «Allow write access» не ставьте.

```bash
cat >> ~/.ssh/config <<'CFG'
Host github.com
  IdentityFile ~/.ssh/github_readonly
CFG
git clone git@github.com:yurizabudko/crmyerevan.git /opt/crm
```

## 3. Настройка `.env`

```bash
cd /opt/crm
cp .env.example .env
chmod 600 .env
```

Отредактируйте `.env`. Каждый секрет генерируйте отдельно командой `openssl rand -hex 32`:

| Переменная                                                  | Значение                                              |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `POSTGRES_PASSWORD`, `NC_AUTH_JWT_SECRET`, `SESSION_SECRET` | случайные строки                                      |
| `NC_ADMIN_EMAIL`, `NC_ADMIN_PASSWORD`                       | вход техадмина в интерфейс NocoDB                     |
| `SITE_ADDRESS`                                              | домен, например `crm.example.am` — Caddy выпустит TLS |
| `WEB_PORT`                                                  | `80`                                                  |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`               | бот уведомлений (необязательно)                       |

Работа идёт только по HTTPS: cookie сессии в продакшене помечены `Secure`, поэтому по
голому `http://IP` войти не получится. Нужен домен в `SITE_ADDRESS`.

## 4. Первый запуск

```bash
docker compose up -d --wait postgres redis nocodb
docker compose --profile app build
docker compose --profile app run --rm migrate
```

При первом запуске миграция печатает строку `NOCODB_API_TOKEN=...`. Впишите её в `.env`,
затем запустите приложение и создайте первого Владельца:

```bash
docker compose --profile app up -d
docker compose --profile app exec api node dist/cli/create-owner.js <логин> "Имя Фамилия"
```

Команда печатает временный пароль. При первом входе система попросит его сменить.

Проверка: `https://<домен>/api/health` должен вернуть `{"status":"ok",...}`.

Интерфейс NocoDB открыт только на `127.0.0.1`. Техадмину он доступен через SSH-туннель:
`ssh -L 8080:127.0.0.1:8080 deploy@<сервер>`, затем в браузере `http://localhost:8080`.

## 5. Резервные копии

`deploy/backup.sh` сохраняет дамп Postgres (в нём все данные NocoDB) и том с фото, проверяет,
что дамп читается, считает контрольные суммы и удаляет копии старше `KEEP_DAYS` дней
(по умолчанию 14).

```bash
crontab -e   # от пользователя deploy
# каждый день в 03:15 по времени сервера
15 3 * * * cd /opt/crm && ./deploy/backup.sh >> /var/backups/crm/backup.log 2>&1
```

Необязательные переменные для cron-строки:

- `BACKUP_RSYNC_TARGET=user@host:/path` — копия на другой сервер. Одна копия на том же диске — это не бэкап.
- `BACKUP_PING_URL=https://hc-ping.com/<uuid>` — сигнал в Healthchecks.io. Если копия не сделана, придёт письмо.

Восстановление заменяет текущие данные, поэтому требует флага `--yes`:

```bash
./deploy/restore.sh /var/backups/crm/<дата-время> --yes
```

Раз в месяц проверяйте, что копия восстанавливается, на отдельном сервере или в локальном стенде.

## 6. Автоматическая выкладка (GitHub Actions)

Workflow `.github/workflows/deploy.yml` запускается после зелёного CI на ветке `main`, а также
вручную: Actions → Deploy → Run workflow, с указанием коммита или ветки. На сервере он вызывает
`deploy/deploy.sh`. Скрипт делает бэкап, собирает образы, применяет миграции, перезапускает
сервисы и проверяет `/api/health`. Если новая версия не поднялась, скрипт возвращает предыдущую.

**Ключ для выкладки создайте на своём компьютере**, не на сервере и не в чате:

```bash
ssh-keygen -t ed25519 -C "crm-github-deploy" -f ~/.ssh/crm_deploy -N ""
# публичную часть — на сервер
ssh-copy-id -i ~/.ssh/crm_deploy.pub deploy@<сервер>
# отпечаток сервера — для защиты от подмены хоста
ssh-keyscan -t ed25519 <сервер>
```

В GitHub: репозиторий → Settings → Environments → создать `production` → Environment secrets:

| Секрет               | Значение                                            |
| -------------------- | --------------------------------------------------- |
| `DEPLOY_HOST`        | IP или домен сервера                                |
| `DEPLOY_USER`        | `deploy`                                            |
| `DEPLOY_PORT`        | `22` (или ваш порт SSH)                             |
| `DEPLOY_PATH`        | `/opt/crm`                                          |
| `DEPLOY_SSH_KEY`     | содержимое **приватного** файла `~/.ssh/crm_deploy` |
| `DEPLOY_KNOWN_HOSTS` | строка из вывода `ssh-keyscan`                      |

Затем Settings → Secrets and variables → Actions → Variables: `DEPLOY_ENABLED` = `true`.
Пока переменная не задана, workflow пропускается.

В окружении `production` можно включить «Required reviewers»: тогда каждая выкладка ждёт
подтверждения.

## 7. Мониторинг

- **Доступность.** Внешний монитор (UptimeRobot, Healthchecks.io и т. п.) опрашивает
  `https://<домен>/api/health` раз в 1–5 минут. Если недоступны NocoDB или Redis, эндпоинт
  отвечает `503`. API при этом не падает и сам восстанавливается, когда сервисы вернутся.
- **Бэкапы.** Сигнал об успехе или ошибке идёт через `BACKUP_PING_URL` (раздел 5).
- **Логи.** `docker compose --profile app logs -f api`. Ротация настроена: 5 файлов по 10 МБ
  на контейнер.
- **Контейнеры.** У всех сервисов есть healthcheck и `restart: unless-stopped`.

## 8. Ручные операции

```bash
./deploy/deploy.sh <коммит|ветка>                 # выкладка конкретной версии (и откат на неё)
docker compose --profile app ps                   # состояние
docker compose --profile app restart api          # перезапуск API
```
