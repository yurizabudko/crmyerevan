import type {
  PartnerOverviewDto,
  PartnersQuery,
  PayoutInput,
  RewardDto,
  RewardsQuery,
} from '@crm/shared';
import { notifications } from '@mantine/notifications';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export function toSearch(q: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function usePartnersOverview(q: PartnersQuery) {
  return useQuery({
    queryKey: ['partners', 'overview', q],
    queryFn: () => api<PartnerOverviewDto>(`/partners${toSearch(q)}`),
    placeholderData: keepPreviousData,
  });
}

export function useRewards(q: RewardsQuery) {
  return useQuery({
    queryKey: ['partners', 'rewards', q],
    queryFn: () => api<RewardDto[]>(`/partners/rewards${toSearch(q)}`),
    placeholderData: keepPreviousData,
  });
}

export function useConfirmPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PayoutInput & { id: number }) =>
      api<RewardDto>(`/partners/rewards/${id}/pay`, { method: 'POST', body }),
    onSuccess: () => {
      notifications.show({ color: 'green', message: 'Выплата подтверждена' });
      void qc.invalidateQueries({ queryKey: ['partners'] });
    },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message }),
  });
}
