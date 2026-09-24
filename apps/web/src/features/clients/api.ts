import type {
  ClientBoardDto,
  ClientDetailsDto,
  ClientDraft,
  ClientPatch,
  ClientStageChange,
  LinkUpdate,
  MatchDto,
  NewComment,
} from '@crm/shared';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';

export const clientKeys = {
  board: ['clients', 'board'] as const,
  one: (id: number) => ['clients', id] as const,
};

export function useClientBoard() {
  return useQuery({ queryKey: clientKeys.board, queryFn: () => api<ClientBoardDto>('/clients') });
}

export function useClient(id: number | null) {
  return useQuery({
    queryKey: clientKeys.one(id ?? 0),
    queryFn: () => api<ClientDetailsDto>(`/clients/${id}`),
    enabled: id !== null,
  });
}

function useClientMutation<TVars>(fn: (vars: TVars) => Promise<ClientDetailsDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (client) => {
      qc.setQueryData(clientKeys.one(client.id), client);
      void qc.invalidateQueries({ queryKey: clientKeys.board });
      // Сделка закрывает объект, подборка меняет его карточку — объявления тоже устаревают.
      void qc.invalidateQueries({ queryKey: ['listings'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        notifications.show({ color: 'orange', message: error.message });
        void qc.invalidateQueries({ queryKey: ['clients'] });
      }
    },
  });
}

export const useCreateClient = () =>
  useClientMutation((draft: ClientDraft) =>
    api<ClientDetailsDto>('/clients', { method: 'POST', body: draft }),
  );

export const useUpdateClient = () =>
  useClientMutation(({ id, patch }: { id: number; patch: ClientPatch }) =>
    api<ClientDetailsDto>(`/clients/${id}`, { method: 'PATCH', body: patch }),
  );

export const useChangeClientStage = () =>
  useClientMutation(({ id, change }: { id: number; change: ClientStageChange }) =>
    api<ClientDetailsDto>(`/clients/${id}/stage`, { method: 'POST', body: change }),
  );

export const useAddClientComment = () =>
  useClientMutation(({ id, comment }: { id: number; comment: NewComment }) =>
    api<ClientDetailsDto>(`/clients/${id}/comments`, { method: 'POST', body: comment }),
  );

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/clients/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.board }),
  });
}

export function useClientMatches(id: number, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['clients', id, 'matches', q],
    queryFn: () =>
      api<MatchDto[]>(`/clients/${id}/matches${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    enabled,
  });
}

/** Добавление объекта в подборку; обновляет и карточку объекта, если она открыта. */
export function useAddLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, listingId }: { clientId: number; listingId: number }) =>
      api<ClientDetailsDto>(`/clients/${clientId}/links`, { method: 'POST', body: { listingId } }),
    onSuccess: (client, { listingId }) => {
      qc.setQueryData(clientKeys.one(client.id), client);
      void qc.invalidateQueries({ queryKey: ['clients', client.id, 'matches'] });
      void qc.invalidateQueries({ queryKey: ['listings', listingId] });
      void qc.invalidateQueries({ queryKey: clientKeys.board });
    },
  });
}

export const useUpdateLink = () =>
  useClientMutation(
    ({ clientId, linkId, update }: { clientId: number; linkId: number; update: LinkUpdate }) =>
      api<ClientDetailsDto>(`/clients/${clientId}/links/${linkId}`, {
        method: 'PATCH',
        body: update,
      }),
  );

export const useRemoveLink = () =>
  useClientMutation(({ clientId, linkId }: { clientId: number; linkId: number }) =>
    api<ClientDetailsDto>(`/clients/${clientId}/links/${linkId}`, { method: 'DELETE' }),
  );

export function useListingMatches(listingId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['listings', listingId, 'matches'],
    queryFn: () => api<MatchDto[]>(`/listings/${listingId}/matches`),
    enabled,
  });
}
