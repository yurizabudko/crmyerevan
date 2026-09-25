import type { UserDto } from '@crm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';

export const ME_KEY = ['auth', 'me'] as const;

/** Текущий пользователь; null — не вошёл. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<UserDto>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { login: string; password: string }) =>
      api<UserDto>('/auth/login', { method: 'POST', body }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Сначала гасим сессию: qc.clear() отвязал бы смонтированные подписки и экран входа
      // не появился бы. Данные прошлого пользователя затем удаляются из кэша.
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api<UserDto>('/auth/change-password', { method: 'POST', body }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}
