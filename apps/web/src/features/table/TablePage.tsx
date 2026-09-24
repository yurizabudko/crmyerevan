import { can, type ClientDto, type ListingDto, type StageDto, type UserDto } from '@crm/shared';
import {
  Alert,
  Button,
  Collapse,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Pagination,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconDownload, IconFilter, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMe } from '../../auth/useAuth';
import { usePref } from '../../lib/prefs';
import { ClientDrawer } from '../clients/ClientDrawer';
import { ClientStageModal, type PendingClientMove } from '../clients/ClientStageModal';
import { useClientBoard, useUpdateClient } from '../clients/api';
import { ListingDrawer } from '../listings/ListingDrawer';
import { StageChangeModal, type PendingMove } from '../listings/StageChangeModal';
import {
  useDictionaries,
  useListingBoard,
  useUpdateListing,
  useUserDirectory,
} from '../listings/api';
import { ColumnSettings } from './ColumnSettings';
import {
  DEFAULT_HIDDEN,
  arrangeColumns,
  clientColumns,
  listingColumns,
  type ColumnDef,
  type ColumnPrefs,
  type TableContext,
} from './columns';
import { DataTable } from './DataTable';
import {
  dayEnd,
  dayStart,
  toSearch,
  useTablePage,
  type Entity,
  type Filters,
} from './useTableQuery';

interface FilterState {
  q: string;
  stageIds: string[];
  responsibleId: string | null;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
  source: string | null;
  min: number | string;
  max: number | string;
}

const EMPTY_FILTERS: FilterState = {
  q: '',
  stageIds: [],
  responsibleId: null,
  createdFrom: '',
  createdTo: '',
  updatedFrom: '',
  updatedTo: '',
  source: null,
  min: '',
  max: '',
};

/** Раздел «Таблица» (раздел 5): объявления и клиенты. */
export function TablePage() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const entity: Entity = params.get('tab') === 'clients' ? 'clients' : 'listings';
  if (!me) return null;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Таблица</Title>
        <SegmentedControl
          value={entity}
          onChange={(v) => setParams({ tab: v })}
          data={[
            { value: 'listings', label: 'Объявления' },
            { value: 'clients', label: 'Клиенты' },
          ]}
        />
      </Group>
      {/* key — чтобы фильтры и страница не переносились между вкладками. */}
      <EntityTable key={entity} entity={entity} me={me} />
    </Stack>
  );
}

