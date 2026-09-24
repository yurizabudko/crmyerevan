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
} from '@nestjs/common';
import {
  ClientDraft,
  ClientPatch,
  ClientStageChange,
  NewComment,
  type ClientBoardDto,
  type ClientDetailsDto,
} from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { ClientWorkflowService } from './client-workflow.service.js';
import { ClientsService } from './clients.service.js';

@Controller('clients')
export class ClientsController {
  constructor(
    @Inject(ClientsService) private readonly clients: ClientsService,
    @Inject(ClientWorkflowService) private readonly workflow: ClientWorkflowService,
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
}
