import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({ imports: [ListingsModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
