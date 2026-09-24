import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ListingDraft } from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { ListingIntakeService } from './listing-intake.service.js';
import { ListingsService, type ListingBoard, type ListingDetails } from './listings.service.js';

@Controller('listings')
export class ListingsController {
  constructor(
    @Inject(ListingsService) private readonly listings: ListingsService,
    @Inject(ListingIntakeService) private readonly intake: ListingIntakeService,
  ) {}

  @Get()
  board(@CurrentUser() actor: User): Promise<ListingBoard> {
    return this.listings.board(actor);
  }

  @Get(':id')
  get(@CurrentUser() actor: User, @Param('id', ParseIntPipe) id: number): Promise<ListingDetails> {
    return this.listings.get(actor, id);
  }

  /** Ручное добавление объявления. Автоимпорт сюда не ходит — см. TODO(auto-import). */
  @Post()
  async create(
    @CurrentUser() actor: User,
    @Body(new ZodPipe(ListingDraft)) body: ListingDraft,
  ): Promise<ListingDetails> {
    const { id } = await this.intake.createManual(actor, body);
    return this.listings.get(actor, id);
  }
}
