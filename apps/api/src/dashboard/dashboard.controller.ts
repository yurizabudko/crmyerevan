import { Controller, Get, Inject, Query } from '@nestjs/common';
import { DashboardQuery, type DashboardDto, type TeamRow } from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  get(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(DashboardQuery)) q: DashboardQuery,
  ): Promise<DashboardDto> {
    return this.dashboard.get(actor, q);
  }

  @Get('team')
  team(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(DashboardQuery)) q: DashboardQuery,
  ): Promise<TeamRow[]> {
    return this.dashboard.team(actor, q);
  }
}
