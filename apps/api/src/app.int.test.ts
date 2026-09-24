import 'reflect-metadata';
import { Http, MetaApi, NocoDb, issueApiToken, migrateSchema, seed, w } from '@crm/nocodb';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Redis } from 'ioredis';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { SubscriptionService } from './billing/subscription.service.js';
import { DealClosingService } from './clients/deal-closing.service.js';
import { NotificationsService } from './notifications/notifications.service.js';
import {
  TELEGRAM_API,
  type TelegramApi,
  type TelegramUpdate,
} from './notifications/telegram.client.js';
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

/** Двойник Telegram: запоминает отправленное, отдаёт заранее заготовленные апдейты. */
const telegram = {
  enabled: true,
  sent: [] as { chatId: string; text: string }[],
  updates: [] as TelegramUpdate[],
  async sendMessage(chatId: string, text: string) {
    this.sent.push({ chatId, text });
  },
  async getUpdates(offset: number) {
    return this.updates.filter((u) => u.update_id >= offset);
  },
} satisfies TelegramApi & Record<string, unknown>;
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
  const { body: user } = await agent
    .post('/api/auth/login')
    .send({ login, password: tempPassword })
    .expect(200);
  await agent
    .post('/api/auth/change-password')
    .send({ currentPassword: tempPassword, newPassword: PASSWORD })
    .expect(200);
  // Партнёр без подписки видит только оплату (БТ-8.3.5) — активируем триал тестовой картой.
  if (user.role === 'partner') {
    await agent.post('/api/me/subscription/trial').send({ scenario: 'success' }).expect(200);
  }
  return agent;
}

