import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersRepository } from '../users/users.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SessionStore } from './session.store.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionStore,
    UsersRepository,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionStore, UsersRepository],
})
export class AuthModule {}
