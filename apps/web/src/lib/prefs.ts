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
  const persist = useMutation({
    mutationFn: (value: T) => api(`/me/prefs/${key}`, { method: 'PUT', body: { value } }),
  });
  // Применяем синхронно, не дожидаясь сервера: порядок карточек и колонки не должны «прыгать».
  const save = (value: T) => {
    qc.setQueryData(prefKey(key), value);
    persist.mutate(value);
  };
  return { value: query.data ?? fallback, isLoading: query.isPending, save };
}
