import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { ClientWorkflowService } from './client-workflow.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { DealClosingService } from './deal-closing.service.js';
import { ListingClientsController } from './listing-clients.controller.js';
import { MatchingService } from './matching.service.js';

@Module({
  imports: [ListingsModule],
  controllers: [ClientsController, ListingClientsController],
  providers: [ClientsService, ClientWorkflowService, MatchingService, DealClosingService],
})
export class ClientsModule {}
