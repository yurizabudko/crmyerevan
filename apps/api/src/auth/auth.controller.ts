import { Body, Controller, Get, HttpCode, Inject, Ip, Post, Req, Res } from '@nestjs/common';
import { ChangePasswordRequest, LoginRequest } from '@crm/shared';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import {
  AllowPendingPasswordChange,
  CurrentUser,
  Public,
  type AuthedRequest,
} from './decorators.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './session.store.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginRequest)) body: LoginRequest,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const { token, user } = await this.auth.login(body, ip);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: '/',
    });
    return user;
  }

  @AllowPendingPasswordChange()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthedRequest,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.user, req.sessionToken, ip);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: User): User {
    return user;
  }

  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(ChangePasswordRequest)) body: ChangePasswordRequest,
    @Ip() ip: string,
  ): Promise<User> {
    return this.auth.changePassword(req.user, req.sessionToken, body, ip);
  }
}
