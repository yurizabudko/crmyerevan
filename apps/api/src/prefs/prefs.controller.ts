import { BadRequestException, Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';
import { w, type NocoDb } from '@crm/nocodb';
import { CurrentUser } from '../auth/decorators.js';
import { NOCODB } from '../infra/infra.module.js';
import type { User } from '../users/users.repository.js';

const KEY_PATTERN = /^[a-z][a-z0-9._-]{1,63}$/;
const MAX_VALUE_BYTES = 64 * 1024;

/**
 * Личные настройки интерфейса (per-user): ручной порядок карточек в колонках (БТ-3.3.2),
 * колонки таблицы (БТ-5.2) и т.п. Значение — произвольный JSON, его смысл знает фронтенд.
 */
@Controller('me/prefs')
export class PrefsController {
  constructor(@Inject(NOCODB) private readonly db: NocoDb) {}

  @Get(':key')
  async get(@CurrentUser() user: User, @Param('key') key: string): Promise<{ value: unknown }> {
    const row = await this.find(user.id, this.checkKey(key));
    return { value: row?.value ?? null };
  }

  @Put(':key')
  async put(
    @CurrentUser() user: User,
    @Param('key') key: string,
    @Body() body: { value?: unknown },
  ): Promise<{ value: unknown }> {
    this.checkKey(key);
    const value = body?.value ?? null;
    if (JSON.stringify(value).length > MAX_VALUE_BYTES) {
      throw new BadRequestException('Слишком большое значение настройки');
    }
    const existing = await this.find(user.id, key);
    if (existing) await this.db.table('user_prefs').update(existing.Id, { value });
    else await this.db.table('user_prefs').create({ user_id: user.id, key, value });
    return { value };
  }

  private checkKey(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new BadRequestException('Некорректный ключ настройки');
    return key;
  }

  private find(userId: number, key: string) {
    return this.db.table('user_prefs').findOne(w.and(w.eq('user_id', userId), w.eq('key', key)));
  }
}
