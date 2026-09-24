import { Inject, Injectable, Logger } from '@nestjs/common';
import { w, type NocoDb } from '@crm/nocodb';
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { TELEGRAM_API, type TelegramApi } from './telegram.client.js';

const MAX_ATTEMPTS = 5;
const OFFSET_KEY = 'telegram:offset';

/**
 * Уведомления в Telegram через очередь (outbox, НФТ-8): бизнес-процесс только кладёт
 * сообщение в очередь, отправка — отдельно; недоставленное не блокирует процесс.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(TELEGRAM_API) private readonly telegram: TelegramApi,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Поставить сообщение в очередь; одинаковый dedupeKey отправляется один раз. */
  async notify(userId: number, text: string, dedupeKey?: string): Promise<void> {
    if (dedupeKey) {
      const exists = await this.db
        .table('notifications_outbox')
        .findOne(w.eq('dedupe_key', dedupeKey));
      if (exists) return;
    }
    await this.db.table('notifications_outbox').create({
      channel: 'telegram',
      user_id: userId,
      text,
      dedupe_key: dedupeKey ?? null,
      status: 'pending',
      attempts: 0,
    });
  }

  /** Всем владельцам — для системных алертов (например, сбой парсера, БТ-3.2.6). */
  async notifyOwners(text: string, dedupeKey?: string): Promise<void> {
    const owners = await this.db
      .table('users')
      .listAll({ where: w.and(w.eq('role', 'owner'), w.eq('status', 'active')), fields: ['Id'] });
    for (const o of owners)
      await this.notify(o.Id, text, dedupeKey ? `${dedupeKey}:${o.Id}` : undefined);
  }

  /** Отправка очереди. Без привязанного Telegram сообщение помечается «пропущено». */
  async flush(): Promise<{ sent: number; failed: number }> {
    if (!this.telegram.enabled) return { sent: 0, failed: 0 };
    const pending = await this.db
      .table('notifications_outbox')
      .list({ where: w.eq('status', 'pending'), sort: ['Id'], limit: 50 });
    let sent = 0;
    let failed = 0;
    for (const n of pending.list) {
      const user = n.user_id ? await this.db.table('users').get(n.user_id) : null;
      if (!user?.telegram_chat_id) {
        await this.db
          .table('notifications_outbox')
          .update(n.Id, { status: 'skipped', last_error: 'Telegram не привязан' });
        continue;
      }
      try {
        await this.telegram.sendMessage(user.telegram_chat_id, n.text ?? '');
        await this.db.table('notifications_outbox').update(n.Id, {
          status: 'sent',
          chat_id: user.telegram_chat_id,
          sent_at: new Date().toISOString(),
          attempts: (n.attempts ?? 0) + 1,
        });
        sent++;
      } catch (error) {
        const attempts = (n.attempts ?? 0) + 1;
        await this.db.table('notifications_outbox').update(n.Id, {
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          last_error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }
    return { sent, failed };
  }

  /** Ссылка для привязки Telegram (БТ-8.3.3): t.me/<бот>?start=<одноразовый токен>. */
  async createLink(userId: number): Promise<{ url: string | null; token: string }> {
    const token = randomBytes(16).toString('hex');
    await this.db.table('users').update(userId, { telegram_link_token: token });
    const bot = this.config.TELEGRAM_BOT_USERNAME;
    return { url: bot ? `https://t.me/${bot}?start=${token}` : null, token };
  }

  /** Обработка `/start <токен>` — привязка чата к пользователю. */
  async handleStart(chatId: string, token: string): Promise<boolean> {
    const user = await this.db.table('users').findOne(w.eq('telegram_link_token', token));
    if (!user) return false;
    await this.db
      .table('users')
      .update(user.Id, { telegram_chat_id: chatId, telegram_link_token: null });
    await this.notify(
      user.Id,
      `Telegram привязан к CRM. Здравствуйте, ${user.display_name ?? ''}!`,
    );
    return true;
  }

  /** Опрос бота (long polling без вебхука — не нужен публичный адрес). */
  async poll(): Promise<void> {
    if (!this.telegram.enabled) return;
    const offset = Number(await this.redis.get(OFFSET_KEY)) || 0;
    const updates = await this.telegram.getUpdates(offset);
    for (const u of updates) {
      const text = u.message?.text ?? '';
      const match = /^\/start\s+([a-f0-9]{32})$/.exec(text.trim());
      if (match && u.message) {
        const ok = await this.handleStart(String(u.message.chat.id), match[1]!);
        if (!ok) {
          await this.telegram
            .sendMessage(
              String(u.message.chat.id),
              'Ссылка устарела. Получите новую в личном кабинете CRM.',
            )
            .catch((e: Error) => this.logger.warn(e.message));
        }
      }
      await this.redis.set(OFFSET_KEY, String(u.update_id + 1));
    }
  }
}
