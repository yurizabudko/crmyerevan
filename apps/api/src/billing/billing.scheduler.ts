import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../infra/infra.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SubscriptionService } from './subscription.service.js';

const EVERY_MS = 60_000;

/**
 * Фоновые задачи раз в минуту: биллинг, отправка уведомлений, опрос Telegram-бота.
 * Блокировка в Redis — чтобы при нескольких экземплярах API задача шла в одном.
 * TODO: вынести в отдельный процесс apps/worker вместе с парсером.
 */
@Injectable()
export class BillingScheduler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BillingScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    if ((await this.redis.set('scheduler:billing', '1', 'PX', EVERY_MS - 5_000, 'NX')) !== 'OK')
      return;
    for (const [name, job] of [
      ['биллинг', () => this.subscriptions.tick()],
      ['Telegram', () => this.notifications.poll()],
      ['уведомления', () => this.notifications.flush()],
    ] as const) {
      try {
        await job();
      } catch (error) {
        this.logger.error(`${name}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}
