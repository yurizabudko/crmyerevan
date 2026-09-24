import 'reflect-metadata';
import { Http, MetaApi, NocoDb, issueApiToken, migrateSchema, seed, w } from '@crm/nocodb';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { hashPassword } from './auth/password.js';
import { UsersRepository } from './users/users.repository.js';

/**
 * Сквозной сценарий на реальных NocoDB и Redis (`pnpm infra:up`).
 * Работает в отдельной базе NocoDB и в Redis db 15.
 */
const baseUrl = process.env.NOCODB_URL ?? 'http://localhost:8080';
const baseTitle = `crm_api_test_${Date.now()}`;
const redisUrl = 'redis://localhost:6379/15';

let app: INestApplication;
let db: NocoDb;

const PASSWORD = 'Secret2026';

async function bootstrapUser(
  login: string,
  role: 'owner' | 'employee' | 'partner',
): Promise<number> {
  return new UsersRepository(db).create({
    login,
    displayName: login,
    role,
    passwordHash: await hashPassword('Temp12345'),
    perms: { grantAccess: false, deleteCards: false, manageDictionaries: false },
    createdById: null,
  });
}

/** Вход с временным паролем и его обязательная смена. */
async function signIn(login: string, tempPassword = 'Temp12345') {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/login').send({ login, password: tempPassword }).expect(200);
  await agent
    .post('/api/auth/change-password')
    .send({ currentPassword: tempPassword, newPassword: PASSWORD })
    .expect(200);
  return agent;
}

beforeAll(async () => {
  const apiToken =
    process.env.NOCODB_API_TOKEN ||
    (await issueApiToken(
      baseUrl,
      process.env.NC_ADMIN_EMAIL ?? 'admin@crm.local',
      process.env.NC_ADMIN_PASSWORD ?? 'ChangeMe123!',
      'crm-api-tests',
    ));
  await migrateSchema(new MetaApi(new Http({ baseUrl, auth: { apiToken } })), baseTitle);
  db = await NocoDb.connect({ baseUrl, apiToken, baseTitle });
  await seed(db);

  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    NOCODB_URL: baseUrl,
    NOCODB_API_TOKEN: apiToken,
    NOCODB_BASE_TITLE: baseTitle,
    REDIS_URL: redisUrl,
    SESSION_SECRET: 'test-secret-test-secret',
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  await app?.close();
  if (db) await db.meta.deleteBase(db.baseId);
});

