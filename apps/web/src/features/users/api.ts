import type { CreateUserRequest, SetPermissionsRequest, UserDto } from '@crm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

const USERS_KEY = ['users'] as const;

export function useUsers() {
  return useQuery({ queryKey: USERS_KEY, queryFn: () => api<UserDto[]>('/users') });
}

function useUserMutation<TVars>(fn: (vars: TVars) => Promise<UserDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export const useCreateUser = () =>
  useUserMutation((body: CreateUserRequest) => api<UserDto>('/users', { method: 'POST', body }));

export const useSetBlocked = () =>
  useUserMutation(({ id, blocked }: { id: number; blocked: boolean }) =>
    api<UserDto>(`/users/${id}/${blocked ? 'block' : 'unblock'}`, { method: 'POST' }),
  );

export const useResetPassword = () =>
  useUserMutation(({ id, temporaryPassword }: { id: number; temporaryPassword: string }) =>
    api<UserDto>(`/users/${id}/reset-password`, { method: 'POST', body: { temporaryPassword } }),
  );

export const useSetPermissions = () =>
  useUserMutation(({ id, perms }: { id: number; perms: SetPermissionsRequest }) =>
    api<UserDto>(`/users/${id}/permissions`, { method: 'PUT', body: perms }),
  );

/** Временный пароль, проходящий политику: буквы + цифры, 10 символов. */
export function generateTemporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes, (b, i) =>
    i % 3 === 2 ? digits[b % digits.length] : letters[b % letters.length],
  );
  return chars.join('');
}
