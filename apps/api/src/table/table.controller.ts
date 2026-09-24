import { Controller, ForbiddenException, Get, Header, Inject, Query } from '@nestjs/common';
import {
  ClientTableQuery,
  ListingTableQuery,
  can,
  type ClientDto,
  type ListingDto,
  type TablePage,
} from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { TableService } from './table.service.js';

@Controller('table')
export class TableController {
  constructor(@Inject(TableService) private readonly table: TableService) {}

  @Get('listings')
  listings(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(ListingTableQuery)) q: ListingTableQuery,
  ): Promise<TablePage<ListingDto>> {
    return this.table.listings(actor, q);
  }

  @Get('clients')
  clients(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(ClientTableQuery)) q: ClientTableQuery,
  ): Promise<TablePage<ClientDto>> {
    return this.table.clients(actor, q);
  }

  @Get('listings.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="listings.csv"')
  listingsCsv(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(ListingTableQuery)) q: ListingTableQuery,
  ): Promise<string> {
    if (!can.exportCsv(actor)) throw new ForbiddenException('Выгрузка недоступна');
    return this.table.listingsCsv(actor, q);
  }

  @Get('clients.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="clients.csv"')
  clientsCsv(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(ClientTableQuery)) q: ClientTableQuery,
  ): Promise<string> {
    if (!can.exportCsv(actor)) throw new ForbiddenException('Выгрузка недоступна');
    return this.table.clientsCsv(actor, q);
  }
}
