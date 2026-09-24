import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DictionariesController } from './dictionaries/dictionaries.controller.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [InfraModule, AuditModule, AuthModule, UsersModule, ListingsModule],
  controllers: [HealthController, DictionariesController],
})
export class AppModule {}
