import { can, type UserDto } from '@crm/shared';
import {
  Alert,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMe } from '../../auth/useAuth';
import { formatPrice } from '../../lib/format';
import { useUserDirectory } from '../listings/api';
import { useDashboard, useTeamDashboard } from './api';
import classes from './dashboard.module.css';
import { periodOf, yerevanToday, type PeriodPreset } from './period';
import { Conversions, StageBars, StatTile, formatMoney } from './widgets';

const number = new Intl.NumberFormat('ru-RU');

/** Дашборд (раздел 6). */
export function DashboardPage() {
  const { data: me } = useMe();
  if (!me) return null;
  return <Dashboard me={me} />;
}

function Dashboard({ me }: { me: UserDto }) {
  const isOwner = can.viewTeamDashboard(me);
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const today = yerevanToday();
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const [scope, setScope] = useState('me');
  const period = periodOf(preset, custom);
  const dashboard = useDashboard(period, scope);
  const team = useTeamDashboard(period, isOwner && scope === 'team');
  const directory = useUserDirectory(isOwner);
  const navigate = useNavigate();
  const d = dashboard.data;

  return (
    <Stack gap="md" className={classes.root}>
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Дашборд</Title>
        <Group gap="xs" align="flex-end" wrap="wrap">
          {isOwner && (
            <Select
              aria-label="Чьи данные"
              w={200}
              value={scope}
              onChange={(v) => setScope(v ?? 'me')}
              allowDeselect={false}
              data={[
                { value: 'me', label: 'Мои данные' },
                { value: 'team', label: 'Вся команда' },
                ...(directory.data ?? [])
                  .filter((u) => u.id !== me.id && u.status === 'active')
                  .map((u) => ({ value: String(u.id), label: u.displayName })),
              ]}
            />
          )}
          <SegmentedControl
            value={preset}
            onChange={(v) => setPreset(v as PeriodPreset)}
            data={[
              { value: 'today', label: 'Сегодня' },
              { value: 'week', label: 'Неделя' },
              { value: 'month', label: 'Месяц' },
              { value: 'custom', label: 'Период' },
            ]}
          />
        </Group>
      </Group>
      {preset === 'custom' && (
        <Group gap="xs">
          <TextInput
            type="date"
            label="С"
            value={custom.from}
            onChange={(e) => setCustom({ ...custom, from: e.currentTarget.value })}
          />
          <TextInput
            type="date"
            label="По"
            value={custom.to}
            onChange={(e) => setCustom({ ...custom, to: e.currentTarget.value })}
            error={period === null ? 'Конец раньше начала' : undefined}
          />
        </Group>
      )}

      {dashboard.error && <Alert color="red">{dashboard.error.message}</Alert>}
      {!d && dashboard.isFetching && <Loader />}
      {d && (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
            <StatTile
              label="Новые объявления"
              value={number.format(d.listings.added.total)}
              hint={`вручную ${d.listings.added.manual} · автоимпорт ${d.listings.added.parser}`}
            />
            <StatTile label="Закрыто сделок" value={number.format(d.deals.closed)} />
            {d.deals.reward ? (
              <StatTile
                label="Моё вознаграждение"
                value={formatPrice(d.deals.reward.accrued, null)}
                hint={`выплачено ${formatPrice(d.deals.reward.paid, null)}`}
              />
            ) : (
              <StatTile label="Комиссия (факт)" value={formatMoney(d.deals.commission)} />
            )}
            <StatTile
              label="Звонки"
              value={number.format(d.activity.calls)}
              hint={`комментариев ${d.activity.comments} · изменений ${d.activity.changes}`}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            <StageBars title="Объявления по этапам" stages={d.listings.byStage} />
            <StageBars title="Клиенты по этапам" stages={d.clients.byStage} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            <Conversions items={d.conversions} />
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="xs">
                <Text fw={600}>Просроченные клиенты</Text>
                <Text size="sm" c="dimmed">
                  без активности больше 2 дней
                </Text>
              </Group>
              {d.overdue.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Нет просроченных карточек
                </Text>
              ) : (
                <Stack gap={2}>
                  {d.overdue.map((o) => (
                    <UnstyledButton
                      key={o.id}
                      onClick={() => navigate('/clients')}
                      className={classes.barRow}
                      style={{ gridTemplateColumns: '1fr auto' }}
                    >
                      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                        <span className={classes.overdueDot} aria-hidden />
                        <Stack gap={0} style={{ minWidth: 0 }}>
                          <Text size="sm" truncate>
                            {o.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {o.stageName}
                            {scope !== 'me' && o.responsibleName ? ` · ${o.responsibleName}` : ''}
                          </Text>
                        </Stack>
                      </Group>
                      <Text size="sm" c="dimmed">
                        {idle(o.idleHours)}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              )}
            </Paper>
          </SimpleGrid>

          {isOwner && scope === 'team' && team.data && (
            <Paper withBorder p="md" radius="md">
              <Text fw={600} mb="xs">
                По сотрудникам
              </Text>
              <Table.ScrollContainer minWidth={720}>
                <Table striped highlightOnHover style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Сотрудник</Table.Th>
                      <Table.Th ta="right">Объявления</Table.Th>
                      <Table.Th ta="right">Сделки</Table.Th>
                      <Table.Th ta="right">Комиссия</Table.Th>
                      <Table.Th ta="right">Звонки</Table.Th>
                      <Table.Th ta="right">Комментарии</Table.Th>
                      <Table.Th ta="right">Изменения</Table.Th>
                      <Table.Th ta="right">Просрочено</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {team.data.map((r) => (
                      <Table.Tr
                        key={r.userId}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setScope(r.userId === me.id ? 'me' : String(r.userId))}
                      >
                        <Table.Td>{r.name}</Table.Td>
                        <Table.Td ta="right">{r.listingsAdded}</Table.Td>
                        <Table.Td ta="right">{r.dealsClosed}</Table.Td>
                        <Table.Td ta="right">{formatMoney(r.commission)}</Table.Td>
                        <Table.Td ta="right">{r.calls}</Table.Td>
                        <Table.Td ta="right">{r.comments}</Table.Td>
                        <Table.Td ta="right">{r.changes}</Table.Td>
                        <Table.Td ta="right">{r.overdue}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}

function idle(hours: number): string {
  const days = Math.floor(hours / 24);
  return days >= 1 ? `${days} дн.` : `${hours} ч`;
}
