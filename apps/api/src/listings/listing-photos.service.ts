import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { w, type NocoDb } from '@crm/nocodb';
import { can, type Actor, type PhotoDto } from '@crm/shared';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { withLock } from '../common/redis-lock.js';
import { NOCODB, REDIS } from '../infra/infra.module.js';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage.js';
import { processImage } from '../storage/images.js';
import { isListingVisible } from './access.js';
import { CommentsService } from './comments.service.js';
import type { ListingRow } from './listing.mapper.js';
import { StagesService } from './stages.service.js';

export const MAX_PHOTOS_PER_LISTING = 30;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const thumbKey = (key: string) => key.replace(/\.jpg$/, '.thumb.jpg');

/** Фото объявлений (п. 3.4, «галерея»). Файлы отдаются только через API с проверкой доступа. */
@Injectable()
export class ListingPhotosService {
  constructor(
    @Inject(NOCODB) private readonly db: NocoDb,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(FILE_STORAGE) private readonly files: FileStorage,
    @Inject(StagesService) private readonly stages: StagesService,
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}

  async list(listingId: number): Promise<PhotoDto[]> {
    const rows = await this.db
      .table('listing_photos')
      .listAll({ where: w.eq('listing_id', listingId), sort: ['position', 'Id'] });
    return rows.map((r) => ({
      id: r.Id,
      url: `/api/photos/${r.Id}`,
      thumbUrl: `/api/photos/${r.Id}?size=thumb`,
      width: r.width,
      height: r.height,
    }));
  }

  async upload(actor: Actor, listingId: number, uploads: UploadedImage[]): Promise<void> {
    if (uploads.length === 0) throw new BadRequestException('Выберите фото');
    for (const file of uploads) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException('Можно загружать только изображения');
      }
      if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException('Фото больше 15 МБ');
    }

    // Обработка до блокировки: она долгая, а битый файл отсекается без записи.
    const processed = await Promise.all(
      uploads.map(async (u) => {
        try {
          return await processImage(u.buffer);
        } catch {
          throw new BadRequestException('Файл повреждён или это не изображение');
        }
      }),
    );

    await withLock(this.redis, `listing:${listingId}`, async () => {
      const row = await this.loadEditable(actor, listingId);
      const existing = await this.db
        .table('listing_photos')
        .listAll({ where: w.eq('listing_id', listingId), fields: ['Id', 'position'] });
      if (existing.length + processed.length > MAX_PHOTOS_PER_LISTING) {
        throw new BadRequestException(`Не больше ${MAX_PHOTOS_PER_LISTING} фото на объявление`);
      }
      let position = Math.max(0, ...existing.map((p) => p.position ?? 0));

      const created: number[] = [];
      for (const image of processed) {
        const key = `listings/${listingId}/${randomUUID()}.jpg`;
        await this.files.put(key, image.full);
        await this.files.put(thumbKey(key), image.thumb);
        created.push(
          await this.db.table('listing_photos').create({
            listing_id: listingId,
            storage_key: key,
            position: ++position,
            width: image.width,
            height: image.height,
            uploaded_by_id: actor.id,
          }),
        );
      }

      await this.db.table('listings').update(listingId, {
        cover_photo_id: row.cover_photo_id ?? created[0] ?? null,
        last_activity_at: new Date().toISOString(),
      });
      await this.comments.system(
        { type: 'listing', id: listingId },
        actor.id,
        `Добавлено фото: ${created.length}`,
      );
    });
  }

  async remove(actor: Actor, listingId: number, photoId: number): Promise<void> {
    await withLock(this.redis, `listing:${listingId}`, async () => {
      const row = await this.loadEditable(actor, listingId);
      const photo = await this.db.table('listing_photos').get(photoId);
      if (!photo || photo.listing_id !== listingId) throw new NotFoundException('Фото не найдено');

      await this.db.table('listing_photos').delete([photoId]);
      if (photo.storage_key) {
        await this.files.delete(photo.storage_key);
        await this.files.delete(thumbKey(photo.storage_key));
      }
      if (row.cover_photo_id === photoId) {
        const next = await this.db.table('listing_photos').findOne(w.eq('listing_id', listingId));
        await this.db.table('listings').update(listingId, { cover_photo_id: next?.Id ?? null });
      }
      await this.comments.system({ type: 'listing', id: listingId }, actor.id, 'Удалено фото');
    });
  }

  /** Файл фото для отдачи клиенту — только если объявление видно пользователю. */
  async file(actor: Actor, photoId: number, size: 'full' | 'thumb'): Promise<Buffer> {
    const photo = await this.db.table('listing_photos').get(photoId);
    if (!photo?.listing_id || !photo.storage_key) throw new NotFoundException('Фото не найдено');
    const listing = await this.db.table('listings').get(photo.listing_id);
    const newStage = await this.stages.byCode('listings', 'new');
    if (!listing || !isListingVisible(actor, listing, newStage.id)) {
      throw new NotFoundException('Фото не найдено');
    }
    const data = await this.files.get(
      size === 'thumb' ? thumbKey(photo.storage_key) : photo.storage_key,
    );
    if (!data) throw new NotFoundException('Файл фото отсутствует');
    return data;
  }

  private async loadEditable(actor: Actor, listingId: number): Promise<ListingRow> {
    const row = await this.db.table('listings').get(listingId);
    const newStage = await this.stages.byCode('listings', 'new');
    if (!row || !isListingVisible(actor, row, newStage.id)) {
      throw new NotFoundException('Объявление не найдено');
    }
    if (!can.managePhotos(actor, { createdById: row.created_by_id })) {
      throw new ForbiddenException('Фото меняет сотрудник или партнёр, создавший карточку');
    }
    return row;
  }
}
