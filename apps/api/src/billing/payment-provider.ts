import { randomUUID } from 'node:crypto';

export interface BoundCard {
  token: string;
  mask: string;
}

export type ChargeResult = { ok: true; providerPaymentId: string } | { ok: false; error: string };

/**
 * Платёжный провайдер подписки (БТ-8.3.1): токенизация карты и рекуррентные списания.
 * Реквизиты карты сервер CRM не видит — только токен и маску.
 */
export interface PaymentProvider {
  readonly name: string;
  bindCard(input: { partnerId: number; scenario?: MockScenario }): Promise<BoundCard>;
  charge(input: {
    token: string;
    amount: number;
    currency: string;
    idempotencyKey: string;
    description: string;
  }): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Сценарии тестовой карты: успешные списания или отказ банка. */
export type MockScenario = 'success' | 'decline';

// TODO(payments): реальный провайдер (ЮKassa / CloudPayments — после решения юридического вопроса, В-9).
// Привязка карты у них идёт через их платёжную страницу/виджет: bindCard вернёт ссылку/виджет,
// а токен придёт вебхуком. Номер карты не должен проходить через сервер CRM ни в каком режиме.

/**
 * Тестовый провайдер для разработки и демонстрации: денег не списывает.
 * Токен помнит сценарий: карта «с отказом» всегда получает отказ банка.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async bindCard({ scenario = 'success' }: { partnerId: number; scenario?: MockScenario }) {
    return {
      token: `mock_${scenario}_${randomUUID()}`,
      mask: scenario === 'success' ? '**** 4242' : '**** 0002',
    };
  }

  async charge({ token }: { token: string }): Promise<ChargeResult> {
    if (token.startsWith('mock_decline_')) {
      return { ok: false, error: 'Отказ банка: недостаточно средств (тестовая карта)' };
    }
    return { ok: true, providerPaymentId: `mock_pay_${randomUUID()}` };
  }
}
