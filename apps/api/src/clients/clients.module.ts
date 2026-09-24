import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { ClientWorkflowService } from './client-workflow.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';

@Module({
  imports: [ListingsModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientWorkflowService],
})
export class ClientsModule {}
