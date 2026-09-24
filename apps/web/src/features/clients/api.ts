import type {
  ClientBoardDto,
  ClientDetailsDto,
  ClientDraft,
  ClientPatch,
  ClientStageChange,
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
