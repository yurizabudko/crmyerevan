import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { NocoDb } from '@crm/nocodb';
import { Redis } from 'ioredis';
import { APP_CONFIG, loadConfig, type AppConfig } from '../config.js';

export const NOCODB = Symbol('NOCODB');
export const REDIS = Symbol('REDIS');

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

/** Подключения к внешним сервисам: конфигурация, NocoDB, Redis. */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: NOCODB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        NocoDb.connect({
          baseUrl: config.NOCODB_URL,
          apiToken: config.NOCODB_API_TOKEN,
          baseTitle: config.NOCODB_BASE_TITLE,
        }),
    },
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 });
        const logger = new Logger('Redis');
        // Без обработчика ioredis пишет "Unhandled error event" на каждую попытку переподключения.
        redis.on('error', (error: Error) => logger.warn(error.message));
        return redis;
      },
    },
    RedisShutdown,
  ],
  exports: [APP_CONFIG, NOCODB, REDIS],
})
export class InfraModule {}
