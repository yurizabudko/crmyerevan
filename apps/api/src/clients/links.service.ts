import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { w, type NocoDb, type Row, type WithId } from '@crm/nocodb';
import {
  LINK_STATUS_LABELS,
  type Actor,
  type ClientListingLinkDto,
  type LinkUpdate,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { formatMoment } from '../common/card-utils.js';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { isListingVisible } from '../listings/access.js';
import { CommentsService } from '../listings/comments.service.js';
import { StagesService } from '../listings/stages.service.js';
import { isClientVisible } from './access.js';

type LinkRow = WithId<Row<'client_listing_links'>>;

/** Связь клиент ↔ объявление, многие-ко-многим со статусом (БТ-4.4.1). */
@Injectable()
export class LinksService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}

  /** Подборка клиента со сведениями об объектах. */
  async forClient(clientId: number): Promise<ClientListingLinkDto[]> {
    const links = await this.db
      .table('client_listing_links')
      .listAll({ where: w.eq('client_id', clientId), sort: ['Id'] });
    if (links.length === 0) return [];
    const listings = await this.db.table('listings').listAll({
      where: w.in(
        'Id',
        links.map((l) => l.listing_id ?? 0),
      ),
    });
    const closed = await this.stages.byCode('listings', 'closed');
    return links.map((l) => {
      const listing = listings.find((x) => x.Id === l.listing_id);
      return {
        ...base(l),
        listing:
          listing && !listing.deleted_at
            ? {
                title: listing.title ?? '',
                price: listing.price,
                currency: listing.currency,
                districtId: listing.district_id,
                rooms: listing.rooms,
                coverPhotoId: listing.cover_photo_id,
                closed: listing.stage_id === closed.id,
              }
            : null,
        client: null,
      };
    });
  }

  /** Клиенты, которым предлагали объект; партнёр видит только своих клиентов. */
  async forListing(actor: Actor, listingId: number): Promise<ClientListingLinkDto[]> {
    const links = await this.db
      .table('client_listing_links')
      .listAll({ where: w.eq('listing_id', listingId), sort: ['Id'] });
    if (links.length === 0) return [];
    const clients = await this.db.table('clients').listAll({
      where: w.in(
        'Id',
        links.map((l) => l.client_id ?? 0),
      ),
    });
    return links.flatMap((l) => {
      const client = clients.find((c) => c.Id === l.client_id);
      if (!client || !isClientVisible(actor, client)) return [];
      return [
        { ...base(l), listing: null, client: { name: client.name ?? '', phone: client.phone } },
      ];
    });
  }

  async create(actor: Actor, clientId: number, listingId: number): Promise<void> {
    const client = await this.loadClient(actor, clientId);
    const listing = await this.db.table('listings').get(listingId);
    const newStage = await this.stages.byCode('listings', 'new');
    if (!listing || !isListingVisible(actor, listing, newStage.id)) {
      throw new NotFoundException('Объявление не найдено');
    }
    await withLock(this.redis, `client-links:${clientId}`, async () => {
      const exists = await this.db
        .table('client_listing_links')
        .findOne(w.and(w.eq('client_id', clientId), w.eq('listing_id', listingId)));
      if (exists) throw new ConflictException('Объект уже в подборке клиента');
      await this.db.table('client_listing_links').create({
        client_id: clientId,
        listing_id: listingId,
        status: 'proposed',
        created_by_id: actor.id,
      });
    });
    await this.touchClient(clientId);
    await this.comments.system(
      { type: 'client', id: clientId },
      actor.id,
      `Предложен объект: ${listing.title ?? `#${listingId}`}`,
    );
    await this.comments.system(
      { type: 'listing', id: listingId },
      actor.id,
      `Предложен клиенту: ${client.name ?? `#${clientId}`}`,
    );
  }

  async update(actor: Actor, clientId: number, linkId: number, input: LinkUpdate): Promise<void> {
    const client = await this.loadClient(actor, clientId);
    await withLock(this.redis, `client-links:${clientId}`, async () => {
      const link = await this.loadLink(clientId, linkId);
      if (input.status === 'showing_scheduled' && !input.showingAt) {
        throw new BadRequestException('Укажите дату и время показа');
      }
      if (input.status === 'chosen') {
        const chosen = await this.db
          .table('client_listing_links')
          .findOne(
            w.and(w.eq('client_id', clientId), w.eq('status', 'chosen'), w.neq('Id', linkId)),
          );
        if (chosen) throw new BadRequestException('У клиента уже есть выбранный объект');
      }
      await this.db.table('client_listing_links').update(linkId, {
        status: input.status,
        showing_at: input.showingAt ?? link.showing_at,
      });

      const listing = link.listing_id ? await this.db.table('listings').get(link.listing_id) : null;
      const title = listing?.title ?? `#${link.listing_id}`;
      let note = `${title}: ${LINK_STATUS_LABELS[link.status ?? ''] ?? '—'} → ${LINK_STATUS_LABELS[input.status]}`;

      // Назначенный показ — запись показа и счётчик в карточке клиента (4.1, этап 5).
      if (input.status === 'showing_scheduled' && input.showingAt) {
        await this.db.table('showings').create({
          client_id: clientId,
          listing_id: link.listing_id,
          link_id: linkId,
          scheduled_at: input.showingAt,
          created_by_id: actor.id,
        });
        await this.db.table('clients').update(clientId, {
          showings_count: (client.showings_count ?? 0) + 1,
          next_showing_at: input.showingAt,
        });
        note += ` (${formatMoment(input.showingAt)})`;
      }
      await this.touchClient(clientId);
      await this.comments.system({ type: 'client', id: clientId }, actor.id, `Подборка: ${note}`);
      if (link.listing_id) {
        await this.comments.system(
          { type: 'listing', id: link.listing_id },
          actor.id,
          `Клиент ${client.name ?? ''}: ${LINK_STATUS_LABELS[input.status]}`,
        );
      }
    });
  }

  async remove(actor: Actor, clientId: number, linkId: number): Promise<void> {
    await this.loadClient(actor, clientId);
    await withLock(this.redis, `client-links:${clientId}`, async () => {
      const link = await this.loadLink(clientId, linkId);
      if (link.status === 'chosen') {
        throw new BadRequestException('Выбранный объект нельзя убрать из подборки');
      }
      await this.db.table('client_listing_links').delete([linkId]);
      await this.comments.system(
        { type: 'client', id: clientId },
        actor.id,
        `Объект #${link.listing_id} убран из подборки`,
      );
    });
  }

  private async loadClient(actor: Actor, clientId: number) {
    const client = await this.db.table('clients').get(clientId);
    if (!client || !isClientVisible(actor, client)) throw new NotFoundException('Клиент не найден');
    return client;
  }

  private async loadLink(clientId: number, linkId: number): Promise<LinkRow> {
    const link = await this.db.table('client_listing_links').get(linkId);
    if (!link || link.client_id !== clientId) throw new NotFoundException('Связь не найдена');
    return link;
  }

  private async touchClient(clientId: number): Promise<void> {
    await this.db.table('clients').update(clientId, { last_activity_at: new Date().toISOString() });
  }
}

function base(l: LinkRow) {
  return {
    id: l.Id,
    clientId: l.client_id ?? 0,
    listingId: l.listing_id ?? 0,
    status: l.status ?? 'proposed',
    showingAt: l.showing_at,
  };
}
