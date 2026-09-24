import type { DashboardDto, TeamRow } from '@crm/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Period } from './period';

export function useDashboard(period: Period | null, scope: string) {
  const search = period ? new URLSearchParams({ ...period, scope }).toString() : '';
  return useQuery({
    queryKey: ['dashboard', search],
    queryFn: () => api<DashboardDto>(`/dashboard?${search}`),
    enabled: period !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useTeamDashboard(period: Period | null, enabled: boolean) {
  const search = period ? new URLSearchParams({ ...period }).toString() : '';
  return useQuery({
    queryKey: ['dashboard', 'team', search],
    queryFn: () => api<TeamRow[]>(`/dashboard/team?${search}`),
    enabled: enabled && period !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
