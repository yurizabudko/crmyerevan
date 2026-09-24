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

  describe('listing workflow', () => {
    type Agent = ReturnType<typeof request.agent>;
    let emp: Agent;
    let p1: Agent;
    let p2: Agent;
    let stageId: Record<string, number>;

    const load = async (agent: Agent, id: number) =>
      (await agent.get(`/api/listings/${id}`).expect(200)).body;
    const move = (agent: Agent, id: number, version: number, code: string, extra = {}) =>
      agent.post(`/api/listings/${id}/stage`).send({ stageId: stageId[code], version, ...extra });

    it('prepares users', async () => {
      const board = await owner.get('/api/listings').expect(200);
      stageId = Object.fromEntries(
        board.body.stages.map((s: { code: string; id: number }) => [s.code, s.id]),
      );
      for (const [login, role] of [
        ['emp', 'employee'],
        ['prt1', 'partner'],
        ['prt2', 'partner'],
      ]) {
        await owner
          .post('/api/users')
          .send({ login, displayName: login, role, temporaryPassword: 'Temp12345' })
          .expect(201);
      }
      [emp, p1, p2] = await Promise.all([signIn('emp'), signIn('prt1'), signIn('prt2')]);
    });

    it('enforces transition rules and records history', async () => {
      const { body: card } = await emp
        .post('/api/listings')
        .send({ title: 'Воркфлоу: этапы' })
        .expect(201);
      await move(emp, card.id, 1, 'call').expect(200);

      const blocked = await move(emp, card.id, 2, 'meeting').expect(400);
      expect(blocked.body.errors).toEqual([
        'Подтвердите, что контакт с собственником состоялся',
        'Подтвердите, что собственник подтвердил актуальность объекта',
        'Укажите дату и время встречи',
      ]);

      const meetingAt = '2026-10-01T10:30:00.000Z';
      const moved = await move(emp, card.id, 2, 'meeting', {
        contactConfirmed: true,
        actualityConfirmed: true,
        meetingAt,
      }).expect(200);
      expect(moved.body).toMatchObject({ stageId: stageId.meeting, version: 3 });
      expect(new Date(moved.body.meetingAt.replace(' ', 'T')).toISOString()).toBe(meetingAt);
      const bodies = moved.body.comments.map((c: { body: string }) => c.body);
      expect(bodies).toContain('Этап: Звонок → Назначена встреча');
      expect(bodies).toContain('Контакт с собственником состоялся');
      expect(bodies).toContain('Встреча: — → 01.10.2026, 14:30');

      await emp.patch(`/api/listings/${card.id}`).send({ version: 3, meetingAt: null }).expect(400);
      await move(emp, card.id, 3, 'closed').expect(400);
      const closed = await move(emp, card.id, 3, 'closed', { closeOutcome: 'lost' }).expect(200);
      expect(closed.body.closeOutcome).toBe('lost');
      await move(emp, card.id, 4, 'available').expect(400);
      const reopened = await move(owner, card.id, 4, 'available').expect(200);
      expect(reopened.body.closeOutcome).toBeNull();

      const transitions = await db
        .table('stage_transitions')
        .listAll({ where: w.eq('entity_id', card.id) });
      expect(transitions).toHaveLength(4);
    });

    it('lets exactly one partner claim a pool card', async () => {
      const { body: card } = await owner
        .post('/api/listings')
        .send({ title: 'Воркфлоу: захват' })
        .expect(201);
      const [a, b] = await Promise.all([
        move(p1, card.id, 1, 'call'),
        move(p2, card.id, 1, 'call'),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(['ALREADY_CLAIMED', 'VERSION_CONFLICT']).toContain(loser.body.code);

      const winner = a.status === 200 ? p1 : p2;
      const other = winner === p1 ? p2 : p1;
      const claimed = await load(winner, card.id);
      expect(claimed.responsibleId).toBe(claimed.partnerSourceId);
      expect(claimed.responsibleId).not.toBeNull();

      const retry = await move(other, card.id, 2, 'available', { contactConfirmed: true });
      expect(retry.status).toBe(409);
      expect(retry.body.code).toBe('ALREADY_CLAIMED');
      const otherBoard = await other.get('/api/listings').expect(200);
      expect(otherBoard.body.cards.map((c: { id: number }) => c.id)).not.toContain(card.id);

      // Партнёр не выходит за первые три этапа.
      await move(winner, card.id, 2, 'meeting', {
        contactConfirmed: true,
        actualityConfirmed: true,
        meetingAt: '2026-10-02T09:00:00Z',
      }).expect(400);
    });

    it('restricts partner edits and logs field changes', async () => {
      const { body: card } = await p1
        .post('/api/listings')
        .send({ title: 'Воркфлоу: правки', price: 50000 })
        .expect(201);

      const denied = await p1
        .patch(`/api/listings/${card.id}`)
        .send({ version: 1, price: 60000 })
        .expect(403);
      expect(denied.body.message).toMatch(/Цена/);

      const edited = await p1
        .patch(`/api/listings/${card.id}`)
        .send({ version: 1, phone: '091 000 111', commissionPercent: 25 })
        .expect(200);
      expect(edited.body).toMatchObject({
        phone: '091 000 111',
        commissionPercent: 25,
        version: 2,
      });
      // Системные записи партнёру не видны…
      expect(edited.body.comments).toEqual([]);
      // …а сотрудник видит каждое изменение с автором.
      const seen = await load(owner, card.id);
      const phoneEntry = seen.comments.find((c: { field: string }) => c.field === 'phone');
      expect(phoneEntry).toMatchObject({
        body: 'Телефон: — → 091 000 111',
        authorName: 'prt1',
      });

      await owner
        .patch(`/api/listings/${card.id}`)
        .send({ version: 1, title: 'Старая версия' })
        .expect(409);
      const districts = (await owner.get('/api/dictionaries').expect(200)).body.district;
      const kentron = districts.find((d: { code: string }) => d.code === 'kentron');
      const updated = await owner
        .patch(`/api/listings/${card.id}`)
        .send({ version: 2, districtId: kentron.id, price: null })
        .expect(200);
      expect(updated.body).toMatchObject({ districtId: kentron.id, price: null, version: 3 });
      const bodies = updated.body.comments.map((c: { body: string }) => c.body);
      expect(bodies).toContain('Район: — → Кентрон');
      expect(bodies).toContain('Цена: 50000 → —');

      // Пустая правка не создаёт записей и не меняет версию.
      const noop = await owner
        .patch(`/api/listings/${card.id}`)
        .send({ version: 3, districtId: kentron.id })
        .expect(200);
      expect(noop.body.version).toBe(3);

      await emp
        .patch(`/api/listings/${card.id}`)
        .send({ version: 3, partnerSourceId: card.partnerSourceId })
        .expect(403);
    });

    it('adds comments and call notes', async () => {
      const { body: card } = await emp
        .post('/api/listings')
        .send({ title: 'Воркфлоу: комментарии' })
        .expect(201);
      const res = await emp
        .post(`/api/listings/${card.id}/comments`)
        .send({ kind: 'call', body: 'Не взял трубку' })
        .expect(201);
      expect(res.body.comments[0]).toMatchObject({
        kind: 'call',
        body: 'Не взял трубку',
        authorName: 'emp',
      });
      await emp.post(`/api/listings/${card.id}/comments`).send({ body: '  ' }).expect(400);
    });

    it('serves the user directory to staff only', async () => {
      const dir = await emp.get('/api/users/directory').expect(200);
      expect(dir.body[0]).toEqual({
        id: expect.any(Number),
        displayName: expect.any(String),
        role: expect.any(String),
        status: expect.any(String),
      });
      await p1.get('/api/users/directory').expect(403);
    });
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
