import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ListingDraft, ListingPatch, ListingStageChange, NewComment } from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { ListingIntakeService } from './listing-intake.service.js';
import {
  ListingPhotosService,
  MAX_PHOTO_BYTES,
  type UploadedImage,
} from './listing-photos.service.js';
import { ListingWorkflowService } from './listing-workflow.service.js';
import { ListingsService, type ListingBoard, type ListingDetails } from './listings.service.js';

@Controller('listings')
export class ListingsController {
  constructor(
    @Inject(ListingsService) private readonly listings: ListingsService,
    @Inject(ListingIntakeService) private readonly intake: ListingIntakeService,
    @Inject(ListingWorkflowService) private readonly workflow: ListingWorkflowService,
    @Inject(ListingPhotosService) private readonly photos: ListingPhotosService,
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

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: User, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.workflow.remove(actor, id);
  }

  /** Загрузка фото: до 10 файлов за раз, поле формы `photos`. */
  @Post(':id/photos')
  @UseInterceptors(
    FilesInterceptor('photos', 10, { limits: { fileSize: MAX_PHOTO_BYTES, files: 10 } }),
  )
  async uploadPhotos(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: UploadedImage[] | undefined,
  ): Promise<ListingDetails> {
    await this.photos.upload(actor, id, files ?? []);
    return this.listings.get(actor, id);
  }

  @Delete(':id/photos/:photoId')
  async removePhoto(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ): Promise<ListingDetails> {
    await this.photos.remove(actor, id, photoId);
    return this.listings.get(actor, id);
  }
}
