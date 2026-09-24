import { AUDIT_EVENTS, AUDIT_EVENT_LABELS } from '@crm/shared';
import {
  Code,
  Group,
  HoverCard,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { formatDateTime } from '../../lib/format';
import { useUserDirectory } from '../listings/api';
import { dayEnd, dayStart, toSearch } from '../table/useTableQuery';
import { useAuditLog } from './api';

const ENTITY_LABELS: Record<string, string> = {
  listing: 'Объявление',
  client: 'Клиент',
  user: 'Пользователь',
  deal: 'Сделка',
  partner_reward: 'Вознаграждение',
  listings: 'Объявления',
  clients: 'Клиенты',
};

/** Журнал действий (7.4): входы, карточки, права, выгрузки, настройки. */
export function AuditTab() {
  const users = useUserDirectory(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const search = toSearch({
    page,
    pageSize: 50,
    userId: userId ?? undefined,
    type: type ?? undefined,
    from: dayStart(from),
    to: dayEnd(to),
  });
  const log = useAuditLog(search);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const pages = log.data ? Math.max(1, Math.ceil(log.data.total / log.data.pageSize)) : 1;

  return (
    <Stack>
      <Group gap="xs" align="flex-end" wrap="wrap">
        <Select
          label="Пользователь"
          w={200}
          clearable
          searchable
          data={(users.data ?? []).map((u) => ({ value: String(u.id), label: u.displayName }))}
          value={userId}
          onChange={reset(setUserId)}
        />
        <Select
          label="Событие"
          w={220}
          clearable
          data={AUDIT_EVENTS.map((e) => ({ value: e, label: AUDIT_EVENT_LABELS[e] ?? e }))}
          value={type}
          onChange={reset(setType)}
        />
        <TextInput
          type="date"
          label="С"
          value={from}
          onChange={(e) => reset(setFrom)(e.currentTarget.value)}
        />
        <TextInput
          type="date"
          label="По"
          value={to}
          onChange={(e) => reset(setTo)(e.currentTarget.value)}
        />
      </Group>

      {log.isPending && <Loader />}
      {log.data && (
        <>
          <Table.ScrollContainer minWidth={720}>
            <Table striped highlightOnHover verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Время</Table.Th>
                  <Table.Th>Событие</Table.Th>
                  <Table.Th>Пользователь</Table.Th>
                  <Table.Th>Объект</Table.Th>
                  <Table.Th>IP</Table.Th>
                  <Table.Th>Подробности</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {log.data.rows.map((e) => (
                  <Table.Tr key={e.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.at)}</Table.Td>
                    <Table.Td>{AUDIT_EVENT_LABELS[e.type] ?? e.type}</Table.Td>
                    <Table.Td>{e.userName ?? 'система'}</Table.Td>
                    <Table.Td>
                      {e.entityType
                        ? `${ENTITY_LABELS[e.entityType] ?? e.entityType}${e.entityId ? ` #${e.entityId}` : ''}`
                        : '—'}
                    </Table.Td>
                    <Table.Td>{e.ip ?? '—'}</Table.Td>
                    <Table.Td>
                      {e.payload ? (
                        <HoverCard width={360} shadow="md" withinPortal>
                          <HoverCard.Target>
                            <Text size="sm" c="indigo" style={{ cursor: 'help' }}>
                              показать
                            </Text>
                          </HoverCard.Target>
                          <HoverCard.Dropdown>
                            <Code block>{JSON.stringify(e.payload, null, 2)}</Code>
                          </HoverCard.Dropdown>
                        </HoverCard>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Событий: {log.data.total}
            </Text>
            {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
          </Group>
        </>
      )}
    </Stack>
  );
}