describe('CRM API', () => {
  let owner: ReturnType<typeof request.agent>;
  let partnerId: number;
  let poolListingId: number;

  it('serves health without a session and rejects anonymous calls', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('forces the temporary password to be changed on first login', async () => {
    await bootstrapUser('owner', 'owner');
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/auth/login')
      .send({ login: 'Owner', password: 'Temp12345' })
      .expect(200);
    expect(login.body).toMatchObject({ login: 'owner', role: 'owner', mustChangePassword: true });
    expect(login.body).not.toHaveProperty('passwordHash');
    expect(login.headers['set-cookie']?.[0]).toMatch(/crm_sid=.*HttpOnly/);

    const blocked = await agent.get('/api/listings').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'Temp12345', newPassword: 'onlyletters' })
      .expect(400);
    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'Temp12345', newPassword: PASSWORD })
      .expect(200);
    await agent.get('/api/listings').expect(200);
    owner = agent;
  });

  it('lets the owner create users and restricts employees', async () => {
    const employee = await owner
      .post('/api/users')
      .send({
        login: 'anna',
        displayName: 'Анна',
        role: 'employee',
        temporaryPassword: 'Temp12345',
        perms: { grantAccess: true, deleteCards: false, manageDictionaries: false },
      })
      .expect(201);
    expect(employee.body).toMatchObject({ role: 'employee', mustChangePassword: true });
    expect(employee.body.perms.grantAccess).toBe(true);

    await owner
      .post('/api/users')
      .send({
        login: 'anna',
        displayName: 'Дубль',
        role: 'partner',
        temporaryPassword: 'Temp12345',
      })
      .expect(409);

    const anna = await signIn('anna');
    await anna
      .post('/api/users')
      .send({ login: 'boss2', displayName: 'X', role: 'owner', temporaryPassword: 'Temp12345' })
      .expect(403);
    // Сотрудник не может выдавать права: они молча сбрасываются.
    const partner = await anna
      .post('/api/users')
      .send({
        login: 'pavel',
        displayName: 'Павел',
        role: 'partner',
        temporaryPassword: 'Temp12345',
        perms: { grantAccess: true, deleteCards: true, manageDictionaries: true },
      })
      .expect(201);
    expect(partner.body.perms).toEqual({
      grantAccess: false,
      deleteCards: false,
      manageDictionaries: false,
    });
    partnerId = partner.body.id;
    await anna
      .post(`/api/users/${partnerId}/reset-password`)
      .send({ temporaryPassword: 'Temp99999' })
      .expect(403);
  });

  it('creates listings manually and rejects duplicate URLs', async () => {
    const url = 'https://www.list.am/item/100500';
    const created = await owner
      .post('/api/listings')
      .send({
        title: '2 комн., Кентрон',
        price: '95000',
        rooms: 2,
        phone: '091 123 456',
        sourceUrl: url,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      title: '2 комн., Кентрон',
      price: 95000,
      source: 'manual',
      responsibleId: null,
      partnerSourceId: null,
    });
    expect(created.body.comments[0]).toMatchObject({
      kind: 'system',
      body: 'Карточка создана вручную',
    });
    poolListingId = created.body.id;

    const dup = await owner
      .post('/api/listings')
      .send({ title: 'Другое название', sourceUrl: url })
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_LISTING', existingId: poolListingId });

    await owner.post('/api/listings').send({ title: '' }).expect(400);
  });

  it('shows partners only their cards and the unclaimed pool', async () => {
    await owner.post('/api/listings').send({ title: 'Закреплено за сотрудником' }).expect(201);
    const claimed = await db.table('listings').findOne(w.eq('title', 'Закреплено за сотрудником'));
    await db.table('listings').update(claimed!.Id, { responsible_id: 999 });

    const pavel = await signIn('pavel');
    const own = await pavel.post('/api/listings').send({ title: 'Моё объявление' }).expect(201);
    expect(own.body).toMatchObject({ responsibleId: partnerId, partnerSourceId: partnerId });
    // Системные записи партнёру не показываются.
    expect(own.body.comments).toEqual([]);

    const board = await pavel.get('/api/listings').expect(200);
    const titles = board.body.cards.map((c: { title: string }) => c.title).sort();
    expect(titles).toEqual(['2 комн., Кентрон', 'Моё объявление']);
    expect(board.body.stages.map((s: { code: string }) => s.code)).toEqual([
      'new',
      'call',
      'available',
      'meeting',
      'closed',
    ]);
    await pavel.get(`/api/listings/${claimed!.Id}`).expect(404);

    const ownerBoard = await owner.get('/api/listings').expect(200);
    expect(ownerBoard.body.cards).toHaveLength(3);
    // Свежие изменения сверху.
    expect(ownerBoard.body.cards[0].title).toBe('Моё объявление');
  });

  it('blocks users immediately and keeps their data', async () => {
    const pavel = request.agent(app.getHttpServer());
    await pavel.post('/api/auth/login').send({ login: 'pavel', password: PASSWORD }).expect(200);
    await owner.post(`/api/users/${partnerId}/block`).expect(201);
    await pavel.get('/api/listings').expect(401);
    await pavel.post('/api/auth/login').send({ login: 'pavel', password: PASSWORD }).expect(403);
    const users = await owner.get('/api/users').expect(200);
    expect(users.body.find((u: { id: number }) => u.id === partnerId).status).toBe('blocked');
  });

  it('rate-limits password guessing', async () => {
    const anon = request(app.getHttpServer());
    for (let i = 0; i < 10; i++) {
      await anon.post('/api/auth/login').send({ login: 'anna', password: 'wrong' }).expect(401);
    }
    await anon.post('/api/auth/login').send({ login: 'anna', password: PASSWORD }).expect(429);
  });

  it('serves active dictionaries', async () => {
    const res = await owner.get('/api/dictionaries').expect(200);
    expect(res.body.district.map((d: { code: string }) => d.code)).toContain('kentron');
    expect(Object.keys(res.body).sort()).toEqual([
      'district',
      'property_type',
      'reject_reason',
      'source',
    ]);
  });

  it('writes the audit log', async () => {
    const events = await db.table('audit_events').listAll({ fields: ['event_type'] });
    const types = new Set(events.map((e) => e.event_type));
    for (const type of [
      'auth.login',
      'auth.login_failed',
      'auth.password_changed',
      'user.created',
      'user.blocked',
      'listing.created',
    ]) {
      expect(types).toContain(type);
    }
  });
});
