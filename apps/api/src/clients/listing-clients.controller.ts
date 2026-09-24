import { Controller, Get, Inject, Param, ParseIntPipe } from '@nestjs/common';
import type { MatchDto } from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { User } from '../users/users.repository.js';
import { MatchingService } from './matching.service.js';

/** Клиенты под объявление (БТ-3.2.2). Живёт в модуле клиентов, чтобы не было цикла модулей. */
@Controller('listings')
export class ListingClientsController {
  constructor(@Inject(MatchingService) private readonly matching: MatchingService) {}

  @Get(':id/matches')
  matches(@CurrentUser() actor: User, @Param('id', ParseIntPipe) id: number): Promise<MatchDto[]> {
    return this.matching.clientsForListing(actor, id);
  }
}
