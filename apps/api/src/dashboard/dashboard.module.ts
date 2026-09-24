import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [ListingsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
