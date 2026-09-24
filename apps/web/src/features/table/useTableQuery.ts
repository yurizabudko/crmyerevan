import type { ClientDto, ListingDto, TablePage } from '@crm/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export type Entity = 'listings' | 'clients';
export type Filters = Record<string, string | number | undefined>;

/** Строка запроса без пустых значений. */
export function toSearch(params: Filters): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export function useTablePage<T extends ListingDto | ClientDto>(entity: Entity, params: Filters) {
  const search = toSearch(params);
  return useQuery({
    queryKey: ['table', entity, search],
    queryFn: () => api<TablePage<T>>(`/table/${entity}?${search}`),
    // Пока грузится следующая страница, показываем предыдущую — таблица не мигает.
    placeholderData: keepPreviousData,
  });
}

/** Начало дня по Еревану для фильтра дат: «2026-09-24» → ISO. */
export function dayStart(date: string): string | undefined {
  return date ? new Date(`${date}T00:00:00+04:00`).toISOString() : undefined;
}

/** Конец диапазона — начало следующего дня (граница не включается). */
export function dayEnd(date: string): string | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T00:00:00+04:00`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
