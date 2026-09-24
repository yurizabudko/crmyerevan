import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { NocoDb } from '@crm/nocodb';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { Public } from '../auth/decorators.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';

type CheckStatus = 'ok' | 'fail';

export interface HealthReport {
  status: CheckStatus;
  checks: { nocodb: CheckStatus; redis: CheckStatus };
}

/** Доступен без входа: его опрашивают docker и балансировщик. */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(NOCODB) private readonly nocodb: Pick<NocoDb, 'ping'>,
    @Inject(REDIS) private readonly redis: Pick<Redis, 'ping'>,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const [nocodb, redis] = await Promise.all([
      probe(() => this.nocodb.ping()),
      probe(() => this.redis.ping()),
    ]);
    const status: CheckStatus = nocodb === 'ok' && redis === 'ok' ? 'ok' : 'fail';
    res.status(status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status, checks: { nocodb, redis } };
  }
}

async function probe(fn: () => Promise<unknown>): Promise<CheckStatus> {
  try {
    await fn();
    return 'ok';
  } catch {
    return 'fail';
  }
}
