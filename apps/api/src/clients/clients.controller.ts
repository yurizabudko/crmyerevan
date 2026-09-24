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
  Query,
} from '@nestjs/common';
import {
  ClientDraft,
  ClientPatch,
  ClientStageChange,
  LinkCreate,
  LinkUpdate,
  NewComment,
  type ClientBoardDto,
  type MatchDto,
  type ClientDetailsDto,
} from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { ClientWorkflowService } from './client-workflow.service.js';
import { ClientsService } from './clients.service.js';
import { LinksService } from './links.service.js';
import { MatchingService } from './matching.service.js';

@Controller('clients')
export class ClientsController {
  constructor(
    @Inject(ClientsService) private readonly clients: ClientsService,
    @Inject(ClientWorkflowService) private readonly workflow: ClientWorkflowService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(MatchingService) private readonly matching: MatchingService,
  ) {}

  @Get()
  board(@CurrentUser() actor: User): Promise<ClientBoardDto> {
    return this.clients.board(actor);
  }

  @Get(':id')
  get(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientDetailsDto> {
    return this.clients.get(actor, id);
  }

  /** Клиенты создаются только вручную (4.1, этап 1). */
  @Post()
  async create(
    @CurrentUser() actor: User,
    @Body(new ZodPipe(ClientDraft)) body: ClientDraft,
  ): Promise<ClientDetailsDto> {
    return this.clients.get(actor, await this.workflow.create(actor, body));
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(ClientPatch)) body: ClientPatch,
  ): Promise<ClientDetailsDto> {
    await this.workflow.update(actor, id, body);
    return this.clients.get(actor, id);
  }

  @Post(':id/stage')
  @HttpCode(200)
  async changeStage(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(ClientStageChange)) body: ClientStageChange,
  ): Promise<ClientDetailsDto> {
    await this.workflow.changeStage(actor, id, body);
    return this.clients.get(actor, id);
  }

  @Post(':id/comments')
  async addComment(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(NewComment)) body: NewComment,
  ): Promise<ClientDetailsDto> {
    await this.workflow.addComment(actor, id, body);
    return this.clients.get(actor, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: User, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.workflow.remove(actor, id);
  }

  /** Автоподбор объявлений под параметры клиента; `q` — поиск по названию. */
  @Get(':id/matches')
  matches(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Query('q') q?: string,
  ): Promise<MatchDto[]> {
    return this.matching.listingsForClient(actor, id, q);
  }

  @Post(':id/links')
  async addLink(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(LinkCreate)) body: LinkCreate,
  ): Promise<ClientDetailsDto> {
    await this.links.create(actor, id, body.listingId);
    return this.clients.get(actor, id);
  }

  @Patch(':id/links/:linkId')
  async updateLink(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('linkId', ParseIntPipe) linkId: number,
    @Body(new ZodPipe(LinkUpdate)) body: LinkUpdate,
  ): Promise<ClientDetailsDto> {
    await this.links.update(actor, id, linkId, body);
    return this.clients.get(actor, id);
  }

  @Delete(':id/links/:linkId')
  async removeLink(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('linkId', ParseIntPipe) linkId: number,
  ): Promise<ClientDetailsDto> {
    await this.links.remove(actor, id, linkId);
    return this.clients.get(actor, id);
  }
}
