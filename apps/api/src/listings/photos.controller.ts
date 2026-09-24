import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators.js';
import type { User } from '../users/users.repository.js';
import { ListingPhotosService } from './listing-photos.service.js';

@Controller('photos')
export class PhotosController {
  constructor(@Inject(ListingPhotosService) private readonly photos: ListingPhotosService) {}

  @Get(':id')
  async get(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Query('size') size: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const data = await this.photos.file(actor, id, size === 'thumb' ? 'thumb' : 'full');
    // Файл по ID не меняется: при замене фото создаётся новая запись.
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=604800, immutable',
    });
    return new StreamableFile(data);
  }
}
