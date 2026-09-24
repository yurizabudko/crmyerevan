import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import {
  CreateUserRequest,
  ResetPasswordRequest,
  SetPermissionsRequest,
  type UserBriefDto,
} from '@crm/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from './users.repository.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() actor: User): Promise<User[]> {
    return this.users.list(actor);
  }

  @Get('directory')
  directory(@CurrentUser() actor: User): Promise<UserBriefDto[]> {
    return this.users.directory(actor);
  }

  @Post()
  create(
    @CurrentUser() actor: User,
    @Body(new ZodPipe(CreateUserRequest)) body: CreateUserRequest,
  ): Promise<User> {
    return this.users.create(actor, body);
  }

  @Post(':id/block')
  block(@CurrentUser() actor: User, @Param('id', ParseIntPipe) id: number): Promise<User> {
    return this.users.setBlocked(actor, id, true);
  }

  @Post(':id/unblock')
  unblock(@CurrentUser() actor: User, @Param('id', ParseIntPipe) id: number): Promise<User> {
    return this.users.setBlocked(actor, id, false);
  }

  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(ResetPasswordRequest)) body: ResetPasswordRequest,
  ): Promise<User> {
    return this.users.resetPassword(actor, id, body);
  }

  @Put(':id/permissions')
  setPermissions(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(SetPermissionsRequest)) body: SetPermissionsRequest,
  ): Promise<User> {
    return this.users.setPermissions(actor, id, body);
  }
}
