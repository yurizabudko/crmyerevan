import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ListingDraft, ListingPatch, ListingStageChange, NewComment } from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { ListingIntakeService } from './listing-intake.service.js';
import { ListingWorkflowService } from './listing-workflow.service.js';
import { ListingsService, type ListingBoard, type ListingDetails } from './listings.service.js';

@Controller('listings')
export class ListingsController {
  constructor(
    @Inject(ListingsService) private readonly listings: ListingsService,
    @Inject(ListingIntakeService) private readonly intake: ListingIntakeService,
    @Inject(ListingWorkflowService) private readonly workflow: ListingWorkflowService,
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

  @Patch(':id')
  async update(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(ListingPatch)) body: ListingPatch,
  ): Promise<ListingDetails> {
    await this.workflow.update(actor, id, body);
    return this.listings.get(actor, id);
  }

  @Post(':id/stage')
  @HttpCode(200)
  async changeStage(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(ListingStageChange)) body: ListingStageChange,
  ): Promise<ListingDetails> {
    await this.workflow.changeStage(actor, id, body);
    return this.listings.get(actor, id);
  }

  @Post(':id/comments')
  async addComment(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(NewComment)) body: NewComment,
  ): Promise<ListingDetails> {
    await this.workflow.addComment(actor, id, body);
    return this.listings.get(actor, id);
  }
}
