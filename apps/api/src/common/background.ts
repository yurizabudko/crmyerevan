import type { Logger } from '@nestjs/common';

/**
 * Периодическая фоновая задача. Ошибка одного запуска (например, NocoDB или Redis
 * ненадолго недоступны) пишется в лог и не роняет процесс API — следующий запуск
 * повторит работу.
 */
export function runEvery(
  ms: number,
  logger: Pick<Logger, 'error'>,
  name: string,
  job: () => Promise<unknown>,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    job().catch((error: unknown) =>
      logger.error(`${name}: ${error instanceof Error ? error.message : String(error)}`),
    );
  }, ms);
  timer.unref();
  return timer;
}
