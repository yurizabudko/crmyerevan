import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service.js';
import { ListingIntakeService } from './listing-intake.service.js';
import { ListingWorkflowService } from './listing-workflow.service.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { StagesService } from './stages.service.js';

@Module({
  controllers: [ListingsController],
  providers: [
    ListingsService,
    ListingIntakeService,
    ListingWorkflowService,
    StagesService,
    CommentsService,
  ],
  exports: [ListingIntakeService, StagesService, CommentsService],
})
export class ListingsModule {}
