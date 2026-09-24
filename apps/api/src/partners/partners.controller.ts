import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  PartnersQuery,
  PayoutInput,
  RewardsQuery,
  type PartnerDealDto,
  type PartnerOverviewDto,
  type RewardDto,
} from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { PartnersService } from './partners.service.js';

@Controller()
export class PartnersController {
  constructor(@Inject(PartnersService) private readonly partners: PartnersService) {}

  /** «Мои сделки» партнёра (8.4, п. 4). */
  @Get('me/deals')
  myDeals(@CurrentUser() actor: User): Promise<PartnerDealDto[]> {
    return this.partners.myDeals(actor);
  }

  @Get('partners')
  overview(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(PartnersQuery)) q: PartnersQuery,
  ): Promise<PartnerOverviewDto> {
    return this.partners.overview(actor, q);
  }

  @Get('partners/rewards')
  rewards(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(RewardsQuery)) q: RewardsQuery,
  ): Promise<RewardDto[]> {
    return this.partners.ownerRewards(actor, q);
  }

  @Get('partners/rewards.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payouts.csv"')
  registry(
    @CurrentUser() actor: User,
    @Query(new ZodPipe(RewardsQuery)) q: RewardsQuery,
  ): Promise<string> {
    return this.partners.payoutRegistryCsv(actor, q);
  }

  @Post('partners/rewards/:id/pay')
  pay(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(PayoutInput)) body: PayoutInput,
  ): Promise<RewardDto> {
    return this.partners.confirmPayout(actor, id, body);
  }
}
