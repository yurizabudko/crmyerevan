import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { ListingsModule } from '../listings/listings.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TELEGRAM_API, TelegramClient } from '../notifications/telegram.client.js';
import { BillingController } from './billing.controller.js';
import { BillingScheduler } from './billing.scheduler.js';
import { MockPaymentProvider, PAYMENT_PROVIDER } from './payment-provider.js';
import { SubscriptionGuard } from './subscription.guard.js';
import { SubscriptionService } from './subscription.service.js';

@Global()
@Module({
  imports: [ListingsModule],
  controllers: [BillingController],
  providers: [
    { provide: PAYMENT_PROVIDER, useFactory: () => new MockPaymentProvider() },
    {
      provide: TELEGRAM_API,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new TelegramClient(config.TELEGRAM_BOT_TOKEN),
    },
    NotificationsService,
    SubscriptionService,
    BillingScheduler,
    // Регистрируется после AuthGuard (модуль импортируется позже) — пользователь уже известен.
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
  exports: [SubscriptionService, NotificationsService],
})
export class BillingModule {}
