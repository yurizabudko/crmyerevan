import type { PartnerDealDto, PaymentDto, SubscriptionDto } from '@crm/shared';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

const KEY = ['subscription'] as const;

export function useSubscription(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<SubscriptionDto>('/me/subscription'),
    enabled,
  });
}

export function usePayments() {
  return useQuery({
    queryKey: ['subscription', 'payments'],
    queryFn: () => api<PaymentDto[]>('/me/payments'),
  });
}

export function useMyDeals(enabled: boolean) {
  return useQuery({
    queryKey: ['subscription', 'deals'],
    queryFn: () => api<PartnerDealDto[]>('/me/deals'),
    enabled,
  });
}

function useBillingMutation<TVars>(
  fn: (vars: TVars) => Promise<SubscriptionDto>,
  success?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (sub) => {
      qc.setQueryData(KEY, sub);
      void qc.invalidateQueries({ queryKey: ['subscription', 'payments'] });
      if (success) notifications.show({ color: 'green', message: success });
    },
    onError: (e: Error) => {
      notifications.show({ color: 'red', message: e.message });
      void qc.invalidateQueries({ queryKey: ['subscription'] });
    },
  });
}

type Scenario = 'success' | 'decline';

export const useStartTrial = () =>
  useBillingMutation(
    (scenario: Scenario) =>
      api<SubscriptionDto>('/me/subscription/trial', { method: 'POST', body: { scenario } }),
    'Бесплатный период начат',
  );
export const useReplaceCard = () =>
  useBillingMutation(
    (scenario: Scenario) =>
      api<SubscriptionDto>('/me/subscription/card', { method: 'POST', body: { scenario } }),
    'Карта привязана',
  );
export const usePayNow = () =>
  useBillingMutation(
    () => api<SubscriptionDto>('/me/subscription/pay', { method: 'POST' }),
    'Оплата прошла',
  );
export const useAutoRenew = () =>
  useBillingMutation((enabled: boolean) =>
    api<SubscriptionDto>('/me/subscription/auto-renew', { method: 'POST', body: { enabled } }),
  );

export function useTelegramLink() {
  return useMutation({
    mutationFn: () =>
      api<{ url: string | null; token: string }>('/me/telegram/link', { method: 'POST' }),
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message }),
  });
}