/** Повторный вход пользователя, который уже сменил временный пароль. */
async function logIn(login: string) {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/login').send({ login, password: PASSWORD }).expect(200);
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
    FILES_DIR: await mkdtemp(join(tmpdir(), 'crm-api-files-')),
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_API)
    .useValue(telegram)
    .compile();
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

    it('uploads, serves and removes photos', async () => {
      const png = await sharp({
        create: { width: 2400, height: 1800, channels: 3, background: '#557799' },
      })
        .png()
        .toBuffer();
      const { body: card } = await owner
        .post('/api/listings')
        .send({ title: 'Воркфлоу: фото' })
        .expect(201);

      const uploaded = await owner
        .post(`/api/listings/${card.id}/photos`)
        .attach('photos', png, { filename: 'a.png', contentType: 'image/png' })
        .attach('photos', png, { filename: 'b.png', contentType: 'image/png' })
        .expect(201);
      expect(uploaded.body.photos).toHaveLength(2);
      expect(uploaded.body.photos[0]).toMatchObject({ width: 1600, height: 1200 });
      expect(uploaded.body.coverPhotoId).toBe(uploaded.body.photos[0].id);

      const [first, second] = uploaded.body.photos;
      const full = await owner.get(first.url).buffer(true).expect(200);
      expect(full.headers['content-type']).toBe('image/jpeg');
      const thumb = await owner.get(first.thumbUrl).buffer(true).expect(200);
      expect((await sharp(thumb.body).metadata()).width).toBe(480);

      // Карточка в пуле видна партнёру — и фото тоже; менять их он не может.
      await p1.get(first.thumbUrl).expect(200);
      await p1
        .post(`/api/listings/${card.id}/photos`)
        .attach('photos', png, { filename: 'c.png', contentType: 'image/png' })
        .expect(403);
      await owner
        .post(`/api/listings/${card.id}/photos`)
        .attach('photos', Buffer.from('fake'), { filename: 'x.png', contentType: 'image/png' })
        .expect(400);
      await owner
        .post(`/api/listings/${card.id}/photos`)
        .attach('photos', Buffer.from('%PDF-1.4'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      const afterDelete = await owner
        .delete(`/api/listings/${card.id}/photos/${first.id}`)
        .expect(200);
      expect(afterDelete.body.photos.map((p: { id: number }) => p.id)).toEqual([second.id]);
      expect(afterDelete.body.coverPhotoId).toBe(second.id);
      await owner.get(first.url).expect(404);

      // Свою карточку партнёр может снабдить фото.
      const { body: own } = await p1
        .post('/api/listings')
        .send({ title: 'Воркфлоу: фото партнёра' })
        .expect(201);
      await p1
        .post(`/api/listings/${own.id}/photos`)
        .attach('photos', png, { filename: 'd.png', contentType: 'image/png' })
        .expect(201);
      // Фото чужой закреплённой карточки партнёру не отдаётся.
      const ownPhoto = (await load(p1, own.id)).photos[0];
      await p2.get(ownPhoto.url).expect(404);
    });

    it('soft-deletes listings for those with the right', async () => {
      const { body: card } = await emp
        .post('/api/listings')
        .send({ title: 'Воркфлоу: удаление' })
        .expect(201);
      await emp.delete(`/api/listings/${card.id}`).expect(403);
      await owner.delete(`/api/listings/${card.id}`).expect(204);
      await owner.get(`/api/listings/${card.id}`).expect(404);
      const board = await owner.get('/api/listings').expect(200);
      expect(board.body.cards.map((c: { id: number }) => c.id)).not.toContain(card.id);
      const row = await db.table('listings').get(card.id);
      expect(row?.deleted_at).not.toBeNull();
      const audit = await db
        .table('audit_events')
        .findOne(w.and(w.eq('event_type', 'listing.deleted'), w.eq('entity_id', card.id)));
      expect(audit).not.toBeNull();
    });

    it('stores personal preferences per user', async () => {
      await emp.get('/api/me/prefs/listings.board').expect(200, { value: null });
      const value = { manual: { '1': [3, 1, 2] } };
      await emp.put('/api/me/prefs/listings.board').send({ value }).expect(200);
      await emp.get('/api/me/prefs/listings.board').expect(200, { value });
      await owner.get('/api/me/prefs/listings.board').expect(200, { value: null });
      await emp.put('/api/me/prefs/../../x').send({ value: 1 }).expect(404);
      await emp.get('/api/me/prefs/Bad Key').expect(400);
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

  describe('clients funnel', () => {
    type Agent = ReturnType<typeof request.agent>;
    let emp: Agent;
    let prt: Agent;
    let stage: Record<string, number>;
    let dict: Record<string, { id: number; code: string }[]>;

    const dictId = (kind: string, code: string) => dict[kind]!.find((d) => d.code === code)!.id;
    const move = (agent: Agent, id: number, version: number, code: string, extra = {}) =>
      agent.post(`/api/clients/${id}/stage`).send({ stageId: stage[code], version, ...extra });

    it('prepares users and references', async () => {
      stage = Object.fromEntries(
        (await owner.get('/api/clients').expect(200)).body.stages.map(
          (s: { code: string; id: number }) => [s.code, s.id],
        ),
      );
      dict = (await owner.get('/api/dictionaries').expect(200)).body;
      for (const [login, role] of [
        ['cemp', 'employee'],
        ['cprt', 'partner'],
      ]) {
        await owner
          .post('/api/users')
          .send({ login, displayName: login, role, temporaryPassword: 'Temp12345' })
          .expect(201);
      }
      [emp, prt] = await Promise.all([signIn('cemp'), signIn('cprt')]);
    });

    it('creates clients with a unique phone and required source', async () => {
      await emp
        .post('/api/clients')
        .send({ name: 'Без источника', phone: '093 111 222' })
        .expect(400);
      const created = await emp
        .post('/api/clients')
        .send({ name: 'Анна', phone: '093 111 222', sourceId: dictId('source', 'call') })
        .expect(201);
      expect(created.body).toMatchObject({
        name: 'Анна',
        stageId: stage.new,
        responsibleId: expect.any(Number),
        partnerSourceId: null,
        isOverdue: false,
      });
      const dup = await prt
        .post('/api/clients')
        .send({ name: 'Дубль', phone: '+374 93 111222', sourceId: dictId('source', 'ads') })
        .expect(409);
      // Партнёр узнаёт о дубле, но не получает ссылку на чужую карточку.
      expect(dup.body).toMatchObject({ code: 'DUPLICATE_CLIENT' });
      expect(dup.body.existingId).toBeUndefined();
      const dupForEmp = await owner
        .post('/api/clients')
        .send({ name: 'Дубль', phone: '0037493111222', sourceId: dictId('source', 'ads') })
        .expect(409);
      expect(dupForEmp.body.existingId).toBe(created.body.id);
    });

    it('walks a client through the funnel', async () => {
      const { body: c } = await emp
        .post('/api/clients')
        .send({ name: 'Борис', phone: '094 222 333', sourceId: dictId('source', 'referral') })
        .expect(201);
      await move(emp, c.id, 1, 'call').expect(200);
      const q = await move(emp, c.id, 2, 'qualified', { conversationConfirmed: true }).expect(400);
      expect(q.body.errors).toEqual(['Заполните в карточке: бюджет, район, тип объекта, сроки']);

      const kentron = dictId('district', 'kentron');
      const filled = await emp
        .patch(`/api/clients/${c.id}`)
        .send({
          version: 2,
          budgetMax: 150000,
          districtIds: [kentron, dictId('district', 'arabkir')],
          propertyTypeId: dictId('property_type', 'apartment'),
          timeframe: 'до конца года',
        })
        .expect(200);
      expect(filled.body.comments.map((x: { body: string }) => x.body)).toContain(
        'Районы: — → Кентрон, Арабкир',
      );
      await move(emp, c.id, 3, 'qualified', { conversationConfirmed: true }).expect(200);

      const sel = await move(emp, c.id, 4, 'selection').expect(400);
      expect(sel.body.errors).toEqual(['Привяжите к клиенту хотя бы одно объявление']);
      const { body: listing } = await owner
        .post('/api/listings')
        .send({ title: 'Для подбора' })
        .expect(201);
      await db
        .table('client_listing_links')
        .create({ client_id: c.id, listing_id: listing.id, status: 'proposed' });
      await move(emp, c.id, 4, 'selection').expect(200);

      await move(emp, c.id, 5, 'showings').expect(400);
      const shown = await move(emp, c.id, 5, 'showings', {
        showingAt: '2026-10-05T08:00:00.000Z',
      }).expect(200);
      expect(shown.body).toMatchObject({ showingsCount: 1, linkedListings: 1 });

      await move(emp, c.id, 6, 'negotiation').expect(400);
      const neg = await move(emp, c.id, 6, 'negotiation', { agreedPrice: 140000 }).expect(200);
      expect(neg.body.agreedPrice).toBe(140000);

      const closed = await move(emp, c.id, 7, 'deal_closed', {
        finalPrice: 138000,
        commissionFact: 4140,
        dealListingId: listing.id,
      }).expect(200);
      expect(closed.body).toMatchObject({ finalPrice: 138000, commissionFact: 4140 });
      await move(emp, c.id, 8, 'selection').expect(400);
    });

    it('rejects with a reason from the dictionary', async () => {
      const { body: c } = await emp
        .post('/api/clients')
        .send({ name: 'Вера', phone: '095 333 444', sourceId: dictId('source', 'ads') })
        .expect(201);
      await move(emp, c.id, 1, 'rejected').expect(400);
      await move(emp, c.id, 1, 'rejected', {
        rejectReasonId: dictId('district', 'kentron'),
      }).expect(400);
      const rejected = await move(emp, c.id, 1, 'rejected', {
        rejectReasonId: dictId('reject_reason', 'expensive'),
      }).expect(200);
      expect(rejected.body.comments.map((x: { body: string }) => x.body)).toContain(
        'Причина отказа: Дорого',
      );
    });

    it('limits partners to their clients and allowed fields', async () => {
      const { body: own } = await prt
        .post('/api/clients')
        .send({
          name: 'Клиент партнёра',
          phone: '096 444 555',
          sourceId: dictId('source', 'other'),
        })
        .expect(201);
      expect(own.partnerSourceId).toBe(own.responsibleId);
      expect(own.comments).toEqual([]);

      const board = await prt.get('/api/clients').expect(200);
      expect(board.body.cards.map((x: { name: string }) => x.name)).toEqual(['Клиент партнёра']);

      await prt.patch(`/api/clients/${own.id}`).send({ version: 1, finalPrice: 1 }).expect(403);
      await prt
        .patch(`/api/clients/${own.id}`)
        .send({ version: 1, agreedPrice: 90000, messenger: '@client' })
        .expect(200);
      await move(prt, own.id, 2, 'selection').expect(400);
    });

    it('flags idle early-stage clients as overdue until there is activity', async () => {
      const { body: c } = await emp
        .post('/api/clients')
        .send({ name: 'Давид', phone: '097 555 666', sourceId: dictId('source', 'call') })
        .expect(201);
      await db.table('clients').update(c.id, { last_activity_at: '2026-01-01T00:00:00Z' });
      const board = await emp.get('/api/clients').expect(200);
      expect(board.body.cards.find((x: { id: number }) => x.id === c.id).isOverdue).toBe(true);

      await emp.post(`/api/clients/${c.id}/comments`).send({ body: 'Перезвонить' }).expect(201);
      expect((await emp.get(`/api/clients/${c.id}`).expect(200)).body.isOverdue).toBe(false);
    });

    it('manages the selection and schedules showings', async () => {
      const { body: c } = await emp
        .post('/api/clients')
        .send({ name: 'Подборка', phone: '090 100 200', sourceId: dictId('source', 'call') })
        .expect(201);
      const { body: l1 } = await owner
        .post('/api/listings')
        .send({ title: 'Подборка 1' })
        .expect(201);
      const { body: l2 } = await owner
        .post('/api/listings')
        .send({ title: 'Подборка 2' })
        .expect(201);

      const added = await emp
        .post(`/api/clients/${c.id}/links`)
        .send({ listingId: l1.id })
        .expect(201);
      expect(added.body.links).toEqual([
        expect.objectContaining({
          listingId: l1.id,
          status: 'proposed',
          listing: expect.objectContaining({ title: 'Подборка 1' }),
        }),
      ]);
      await emp.post(`/api/clients/${c.id}/links`).send({ listingId: l1.id }).expect(409);
      await emp.post(`/api/clients/${c.id}/links`).send({ listingId: l2.id }).expect(201);
      const linkId = added.body.links[0].id;

      await emp
        .patch(`/api/clients/${c.id}/links/${linkId}`)
        .send({ status: 'showing_scheduled' })
        .expect(400);
      const shown = await emp
        .patch(`/api/clients/${c.id}/links/${linkId}`)
        .send({ status: 'showing_scheduled', showingAt: '2026-10-07T09:00:00Z' })
        .expect(200);
      expect(shown.body.showingsCount).toBe(1);
      expect(shown.body.nextShowingAt).not.toBeNull();

      await emp
        .patch(`/api/clients/${c.id}/links/${linkId}`)
        .send({ status: 'chosen' })
        .expect(200);
      const second = shown.body.links.find((x: { listingId: number }) => x.listingId === l2.id);
      await emp
        .patch(`/api/clients/${c.id}/links/${second.id}`)
        .send({ status: 'chosen' })
        .expect(400);
      await emp.delete(`/api/clients/${c.id}/links/${linkId}`).expect(400);
      const removed = await emp.delete(`/api/clients/${c.id}/links/${second.id}`).expect(200);
      expect(removed.body.links).toHaveLength(1);

      // В карточке объекта видно, кому его предлагали (БТ-4.4.2).
      const listingCard = await owner.get(`/api/listings/${l1.id}`).expect(200);
      expect(listingCard.body.links).toEqual([
        expect.objectContaining({
          clientId: c.id,
          status: 'chosen',
          client: expect.objectContaining({ name: 'Подборка' }),
        }),
      ]);
    });

    it('matches listings and clients by budget, district and type', async () => {
      const kentron = dictId('district', 'kentron');
      const apartment = dictId('property_type', 'apartment');
      const { body: c } = await emp
        .post('/api/clients')
        .send({
          name: 'Подбор',
          phone: '090 300 400',
          sourceId: dictId('source', 'call'),
          budgetMin: 80000,
          budgetMax: 120000,
          districtIds: [kentron],
          propertyTypeId: apartment,
        })
        .expect(201);
      const mk = (title: string, price: number, districtId = kentron, currency = 'USD') =>
        owner
          .post('/api/listings')
          .send({ title, price, districtId, propertyTypeId: apartment, currency })
          .expect(201)
          .then((r) => r.body);
      const fits = await mk('Подбор: подходит', 100000);
      await mk('Подбор: дорого', 150000);
      await mk('Подбор: другой район', 100000, dictId('district', 'arabkir'));
      await mk('Подбор: драмы', 100000, kentron, 'AMD');

      const matches = await emp.get(`/api/clients/${c.id}/matches`).expect(200);
      expect(matches.body.map((m: { listing: { title: string } }) => m.listing.title)).toEqual([
        'Подбор: подходит',
      ]);
      expect(matches.body[0].reasons).toEqual(['бюджет', 'район', 'тип']);

      const search = await emp.get(`/api/clients/${c.id}/matches?q=Подбор: дор`).expect(200);
      expect(search.body.map((m: { listing: { title: string } }) => m.listing.title)).toEqual([
        'Подбор: дорого',
      ]);

      const clients = await owner.get(`/api/listings/${fits.id}/matches`).expect(200);
      expect(clients.body.map((m: { client: { name: string } }) => m.client.name)).toContain(
        'Подбор',
      );
      await emp.post(`/api/clients/${c.id}/links`).send({ listingId: fits.id }).expect(201);
      const after = await emp.get(`/api/clients/${c.id}/matches`).expect(200);
      expect(after.body).toEqual([]);
    });

    it('closes a deal: listing, selection and partner rewards follow', async () => {
      const [pa, pb] = await Promise.all(
        ['dpa', 'dpb'].map((login) =>
          owner
            .post('/api/users')
            .send({ login, displayName: login, role: 'partner', temporaryPassword: 'Temp12345' })
            .expect(201)
            .then((r) => r.body.id as number),
        ),
      );
      await Promise.all(['dpa', 'dpb'].map((login) => signIn(login)));
      const qualifiedFields = {
        budgetMax: 200000,
        districtIds: [dictId('district', 'kentron')],
        propertyTypeId: dictId('property_type', 'apartment'),
        timeframe: 'сейчас',
      };
      const { body: c } = await emp
        .post('/api/clients')
        .send({
          name: 'Сделка',
          phone: '090 500 600',
          sourceId: dictId('source', 'call'),
          ...qualifiedFields,
        })
        .expect(201);
      const { body: sold } = await owner
        .post('/api/listings')
        .send({ title: 'Сделка: объект' })
        .expect(201);
      const { body: other } = await owner
        .post('/api/listings')
        .send({ title: 'Сделка: другой' })
        .expect(201);
      await owner
        .patch(`/api/clients/${c.id}`)
        .send({ version: 1, partnerSourceId: pa })
        .expect(200);
      await owner
        .patch(`/api/listings/${sold.id}`)
        .send({ version: 1, partnerSourceId: pb })
        .expect(200);
      await emp.post(`/api/clients/${c.id}/links`).send({ listingId: sold.id }).expect(201);
      await emp.post(`/api/clients/${c.id}/links`).send({ listingId: other.id }).expect(201);

      const version = (await emp.get(`/api/clients/${c.id}`).expect(200)).body.version;
      await move(emp, c.id, version, 'deal_closed', {
        conversationConfirmed: true,
        finalPrice: 180000,
        commissionFact: 5400,
      }).expect(400);
      const closed = await move(emp, c.id, version, 'deal_closed', {
        conversationConfirmed: true,
        finalPrice: 180000,
        commissionFact: 5400,
        dealListingId: sold.id,
      }).expect(200);
      expect(
        closed.body.links.map((l: { listingId: number; status: string }) => [
          l.listingId,
          l.status,
        ]),
      ).toEqual([
        [sold.id, 'chosen'],
        [other.id, 'client_rejected'],
      ]);
      expect(closed.body.comments[0].body).toMatch(/^Закрыта сделка №\d+: объект «Сделка: объект»/);

      const listing = (await owner.get(`/api/listings/${sold.id}`).expect(200)).body;
      expect(listing).toMatchObject({ stageId: expect.any(Number), closeOutcome: 'success' });
      expect(listing.comments[0].body).toMatch(
        /Объект закрыт автоматически: сделка №\d+ с клиентом Сделка/,
      );

      const deal = await db.table('deals').findOne(w.eq('client_id', c.id));
      expect(deal).toMatchObject({ listing_id: sold.id, commission_fact: 5400 });
      const rewards = await db
        .table('partner_rewards')
        .listAll({ where: w.eq('deal_id', deal!.Id) });
      expect(rewards.map((r) => [r.partner_id, r.amount, r.status, r.basis]).sort()).toEqual(
        [
          [pa, 540, 'accrued', 'клиент'],
          [pb, 540, 'accrued', 'объект'],
        ].sort(),
      );
      const event = await db.table('domain_events').findOne(w.eq('status', 'done'));
      expect(event?.type).toBe('deal.closed');

      // Повторная обработка события ничего не дублирует.
      const saga = app.get(DealClosingService);
      await db.table('domain_events').update(event!.Id, { status: 'pending' });
      expect(await saga.reconcile()).toBeGreaterThanOrEqual(1);
      expect(await db.table('deals').count(w.eq('client_id', c.id))).toBe(1);
      expect(await db.table('partner_rewards').count(w.eq('deal_id', deal!.Id))).toBe(2);
    });

    it('soft-deletes clients for those with the right', async () => {
      const { body: c } = await emp
        .post('/api/clients')
        .send({ name: 'Удаляемый', phone: '098 666 777', sourceId: dictId('source', 'call') })
        .expect(201);
      await emp.delete(`/api/clients/${c.id}`).expect(403);
      await owner.delete(`/api/clients/${c.id}`).expect(204);
      await emp.get(`/api/clients/${c.id}`).expect(404);
      // Телефон удалённого клиента можно использовать снова.
      await emp
        .post('/api/clients')
        .send({ name: 'Новый', phone: '098 666 777', sourceId: dictId('source', 'call') })
        .expect(201);
    });
  });

  describe('table', () => {
    type Agent = ReturnType<typeof request.agent>;
    let tp: Agent;
    let tag: string;

    it('filters, searches, sorts and pages listings', async () => {
      tag = `T${Date.now().toString().slice(-6)}`;
      await owner
        .post('/api/users')
        .send({
          login: 'tprt',
          displayName: 'tprt',
          role: 'partner',
          temporaryPassword: 'Temp12345',
        })
        .expect(201);
      tp = await signIn('tprt');
      const mk = (agent: Agent, title: string, extra = {}) =>
        agent
          .post('/api/listings')
          .send({ title: `${tag} ${title}`, ...extra })
          .expect(201);
      await mk(owner, 'дешёвая', {
        price: 50000,
        phone: '091 11 22 33',
        description: 'с ремонтом',
      });
      await mk(owner, 'средняя', { price: 90000 });
      await mk(owner, 'дорогая', { price: 150000 });
      await mk(tp, 'партнёрская', { price: 70000 });

      const base = `/api/table/listings?q=${encodeURIComponent(tag)}`;
      const all = await owner.get(base).expect(200);
      expect(all.body.total).toBe(4);

      const ranged = await owner
        .get(`${base}&priceMin=60000&priceMax=100000&sort=price`)
        .expect(200);
      expect(ranged.body.rows.map((r: { price: number }) => r.price)).toEqual([70000, 90000]);

      const desc = await owner.get(`${base}&sort=-price&pageSize=10&page=1`).expect(200);
      expect(desc.body.rows[0].price).toBe(150000);
      const paged = await owner.get(`${base}&sort=price&pageSize=10&page=2`).expect(200);
      expect(paged.body).toMatchObject({ rows: [], total: 4, page: 2 });

      const byPhone = await owner.get('/api/table/listings?q=091112233').expect(200);
      expect(byPhone.body.rows.map((r: { title: string }) => r.title)).toEqual([`${tag} дешёвая`]);
      const byDescription = await owner
        .get(`/api/table/listings?q=${encodeURIComponent('с ремонтом')}`)
        .expect(200);
      expect(byDescription.body.total).toBeGreaterThanOrEqual(1);

      await owner.get(`${base}&sort=partnerSource`).expect(400);
      await owner.get(`${base}&pageSize=1000`).expect(400);

      // Партнёр видит только свои записи — даже незакреплённые «новые» из пула нет (БТ-5.9).
      const partnerView = await tp.get(base).expect(200);
      expect(partnerView.body.rows.map((r: { title: string }) => r.title)).toEqual([
        `${tag} партнёрская`,
      ]);
    });

    it('filters clients by source, budget overlap and stage', async () => {
      const sources = (await owner.get('/api/dictionaries').expect(200)).body.source;
      const call = sources.find((s: { code: string }) => s.code === 'call').id;
      const ads = sources.find((s: { code: string }) => s.code === 'ads').id;
      const mk = (name: string, phone: string, extra: object) =>
        owner
          .post('/api/clients')
          .send({ name: `${tag} ${name}`, phone, ...extra })
          .expect(201);
      await mk('эконом', '077 100 001', { sourceId: call, budgetMax: 60000 });
      await mk('средний', '077 100 002', { sourceId: ads, budgetMin: 80000, budgetMax: 120000 });
      await mk('премиум', '077 100 003', { sourceId: ads, budgetMin: 200000 });

      const base = `/api/table/clients?q=${encodeURIComponent(tag)}`;
      const bySource = await owner.get(`${base}&sourceId=${ads}&sort=name`).expect(200);
      expect(bySource.body.rows.map((r: { name: string }) => r.name)).toEqual([
        `${tag} премиум`,
        `${tag} средний`,
      ]);
      const overlap = await owner.get(`${base}&budgetMin=100000&budgetMax=150000`).expect(200);
      expect(overlap.body.rows.map((r: { name: string }) => r.name)).toEqual([`${tag} средний`]);
      const stageNew = (await owner.get('/api/clients').expect(200)).body.stages[0].id;
      expect((await owner.get(`${base}&stageIds=${stageNew}`).expect(200)).body.total).toBe(3);
    });

    it('exports the filtered selection as CSV for staff only', async () => {
      const res = await owner
        .get(
          `/api/table/listings.csv?q=${encodeURIComponent(tag)}&sort=price&columns=title,price,stage,district`,
        )
        .buffer(true)
        .parse((r, cb) => {
          let data = '';
          r.setEncoding('utf8');
          r.on('data', (chunk: string) => (data += chunk));
          r.on('end', () => cb(null, data));
        })
        .expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      const lines = (res.body as string).replace('\uFEFF', '').trim().split('\r\n');
      expect(lines[0]).toBe('Название;Цена;Этап;Район');
      expect(lines.slice(1)).toEqual([
        `${tag} дешёвая;50000;Новое объявление;`,
        `${tag} партнёрская;70000;Новое объявление;`,
        `${tag} средняя;90000;Новое объявление;`,
        `${tag} дорогая;150000;Новое объявление;`,
      ]);
      await tp.get('/api/table/listings.csv').expect(403);
      const audit = await db.table('audit_events').findOne(w.eq('event_type', 'export.csv'));
      expect(audit?.payload).toEqual({ rows: 4 });
    });
  });

  describe('dashboard', () => {
    const period = () => {
      const now = Date.now();
      return `from=${new Date(now - 86_400_000).toISOString()}&to=${new Date(now + 86_400_000).toISOString()}`;
    };

    it('counts personal activity, stages, conversions and overdue', async () => {
      const { body: dashUser } = await owner
        .post('/api/users')
        .send({
          login: 'dash',
          displayName: 'Дэш',
          role: 'employee',
          temporaryPassword: 'Temp12345',
        })
        .expect(201);
      const dash = await signIn('dash');
      const boards = {
        listings: (await dash.get('/api/listings').expect(200)).body.stages,
        clients: (await dash.get('/api/clients').expect(200)).body.stages,
      };
      const stageId = (list: { code: string; id: number }[], code: string) =>
        list.find((x) => x.code === code)!.id;
      const source = (await dash.get('/api/dictionaries').expect(200)).body.source[0].id;

      const { body: a } = await dash.post('/api/listings').send({ title: 'Дэш A' }).expect(201);
      await dash.post('/api/listings').send({ title: 'Дэш B' }).expect(201);
      await dash
        .post(`/api/listings/${a.id}/stage`)
        .send({ stageId: stageId(boards.listings, 'call'), version: 1 })
        .expect(200);
      await dash.post(`/api/listings/${a.id}/comments`).send({ body: 'заметка' }).expect(201);
      await dash
        .post(`/api/listings/${a.id}/comments`)
        .send({ body: 'звонил', kind: 'call' })
        .expect(201);
      const { body: c } = await dash
        .post('/api/clients')
        .send({ name: 'Дэш клиент', phone: '055 900 900', sourceId: source })
        .expect(201);
      await dash
        .post(`/api/clients/${c.id}/stage`)
        .send({ stageId: stageId(boards.clients, 'call'), version: 1 })
        .expect(200);
      await dash.patch(`/api/clients/${c.id}`).send({ version: 2, budgetMax: 100000 }).expect(200);

      const me = (await dash.get(`/api/dashboard?${period()}`).expect(200)).body;
      expect(me.listings.added).toEqual({ total: 2, manual: 2, parser: 0 });
      const listingsByCode = (code: string) =>
        me.listings.byStage.find(
          (s: { stageId: number }) => s.stageId === stageId(boards.listings, code),
        ).count;
      expect([listingsByCode('new'), listingsByCode('call')]).toEqual([1, 1]);
      expect(
        me.clients.byStage.find(
          (s: { stageId: number }) => s.stageId === stageId(boards.clients, 'call'),
        ).count,
      ).toBe(1);
      expect(me.activity).toEqual({ calls: 3, comments: 1, changes: 3 });
      expect(me.conversions[0]).toMatchObject({ key: 'contact_qualified', converted: 0, total: 1 });
      expect(me.deals).toEqual({ closed: 0, commission: [], reward: null });
      expect(me.overdue).toEqual([]);

      await db.table('clients').update(c.id, { last_activity_at: '2026-01-01T00:00:00Z' });
      const aged = (await dash.get(`/api/dashboard?${period()}`).expect(200)).body;
      expect(aged.overdue).toEqual([
        expect.objectContaining({ id: c.id, name: 'Дэш клиент', responsibleName: 'Дэш' }),
      ]);

      // Владелец смотрит срез по сотруднику — те же цифры.
      const asOwner = (
        await owner.get(`/api/dashboard?${period()}&scope=${dashUser.id}`).expect(200)
      ).body;
      expect(asOwner.activity).toEqual(me.activity);
      await dash.get(`/api/dashboard?${period()}&scope=team`).expect(403);
      await dash.get(`/api/dashboard?${period()}&scope=${dashUser.id}`).expect(403);

      const team = (await owner.get(`/api/dashboard/team?${period()}`).expect(200)).body;
      expect(team.find((r: { userId: number }) => r.userId === dashUser.id)).toMatchObject({
        listingsAdded: 2,
        calls: 3,
        comments: 1,
        changes: 3,
        overdue: 1,
      });
      await dash.get(`/api/dashboard/team?${period()}`).expect(403);
    });

    it('shows team deals and commission, and partners only their reward', async () => {
      const team = (await owner.get(`/api/dashboard?${period()}&scope=team`).expect(200)).body;
      expect(team.deals.closed).toBeGreaterThanOrEqual(2);
      expect(team.deals.commission).toEqual([
        expect.objectContaining({ currency: 'USD', amount: expect.any(Number) }),
      ]);

      const partner = await logIn('dpa');
      const mine = (await partner.get(`/api/dashboard?${period()}`).expect(200)).body;
      expect(mine.deals).toEqual({
        closed: 1,
        commission: null,
        reward: { accrued: 540, paid: 0 },
      });
    });

    it('validates the period', async () => {
      await owner
        .get('/api/dashboard?from=2026-10-01T00:00:00Z&to=2026-09-01T00:00:00Z')
        .expect(400);
      await owner.get('/api/dashboard').expect(400);
    });
  });

  describe('administration', () => {
    type Agent = ReturnType<typeof request.agent>;
    let plain: Agent;
    let editor: Agent;

    it('prepares employees with and without the dictionaries right', async () => {
      await owner
        .post('/api/users')
        .send({
          login: 'adm_plain',
          displayName: 'plain',
          role: 'employee',
          temporaryPassword: 'Temp12345',
        })
        .expect(201);
      await owner
        .post('/api/users')
        .send({
          login: 'adm_editor',
          displayName: 'editor',
          role: 'employee',
          temporaryPassword: 'Temp12345',
          perms: { grantAccess: false, deleteCards: false, manageDictionaries: true },
        })
        .expect(201);
      [plain, editor] = await Promise.all([signIn('adm_plain'), signIn('adm_editor')]);
    });

    it('adds, renames, reorders and deletes custom stages', async () => {
      await plain
        .post('/api/admin/stages')
        .send({ pipeline: 'listings', name: 'Проверка' })
        .expect(403);
      const added = await editor
        .post('/api/admin/stages')
        .send({ pipeline: 'listings', name: 'Проверка документов' })
        .expect(201);
      const codes = added.body.map((s: { code: string }) => s.code);
      // Новый этап встаёт перед терминальным «Закрыт объект».
      expect(codes.slice(-2)[1]).toBe('closed');
      expect(codes.slice(-2)[0]).toMatch(/^custom_/);
      await editor
        .post('/api/admin/stages')
        .send({ pipeline: 'listings', name: 'проверка документов' })
        .expect(409);

      const custom = added.body.find((s: { code: string }) => s.code.startsWith('custom_'));
      const renamed = await editor
        .patch(`/api/admin/stages/${custom.id}`)
        .send({ name: 'Юр. проверка' })
        .expect(200);
      expect(renamed.body.name).toBe('Юр. проверка');
      const board = await owner.get('/api/listings').expect(200);
      expect(board.body.stages.map((s: { name: string }) => s.name)).toContain('Юр. проверка');

      const ids = added.body.map((s: { id: number }) => s.id);
      await editor
        .put('/api/admin/stages/order')
        .send({ pipeline: 'listings', ids: ids.slice(1) })
        .expect(400);
      const reordered = await editor
        .put('/api/admin/stages/order')
        .send({
          pipeline: 'listings',
          ids: [custom.id, ...ids.filter((x: number) => x !== custom.id)],
        })
        .expect(200);
      expect(reordered.body[0].id).toBe(custom.id);

      // Карточку можно перевести на пользовательский этап — правил у него нет.
      const { body: card } = await owner
        .post('/api/listings')
        .send({ title: 'На юр. проверке' })
        .expect(201);
      await owner
        .post(`/api/listings/${card.id}/stage`)
        .send({ stageId: custom.id, version: 1 })
        .expect(200);
      const busy = await editor.delete(`/api/admin/stages/${custom.id}`).expect(409);
      expect(busy.body.message).toMatch(/перенесите/);
      const newStage = reordered.body.find((s: { code: string }) => s.code === 'new');
      await editor.delete(`/api/admin/stages/${newStage.id}`).expect(400);

      await owner
        .post(`/api/listings/${card.id}/stage`)
        .send({ stageId: newStage.id, version: 2 })
        .expect(200);
      await editor.delete(`/api/admin/stages/${custom.id}`).expect(204);
      await editor
        .put('/api/admin/stages/order')
        .send({ pipeline: 'listings', ids: ids.filter((x: number) => x !== custom.id) })
        .expect(200);
    });

    it('adds, renames, deactivates and reorders dictionary items', async () => {
      await plain.get('/api/admin/dictionaries').expect(403);
      const all = await editor
        .post('/api/admin/dictionaries')
        .send({ kind: 'district', name: 'Норк' })
        .expect(201);
      const nork = all.body.find((d: { name: string }) => d.name === 'Норк');
      expect(nork).toMatchObject({ kind: 'district', isActive: true });
      await editor
        .post('/api/admin/dictionaries')
        .send({ kind: 'district', name: 'норк' })
        .expect(409);

      await editor
        .patch(`/api/admin/dictionaries/${nork.id}`)
        .send({ name: 'Норк-Мараш 2' })
        .expect(200);
      await editor
        .patch(`/api/admin/dictionaries/${nork.id}`)
        .send({ isActive: false })
        .expect(200);
      await editor.patch(`/api/admin/dictionaries/${nork.id}`).send({}).expect(400);
      const active = (await plain.get('/api/dictionaries').expect(200)).body.district;
      expect(active.map((d: { id: number }) => d.id)).not.toContain(nork.id);

      const districts = (await editor.get('/api/admin/dictionaries').expect(200)).body.filter(
        (d: { kind: string }) => d.kind === 'district',
      );
      const ids = districts.map((d: { id: number }) => d.id).reverse();
      const reordered = await editor
        .put('/api/admin/dictionaries/order')
        .send({ kind: 'district', ids })
        .expect(200);
      expect(
        reordered.body
          .filter((d: { kind: string }) => d.kind === 'district')
          .map((d: { id: number }) => d.id),
      ).toEqual(ids);
    });

    it('keeps parser settings owner-only and validated', async () => {
      await editor.get('/api/admin/parser/settings').expect(403);
      const current = (await owner.get('/api/admin/parser/settings').expect(200)).body;
      expect(current).toMatchObject({ enabled: false, intervalMinutes: 5, ownerOnly: true });
      await owner
        .put('/api/admin/parser/settings')
        .send({ ...current, intervalMinutes: 1 })
        .expect(400);
      const saved = await owner
        .put('/api/admin/parser/settings')
        .send({ ...current, intervalMinutes: 10, enabled: true })
        .expect(200);
      expect(saved.body).toMatchObject({ intervalMinutes: 10, enabled: true });
      expect((await owner.get('/api/admin/parser/settings').expect(200)).body.intervalMinutes).toBe(
        10,
      );
      expect((await owner.get('/api/admin/parser/runs').expect(200)).body).toEqual([]);
    });

    it('shows the audit log to the owner with filters', async () => {
      await editor.get('/api/admin/audit').expect(403);
      const settings = await owner.get('/api/admin/audit?type=settings.changed').expect(200);
      expect(settings.body.total).toBe(1);
      expect(settings.body.rows[0]).toMatchObject({
        type: 'settings.changed',
        userName: 'owner',
        payload: expect.objectContaining({ key: 'parser' }),
      });
      const stages = await owner.get('/api/admin/audit?type=stage.changed&pageSize=10').expect(200);
      expect(stages.body.rows.every((r: { userName: string }) => r.userName === 'editor')).toBe(
        true,
      );
      expect(stages.body.total).toBeGreaterThanOrEqual(5);
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const none = await owner
        .get(`/api/admin/audit?from=${encodeURIComponent(future)}`)
        .expect(200);
      expect(none.body).toMatchObject({ rows: [], total: 0 });
      await owner.get('/api/admin/audit?type=nope').expect(400);
    });
  });

  describe('partner subscription', () => {
    const DAY = 86_400_000;
    const create = (login: string) =>
      owner
        .post('/api/users')
        .send({ login, displayName: login, role: 'partner', temporaryPassword: 'Temp12345' })
        .expect(201)
        .then((r) => r.body.id as number);
    const sub = (id: number) => db.table('subscriptions').findOne(w.eq('partner_id', id));
    const at = (value: string | null | undefined) => new Date(String(value).replace(' ', 'T'));

    it('lets a partner without subscription reach only the billing page', async () => {
      await create('bill0');
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/auth/login')
        .send({ login: 'bill0', password: 'Temp12345' })
        .expect(200);
      await agent
        .post('/api/auth/change-password')
        .send({ currentPassword: 'Temp12345', newPassword: PASSWORD })
        .expect(200);
      const denied = await agent.get('/api/listings').expect(403);
      expect(denied.body.code).toBe('SUBSCRIPTION_REQUIRED');
      await agent.get('/api/auth/me').expect(200);
      const status = await agent.get('/api/me/subscription').expect(200);
      expect(status.body).toMatchObject({
        status: 'none',
        card: null,
        price: 1000,
        currency: 'RUB',
      });

      const trial = await agent
        .post('/api/me/subscription/trial')
        .send({ scenario: 'success' })
        .expect(200);
      expect(trial.body).toMatchObject({
        status: 'trial',
        autoRenew: true,
        card: { mask: '**** 4242' },
      });
      const days = (at(trial.body.nextChargeAt).getTime() - Date.now()) / DAY;
      expect(Math.round(days)).toBe(30);
      await agent.get('/api/listings').expect(200);
      await agent.post('/api/me/subscription/trial').send({ scenario: 'success' }).expect(400);
      await owner.post('/api/me/subscription/trial').send({}).expect(403);
    });

    it('warns 3 days ahead and renews on the due date exactly once', async () => {
      const id = await create('bill1');
      await signIn('bill1');
      const saga = app.get(SubscriptionService);
      const due = at((await sub(id))!.next_charge_at);

      await saga.tick(new Date(due.getTime() - 2 * DAY));
      await saga.tick(new Date(due.getTime() - 1 * DAY));
      const warnings = await db
        .table('notifications_outbox')
        .listAll({ where: w.and(w.eq('user_id', id), w.like('text', '%заканчивается%')) });
      expect(warnings).toHaveLength(1);

      const after = new Date(due.getTime() + 60_000);
      await saga.tick(after);
      await saga.tick(after);
      const renewed = (await sub(id))!;
      expect(renewed.status).toBe('active');
      expect(Math.round((at(renewed.period_end).getTime() - due.getTime()) / DAY)).toBe(30);
      const payments = await db.table('payments').listAll({ where: w.eq('partner_id', id) });
      expect(payments.map((p) => [p.status, p.amount, p.currency])).toEqual([
        ['succeeded', 1000, 'RUB'],
      ]);
    });

    it('retries on days 1, 3 and 7, then freezes and returns cards to the pool', async () => {
      const id = await create('bill2');
      const partner = request.agent(app.getHttpServer());
      await partner
        .post('/api/auth/login')
        .send({ login: 'bill2', password: 'Temp12345' })
        .expect(200);
      await partner
        .post('/api/auth/change-password')
        .send({ currentPassword: 'Temp12345', newPassword: PASSWORD })
        .expect(200);
      await partner.post('/api/me/subscription/trial').send({ scenario: 'decline' }).expect(200);
      const { body: card } = await partner
        .post('/api/listings')
        .send({ title: 'Карточка bill2' })
        .expect(201);

      const saga = app.get(SubscriptionService);
      const due = at((await sub(id))!.next_charge_at);
      await saga.tick(new Date(due.getTime() + 60_000));
      let state = (await sub(id))!;
      expect(state).toMatchObject({ status: 'grace', failed_attempts: 1 });
      expect(at(state.retry_at).getTime()).toBe(due.getTime() + 1 * DAY);
      expect(at(state.grace_until).getTime()).toBe(due.getTime() + 7 * DAY);
      await partner.get('/api/listings').expect(200);

      for (const [day, attempts] of [
        [1, 2],
        [3, 3],
      ] as const) {
        await saga.tick(new Date(due.getTime() + day * DAY + 60_000));
        state = (await sub(id))!;
        expect(state).toMatchObject({ status: 'grace', failed_attempts: attempts });
      }
      await saga.tick(new Date(due.getTime() + 7 * DAY + 60_000));
      state = (await sub(id))!;
      expect(state.status).toBe('frozen');

      const failures = await db
        .table('payments')
        .listAll({ where: w.and(w.eq('partner_id', id), w.eq('status', 'failed')) });
      expect(failures.map((p) => p.attempt)).toEqual([1, 2, 3, 4]);
      const notices = await db
        .table('notifications_outbox')
        .count(w.and(w.eq('user_id', id), w.like('text', 'Не удалось списать%')));
      expect(notices).toBe(4);

      const released = await db.table('listings').get(card.id);
      expect(released).toMatchObject({ responsible_id: null, partner_source_id: id });
      const denied = await partner.get('/api/listings').expect(403);
      expect(denied.body.code).toBe('SUBSCRIPTION_REQUIRED');
      expect((await partner.get('/api/me/subscription').expect(200)).body.status).toBe('frozen');

      // Вознаграждение, начисленное во время заморозки, ждёт разморозки (Д-11).
      const held = await db
        .table('partner_rewards')
        .create({ partner_id: id, amount: 100, status: 'on_hold', basis: 'объект' });
      await partner.post('/api/me/subscription/pay').expect(400);
      await partner.post('/api/me/subscription/card').send({ scenario: 'success' }).expect(200);
      const paid = await partner.post('/api/me/subscription/pay').expect(200);
      expect(paid.body).toMatchObject({
        status: 'active',
        autoRenew: true,
        card: { mask: '**** 4242' },
      });
      expect((await db.table('partner_rewards').get(held))?.status).toBe('accrued');
      await partner.get('/api/listings').expect(200);
      const history = await partner.get('/api/me/payments').expect(200);
      // Неудачные попытки датированы «будущим» из машины времени, поэтому ищем, а не берём первый.
      expect(history.body).toContainEqual(
        expect.objectContaining({ status: 'succeeded', amount: 1000 }),
      );
      // 4 попытки по расписанию + ручная оплата картой с отказом + успешная после смены карты.
      expect(history.body).toHaveLength(6);
    });

    it('stops at the end of the period when auto-renew is cancelled', async () => {
      const id = await create('bill3');
      const partner = await signIn('bill3');
      const off = await partner
        .post('/api/me/subscription/auto-renew')
        .send({ enabled: false })
        .expect(200);
      expect(off.body).toMatchObject({ autoRenew: false, nextChargeAt: null });

      const saga = app.get(SubscriptionService);
      const end = at((await sub(id))!.period_end);
      await saga.tick(new Date(end.getTime() - 2 * DAY));
      expect(
        await db
          .table('notifications_outbox')
          .count(w.and(w.eq('user_id', id), w.like('text', '%заканчивается%'))),
      ).toBe(0);
      await saga.tick(new Date(end.getTime() + 60_000));
      expect((await sub(id))!.status).toBe('canceled');
      expect(await db.table('payments').count(w.eq('partner_id', id))).toBe(0);
      await partner.get('/api/clients').expect(403);
      const back = await partner.post('/api/me/subscription/pay').expect(200);
      expect(back.body.status).toBe('active');
    });

    it('links Telegram through the bot and delivers queued messages', async () => {
      const id = await create('tgp');
      const partner = await signIn('tgp');
      const { body: link } = await partner.post('/api/me/telegram/link').expect(200);
      expect(link.token).toMatch(/^[a-f0-9]{32}$/);

      telegram.updates.push(
        {
          update_id: 10,
          message: { chat: { id: 555 }, text: '/start deadbeefdeadbeefdeadbeefdeadbeef' },
        },
        { update_id: 11, message: { chat: { id: 777 }, text: `/start ${link.token}` } },
      );
      const notifications = app.get(NotificationsService);
      await notifications.poll();
      expect((await db.table('users').get(id))?.telegram_chat_id).toBe('777');
      expect(telegram.sent).toContainEqual({
        chatId: '555',
        text: expect.stringMatching(/устарела/),
      });
      expect((await partner.get('/api/me/subscription').expect(200)).body.telegramLinked).toBe(
        true,
      );

      await notifications.flush();
      const toPartner = telegram.sent.filter((m) => m.chatId === '777').map((m) => m.text);
      expect(toPartner.some((t) => t.startsWith('Бесплатный период начат'))).toBe(true);
      expect(toPartner.some((t) => t.startsWith('Telegram привязан'))).toBe(true);
      // Без привязанного Telegram сообщение помечается пропущенным и не блокирует очередь.
      const skipped = await db
        .table('notifications_outbox')
        .findOne(w.and(w.eq('status', 'skipped'), w.like('text', 'Бесплатный период начат%')));
      expect(skipped?.last_error).toBe('Telegram не привязан');
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
