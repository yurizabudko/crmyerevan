import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // За reverse proxy (Caddy): корректные IP клиентов для аудита входов.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.API_PORT);
  Logger.log(`API слушает порт ${config.API_PORT}`, 'Bootstrap');
}

void bootstrap();
