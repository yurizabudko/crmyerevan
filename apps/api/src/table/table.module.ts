import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { TableController } from './table.controller.js';
import { TableService } from './table.service.js';

@Module({ imports: [ListingsModule], controllers: [TableController], providers: [TableService] })
export class TableModule {}
