import { Inject, Injectable } from '@nestjs/common';
import type { NocoDb } from '@crm/nocodb';
import type { AuditEventType } from '@crm/shared';
import { NOCODB } from '../infra/infra.module.js';

export interface AuditEntry {
  type: AuditEventType;
  userId?: number | null;
  entityType?: string;
  entityId?: number;
  payload?: Record<string, unknown>;
  ip?: string;
}

/** Журнал администрирования (раздел 7.4). Только добавление записей (НФТ-3). */
@Injectable()
export class AuditService {
  constructor(@Inject(NOCODB) private readonly db: NocoDb) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.table('audit_events').create({
      event_type: entry.type,
      user_id: entry.userId ?? null,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      payload: entry.payload ?? null,
      ip: entry.ip ?? null,
      at: new Date().toISOString(),
    });
  }
}
