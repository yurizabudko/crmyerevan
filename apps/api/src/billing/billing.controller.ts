import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import type { PaymentDto, SubscriptionDto } from '@crm/shared';
import { z } from 'zod';
import { AllowPendingPasswordChange, CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { User } from '../users/users.repository.js';
import { AllowWithoutSubscription } from './subscription.guard.js';
import { SubscriptionService } from './subscription.service.js';

const CardInput = z.object({ scenario: z.enum(['success', 'decline']).default('success') });
type CardInput = z.infer<typeof CardInput>;
const AutoRenewInput = z.object({ enabled: z.boolean() });
type AutoRenewInput = z.infer<typeof AutoRenewInput>;

/** Личный кабинет подписки партнёра (8.4). Доступен и при заморозке. */
@AllowWithoutSubscription()
@Controller('me')
export class BillingController {
  constructor(
    @Inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get('subscription')
  get(@CurrentUser() user: User): Promise<SubscriptionDto> {
    return this.subscriptions.get(user.id);
  }

  @Post('subscription/trial')
  @HttpCode(200)
  startTrial(
    @CurrentUser() user: User,
    @Body(new ZodPipe(CardInput)) body: CardInput,
  ): Promise<SubscriptionDto> {
    return this.subscriptions.startTrial(user, body.scenario);
  }

  @Post('subscription/card')
  @HttpCode(200)
  replaceCard(
    @CurrentUser() user: User,
    @Body(new ZodPipe(CardInput)) body: CardInput,
  ): Promise<SubscriptionDto> {
    return this.subscriptions.replaceCard(user, body.scenario);
  }

  @Post('subscription/pay')
  @HttpCode(200)
  pay(@CurrentUser() user: User): Promise<SubscriptionDto> {
    return this.subscriptions.payNow(user);
  }

  @Post('subscription/auto-renew')
  @HttpCode(200)
  autoRenew(
    @CurrentUser() user: User,
    @Body(new ZodPipe(AutoRenewInput)) body: AutoRenewInput,
  ): Promise<SubscriptionDto> {
    return this.subscriptions.setAutoRenew(user, body.enabled);
  }

  @Get('payments')
  payments(@CurrentUser() user: User): Promise<PaymentDto[]> {
    return this.subscriptions.payments(user.id);
  }

  /** Ссылка для привязки Telegram — для любого пользователя. */
  @AllowPendingPasswordChange()
  @Post('telegram/link')
  @HttpCode(200)
  telegramLink(@CurrentUser() user: User): Promise<{ url: string | null; token: string }> {
    return this.notifications.createLink(user.id);
  }
}
