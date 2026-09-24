import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const prefKey = (key: string) => ['prefs', key] as const;

/** Личная настройка интерфейса, хранится на сервере (per-user). */
export function usePref<T>(key: string, fallback: T) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: prefKey(key),
    queryFn: async () => (await api<{ value: T | null }>(`/me/prefs/${key}`)).value,
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: (value: T) => api(`/me/prefs/${key}`, { method: 'PUT', body: { value } }),
    // Применяем сразу, не дожидаясь сервера: порядок карточек не должен «прыгать».
    onMutate: (value) => qc.setQueryData(prefKey(key), value),
  });
  return { value: query.data ?? fallback, isLoading: query.isPending, save: save.mutate };
}
