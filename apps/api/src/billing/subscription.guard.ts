import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../auth/decorators.js';
import { IS_PUBLIC } from '../auth/decorators.js';
import { SubscriptionService } from './subscription.service.js';

export const WITHOUT_SUBSCRIPTION = 'billing:withoutSubscription';

/** Маршрут доступен партнёру без действующей подписки: вход, профиль, оплата. */
export const AllowWithoutSubscription = () => SetMetadata(WITHOUT_SUBSCRIPTION, true);

/**
 * Партнёр без действующей подписки (не активирована, заморожена, отменена) видит только
 * страницу оплаты (БТ-8.3.5). Работает после AuthGuard — пользователь уже известен.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(WITHOUT_SUBSCRIPTION, targets)) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user || user.role !== 'partner') return true;
    if (await this.subscriptions.hasAccess(user.id)) return true;
    throw new ForbiddenException({
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Нужна действующая подписка — оформите или оплатите её в личном кабинете',
    });
  }
}
