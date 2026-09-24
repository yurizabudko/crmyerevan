import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DictionariesController } from './dictionaries/dictionaries.controller.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { PartnersModule } from './partners/partners.module.js';
import { PrefsController } from './prefs/prefs.controller.js';
import { StorageModule } from './storage/storage.module.js';
import { TableModule } from './table/table.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    InfraModule,
    StorageModule,
    AuditModule,
    AuthModule,
    BillingModule,
    UsersModule,
    ListingsModule,
    ClientsModule,
    TableModule,
    DashboardModule,
    AdminModule,
    PartnersModule,
  ],
  controllers: [HealthController, DictionariesController, PrefsController],
})
export class AppModule {}