function EntityTable({ entity, me }: { entity: Entity; me: UserDto }) {
  const qc = useQueryClient();
  const dicts = useDictionaries();
  const directory = useUserDirectory(me.role !== 'partner');
  const listingBoard = useListingBoard();
  const clientBoard = useClientBoard();
  const stages: StageDto[] =
    (entity === 'listings' ? listingBoard.data?.stages : clientBoard.data?.stages) ?? [];
  const updateListing = useUpdateListing();
  const updateClient = useUpdateClient();

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [debouncedQ] = useDebouncedValue(filters.q.trim(), 350);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<string | undefined>();
  const [showFilters, { toggle: toggleFilters }] = useDisclosure(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [listingMove, setListingMove] = useState<PendingMove | null>(null);
  const [clientMove, setClientMove] = useState<PendingClientMove | null>(null);
  const [editRequested, setEditRequested] = useState(false);

  const prefs = usePref<ColumnPrefs>(`table.${entity}.columns`, {
    order: [],
    hidden: DEFAULT_HIDDEN[entity],
  });

  const ctx: TableContext = { me, stages, dicts: dicts.data, users: directory.data ?? [] };
  const allColumns = useMemo(
    () =>
      (entity === 'listings' ? listingColumns(ctx) : clientColumns(ctx)) as ColumnDef<
        ListingDto | ClientDto
      >[],
    [entity, me, stages, dicts.data, directory.data],
  );
  const arranged = arrangeColumns(allColumns, prefs.value);
  const visible = arranged.filter((c) => !prefs.value.hidden.includes(c.key));

  const query: Filters = {
    page,
    pageSize: 50,
    sort,
    q: debouncedQ,
    stageIds: filters.stageIds.join(','),
    responsibleId: filters.responsibleId ?? undefined,
    createdFrom: dayStart(filters.createdFrom),
    createdTo: dayEnd(filters.createdTo),
    updatedFrom: dayStart(filters.updatedFrom),
    updatedTo: dayEnd(filters.updatedTo),
    ...(entity === 'listings'
      ? { source: filters.source ?? undefined, priceMin: filters.min, priceMax: filters.max }
      : { sourceId: filters.source ?? undefined, budgetMin: filters.min, budgetMax: filters.max }),
  };
  const table = useTablePage<ListingDto | ClientDto>(entity, query);

  const set = (patch: Partial<FilterState>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const onEdit = (row: ListingDto | ClientDto, field: string, value: string | number | null) => {
    const patch = { version: row.version, [field]: value };
    const done = {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['table', entity] }),
      onError: (e: Error) => notifications.show({ color: 'red', message: e.message }),
    };
    if (entity === 'listings') updateListing.mutate({ id: row.id, patch }, done);
    else updateClient.mutate({ id: row.id, patch }, done);
  };

  const exportUrl = `/api/table/${entity}.csv?${toSearch({
    ...query,
    page: undefined,
    pageSize: undefined,
    columns: visible.map((c) => c.key).join(','),
  })}`;

  const stageOptions = stages.map((s) => ({ value: String(s.id), label: s.name }));
  const sourceOptions =
    entity === 'listings'
      ? [
          { value: 'manual', label: 'Вручную' },
          { value: 'parser', label: 'Автоимпорт' },
        ]
      : (dicts.data?.source ?? []).map((d) => ({ value: String(d.id), label: d.name }));
  const activeFilters = Object.entries(filters).filter(
    ([k, v]) => k !== 'q' && (Array.isArray(v) ? v.length > 0 : v !== '' && v !== null),
  ).length;

  const data = table.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        <TextInput
          placeholder={
            entity === 'listings' ? 'Название, телефон, описание…' : 'Имя, телефон, заметки…'
          }
          leftSection={<IconSearch size={16} />}
          value={filters.q}
          onChange={(e) => set({ q: e.currentTarget.value })}
          style={{ flex: '1 1 220px' }}
        />
        <Button
          variant={activeFilters ? 'light' : 'default'}
          leftSection={<IconFilter size={16} />}
          onClick={toggleFilters}
        >
          Фильтры{activeFilters ? ` · ${activeFilters}` : ''}
        </Button>
        <ColumnSettings
          columns={arranged}
          prefs={prefs.value}
          onChange={(next) => prefs.save(next)}
        />
        {can.exportCsv(me) && (
          <Button
            component="a"
            href={exportUrl}
            download
            variant="default"
            leftSection={<IconDownload size={16} />}
          >
            CSV
          </Button>
        )}
      </Group>

      <Collapse expanded={showFilters}>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="xs">
          <MultiSelect
            label="Этап"
            data={stageOptions}
            value={filters.stageIds}
            onChange={(v) => set({ stageIds: v })}
            clearable
          />
          {me.role !== 'partner' && (
            <Select
              label="Ответственный"
              data={(directory.data ?? []).map((u) => ({
                value: String(u.id),
                label: u.displayName,
              }))}
              value={filters.responsibleId}
              onChange={(v) => set({ responsibleId: v })}
              clearable
              searchable
            />
          )}
          <Select
            label="Источник"
            data={sourceOptions}
            value={filters.source}
            onChange={(v) => set({ source: v })}
            clearable
          />
          <Group grow gap="xs">
            <NumberInput
              label={entity === 'listings' ? 'Цена от' : 'Бюджет от'}
              min={0}
              thousandSeparator=" "
              value={filters.min}
              onChange={(v) => set({ min: v })}
            />
            <NumberInput
              label="до"
              min={0}
              thousandSeparator=" "
              value={filters.max}
              onChange={(v) => set({ max: v })}
            />
          </Group>
          <Group grow gap="xs">
            <TextInput
              label="Создано с"
              type="date"
              value={filters.createdFrom}
              onChange={(e) => set({ createdFrom: e.currentTarget.value })}
            />
            <TextInput
              label="по"
              type="date"
              value={filters.createdTo}
              onChange={(e) => set({ createdTo: e.currentTarget.value })}
            />
          </Group>
          <Group grow gap="xs">
            <TextInput
              label="Изменено с"
              type="date"
              value={filters.updatedFrom}
              onChange={(e) => set({ updatedFrom: e.currentTarget.value })}
            />
            <TextInput
              label="по"
              type="date"
              value={filters.updatedTo}
              onChange={(e) => set({ updatedTo: e.currentTarget.value })}
            />
          </Group>
          <Group align="flex-end">
            <Button variant="subtle" color="gray" onClick={() => set(EMPTY_FILTERS)}>
              Сбросить фильтры
            </Button>
          </Group>
        </SimpleGrid>
      </Collapse>

      {table.error && <Alert color="red">{table.error.message}</Alert>}
      {!data && table.isPending && <Loader />}
      {data && (
        <>
          <DataTable
            columns={visible}
            rows={data.rows}
            sort={sort}
            onSort={(s) => {
              setSort(s);
              setPage(1);
            }}
            onOpen={(row) => setOpenId(row.id)}
            onEdit={onEdit}
            rowHighlight={(row) => 'isOverdue' in row && row.isOverdue}
          />
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Найдено: {data.total}
            </Text>
            {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
          </Group>
        </>
      )}

      {entity === 'listings' ? (
        <>
          <ListingDrawer
            listingId={openId}
            onClose={() => {
              setOpenId(null);
              void qc.invalidateQueries({ queryKey: ['table', entity] });
            }}
            onMove={setListingMove}
          />
          <StageChangeModal move={listingMove} me={me} onClose={() => setListingMove(null)} />
        </>
      ) : (
        <>
          <ClientDrawer
            clientId={openId}
            editRequested={editRequested}
            onEditHandled={() => setEditRequested(false)}
            onClose={() => {
              setOpenId(null);
              void qc.invalidateQueries({ queryKey: ['table', entity] });
            }}
            onMove={setClientMove}
          />
          <ClientStageModal
            move={clientMove}
            me={me}
            onClose={() => setClientMove(null)}
            onEdit={(id) => {
              setOpenId(id);
              setEditRequested(true);
            }}
          />
        </>
      )}
    </Stack>
  );
}
