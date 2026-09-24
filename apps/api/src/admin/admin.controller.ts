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
  Put,
  Query,
} from '@nestjs/common';
import {
  AuditQuery,
  DictionaryItemCreate,
  DictionaryItemUpdate,
  DictionaryOrder,
  ParserSettings,
  StageCreate,
  StageOrder,
  StageRename,
  type AdminDictionaryItemDto,
  type AuditEventDto,
  type ParserRunDto,
  type StageDto,
  type TablePage,
} from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { AdminService } from './admin.service.js';

@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Post('stages')
  addStage(
    @CurrentUser() actor: User,
    @Body(new ZodPipe(StageCreate)) body: StageCreate,
  ): Promise<StageDto[]> {
    return this.admin.addStage(actor, body);
  }

  @Patch('stages/:id')
  renameStage(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(StageRename)) body: StageRename,
  ): Promise<StageDto> {
    return this.admin.renameStage(actor, id, body.name);
  }

  @Put('stages/order')
  reorderStages(
    @CurrentUser() actor: User,
    @Body(new ZodPipe(StageOrder)) body: StageOrder,
  ): Promise<StageDto[]> {
    return this.admin.reorderStages(actor, body);
  }

  @Delete('stages/:id')
  @HttpCode(204)
  deleteStage(@CurrentUser() actor: User, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.admin.deleteStage(actor, id);
  }

  @Get('dictionaries')
  dictionaries(@CurrentUser() actor: User): Promise<AdminDictionaryItemDto[]> {
    return this.admin.dictionaries(actor);
  }

  @Post('dictionaries')
  async addDictionaryItem(
    @CurrentUser() actor: User,
    @Body(new ZodPipe(DictionaryItemCreate)) body: DictionaryItemCreate,
  ): Promise<AdminDictionaryItemDto[]> {
    await this.admin.addDictionaryItem(actor, body);
    return this.admin.dictionaries(actor);
  }

  @Patch('dictionaries/:id')
  async updateDictionaryItem(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(DictionaryItemUpdate)) body: DictionaryItemUpdate,
  ): Promise<AdminDictionaryItemDto[]> {
    await this.admin.updateDictionaryItem(actor, id, body);
    return this.admin.dictionaries(actor);
  }

  @Put('dictionaries/order')
  async reorderDictionary(
    @CurrentUser() actor: User,
    @Body(new ZodPipe(DictionaryOrder)) body: DictionaryOrder,
  ): Promise<AdminDictionaryItemDto[]> {
    await this.admin.reorderDictionary(actor, body);
    return this.admin.dictionaries(actor);
  }

  @Get('parser/settings')
  parserSettings(@CurrentUser() actor: User): Promise<ParserSettings> {
    return this.admin.parserSettings(actor);
  }

  @Put('parser/settings')
  saveParserSettings(
    @CurrentUser() actor: User,
    @Body(new ZodPipe(ParserSettings)) body: ParserSettings,
  ): Promise<ParserSettings> {
    return this.admin.saveParserSettings(actor, body);
  }

  @Get('parser/runs')
  parserRuns(@CurrentUser() actor: User): Promise<ParserRunDto[]> {
    return this.admin.parserRuns(actor);
  }

  @Get('audit')
  audit(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(AuditQuery)) q: AuditQuery,
  ): Promise<TablePage<AuditEventDto>> {
    return this.admin.auditLog(actor, q);
  }
}
