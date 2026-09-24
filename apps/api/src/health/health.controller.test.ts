import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { HealthController } from './health.controller.js';

let app: INestApplication | undefined;

async function createApp(nocodbOk: boolean, redisOk: boolean): Promise<INestApplication> {
  const ping = (ok: boolean) => async () => {
    if (!ok) throw new Error('down');
    return 'PONG';
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: NOCODB, useValue: { ping: ping(nocodbOk) } },
      { provide: REDIS, useValue: { ping: ping(redisOk) } },
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('GET /health', () => {
  it('returns 200 when dependencies are up', async () => {
    const res = await request((await createApp(true, true)).getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { nocodb: 'ok', redis: 'ok' } });
  });

  it('returns 503 when NocoDB is down', async () => {
    const res = await request((await createApp(false, true)).getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.checks).toEqual({ nocodb: 'fail', redis: 'ok' });
  });
});
