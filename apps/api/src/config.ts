import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  NOCODB_URL: z.url(),
  NOCODB_API_TOKEN: z.string().min(1, 'NOCODB_API_TOKEN пуст — выполните `pnpm migrate`'),
  NOCODB_BASE_TITLE: z.string().min(1).default('crm'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(16),
  /** Каталог для фото и других файлов (в Docker — отдельный том). */
  FILES_DIR: z.string().min(1).default('./data/files'),
  /** Платёжный провайдер подписки партнёров. Реальный выбирается позже (БТ-8.3.1). */
  BILLING_PROVIDER: z.enum(['mock']).default('mock'),
  /** Токен Telegram-бота от @BotFather; без него уведомления копятся в очереди. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Некорректная конфигурация окружения:\n${details.join('\n')}`);
  }
  return parsed.data;
}
