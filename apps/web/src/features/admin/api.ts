import type {
  AdminDictionaryItemDto,
  AuditEventDto,
  DictionaryItemCreate,
  DictionaryItemUpdate,
  DictionaryOrder,
  ParserRunDto,
  ParserSettings,
  StageCreate,
  StageOrder,
  TablePage,
} from '@crm/shared';
import { notifications } from '@mantine/notifications';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

/** После правок этапов и справочников устаревают доски, формы и таблицы. */
function useAdminMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of ['admin', 'dictionaries', 'listings', 'clients', 'table', 'dashboard']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message }),
  });
}

export const useAddStage = () =>
  useAdminMutation((body: StageCreate) => api('/admin/stages', { method: 'POST', body }));
export const useRenameStage = () =>
  useAdminMutation(({ id, name }: { id: number; name: string }) =>
    api(`/admin/stages/${id}`, { method: 'PATCH', body: { name } }),
  );
export const useReorderStages = () =>
  useAdminMutation((body: StageOrder) => api('/admin/stages/order', { method: 'PUT', body }));
export const useDeleteStage = () =>
  useAdminMutation((id: number) => api(`/admin/stages/${id}`, { method: 'DELETE' }));

export function useAdminDictionaries() {
  return useQuery({
    queryKey: ['admin', 'dictionaries'],
    queryFn: () => api<AdminDictionaryItemDto[]>('/admin/dictionaries'),
  });
}
export const useAddDictionaryItem = () =>
  useAdminMutation((body: DictionaryItemCreate) =>
    api('/admin/dictionaries', { method: 'POST', body }),
  );
export const useUpdateDictionaryItem = () =>
  useAdminMutation(({ id, ...body }: DictionaryItemUpdate & { id: number }) =>
    api(`/admin/dictionaries/${id}`, { method: 'PATCH', body }),
  );
export const useReorderDictionary = () =>
  useAdminMutation((body: DictionaryOrder) =>
    api('/admin/dictionaries/order', { method: 'PUT', body }),
  );

export function useParserSettings() {
  return useQuery({
    queryKey: ['admin', 'parser', 'settings'],
    queryFn: () => api<ParserSettings>('/admin/parser/settings'),
  });
}
export function useParserRuns() {
  return useQuery({
    queryKey: ['admin', 'parser', 'runs'],
    queryFn: () => api<ParserRunDto[]>('/admin/parser/runs'),
  });
}
export const useSaveParserSettings = () =>
  useAdminMutation((body: ParserSettings) =>
    api<ParserSettings>('/admin/parser/settings', { method: 'PUT', body }),
  );

export function useAuditLog(search: string) {
  return useQuery({
    queryKey: ['admin', 'audit', search],
    queryFn: () => api<TablePage<AuditEventDto>>(`/admin/audit?${search}`),
    placeholderData: keepPreviousData,
  });
}
