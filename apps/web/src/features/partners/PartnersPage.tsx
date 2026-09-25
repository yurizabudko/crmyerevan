import {
  SUBSCRIPTION_STATUS_LABELS,
  type PartnersQuery,
  type RewardDto,
  type RewardsQuery,
} from '@crm/shared';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { REWARD_COLOR, REWARD_LABEL, SUBSCRIPTION_COLOR } from '../billing/labels';
import { periodOf, yerevanToday, type PeriodPreset } from '../dashboard/period';
import { formatDateTime, formatPrice } from '../../lib/format';
import { toSearch, useConfirmPayout, usePartnersOverview, useRewards } from './api';

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 0 });
const rub = (v: number) => `${number.format(v)} ₽`;

type Preset = PeriodPreset | 'all';

/** Раздел «Партнёры» для Владельца (8.5): статистика, списания, проблемы, выплаты. */
export function PartnersPage() {
  const [preset, setPreset] = useState<Preset>('all');
  const today = yerevanToday();
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const [subscription, setSubscription] = useState<string | null>(null);
  const period = preset === 'all' ? {} : periodOf(preset, custom);
  const range = period ?? {};

  const query: PartnersQuery = {
    ...range,
    subscription: (subscription ?? undefined) as PartnersQuery['subscription'],
  };
  const overview = usePartnersOverview(query);
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;
  const o = overview.data;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Партнёры</Title>
        <SegmentedControl
          value={preset}
          onChange={(v) => setPreset(v as Preset)}
          data={[
            { value: 'all', label: 'Всё время' },
            { value: 'week', label: 'Неделя' },
            { value: 'month', label: 'Месяц' },
            { value: 'custom', label: 'Период' },
          ]}
        />
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

      {overview.error && <Alert color="red">{overview.error.message}</Alert>}
      {!o && overview.isFetching && <Loader />}
      {o && (
        <>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            <Paper withBorder p="md" radius="md">
              <Text fw={600} mb="xs">
                Списания в ближайшие 3 дня
              </Text>
              {o.upcoming.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Нет плановых списаний
                </Text>
              ) : (
                <Stack gap={4}>
                  {o.upcoming.map((u) => (
                    <Group key={u.partnerId} justify="space-between" wrap="nowrap">
                      <Text size="sm" truncate>
                        {u.name}
                      </Text>
                      <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(u.at)} · {rub(u.amount)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text fw={600} mb="xs">
                Проблемные платежи
              </Text>
              {o.problems.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Проблем нет
                </Text>
              ) : (
                <Stack gap={6}>
                  {o.problems.map((p) => (
                    <div key={p.partnerId}>
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="sm" truncate>
                          {p.name}
                        </Text>
                        <Badge color={SUBSCRIPTION_COLOR[p.status]} variant="light">
                          {SUBSCRIPTION_STATUS_LABELS[p.status]}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {p.error ?? 'Ошибка списания'} · {formatDateTime(p.at)}
                        {p.graceUntil && ` · заморозка ${formatDateTime(p.graceUntil)}`}
                      </Text>
                    </div>
                  ))}
                </Stack>
              )}
            </Paper>
          </SimpleGrid>

          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Статистика партнёров</Text>
              <Select
                aria-label="Статус подписки"
                placeholder="Все подписки"
                clearable
                w={200}
                value={subscription}
                onChange={setSubscription}
                data={Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Group>
            {isMobile ? (
              <Stack gap="xs">
                {o.partners.map((p) => (
                  <Paper key={p.partnerId} withBorder p="sm" radius="md">
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Text fw={500} truncate>
                        {p.name}
                      </Text>
                      <Badge color={SUBSCRIPTION_COLOR[p.subscription]} variant="light">
                        {SUBSCRIPTION_STATUS_LABELS[p.subscription]}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Карточек {p.cardsCreated} · сделок {p.dealsClosed} · конверсия{' '}
                      {p.conversion === null ? '—' : percent.format(p.conversion)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Начислено {number.format(p.accrued)} · выплачено {number.format(p.paid)}
                      {p.onHold > 0 && ` · заморожено ${number.format(p.onHold)}`} · LTV{' '}
                      {rub(p.ltv)}
                    </Text>
                    {p.nextChargeAt && (
                      <Text size="xs" c="dimmed">
                        Списание {formatDateTime(p.nextChargeAt)}
                      </Text>
                    )}
                  </Paper>
                ))}
                {o.partners.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Партнёров нет
                  </Text>
                )}
              </Stack>
            ) : (
              <Table.ScrollContainer minWidth={820}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Партнёр</Table.Th>
                      <Table.Th>Подписка</Table.Th>
                      <Table.Th>След. списание</Table.Th>
                      <Table.Th ta="right">Карточек</Table.Th>
                      <Table.Th ta="right">Сделок</Table.Th>
                      <Table.Th ta="right">Конверсия</Table.Th>
                      <Table.Th ta="right">Начислено</Table.Th>
                      <Table.Th ta="right">Выплачено</Table.Th>
                      <Table.Th ta="right">LTV</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {o.partners.map((p) => (
                      <Table.Tr key={p.partnerId}>
                        <Table.Td>
                          {p.name}
                          {p.userStatus !== 'active' && (
                            <Text span size="xs" c="dimmed">
                              {' '}
                              (заблокирован)
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge color={SUBSCRIPTION_COLOR[p.subscription]} variant="light">
                            {SUBSCRIPTION_STATUS_LABELS[p.subscription]}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{formatDateTime(p.nextChargeAt)}</Table.Td>
                        <Table.Td ta="right">{number.format(p.cardsCreated)}</Table.Td>
                        <Table.Td ta="right">{number.format(p.dealsClosed)}</Table.Td>
                        <Table.Td ta="right">
                          {p.conversion === null ? '—' : percent.format(p.conversion)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {number.format(p.accrued)}
                          {p.onHold > 0 && (
                            <Text size="xs" c="orange">
                              + {number.format(p.onHold)} заморожено
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right">{number.format(p.paid)}</Table.Td>
                        <Table.Td ta="right">{rub(p.ltv)}</Table.Td>
                      </Table.Tr>
                    ))}
                    {o.partners.length === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={9}>
                          <Text size="sm" c="dimmed" ta="center">
                            Партнёров нет
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
            <Text size="xs" c="dimmed" mt="xs">
              Суммы вознаграждений — в валюте сделок; LTV — оплаты подписки.
            </Text>
          </Paper>

          <Rewards
            range={range}
            partners={o.partners.map((p) => ({ value: String(p.partnerId), label: p.name }))}
          />
        </>
      )}
    </Stack>
  );
}

function Rewards({
  range,
  partners,
}: {
  range: { from?: string; to?: string };
  partners: { value: string; label: string }[];
}) {
  const [status, setStatus] = useState<string | null>('accrued');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [paying, setPaying] = useState<RewardDto | null>(null);
  const query: RewardsQuery = {
    ...range,
    status: (status ?? undefined) as RewardsQuery['status'],
    partnerId: partnerId ? Number(partnerId) : undefined,
  };
  const rewards = useRewards(query);
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="xs" gap="xs">
        <Text fw={600}>Вознаграждения и выплаты</Text>
        <Group gap="xs">
          <Select
            aria-label="Статус выплаты"
            placeholder="Все статусы"
            clearable
            w={170}
            value={status}
            onChange={setStatus}
            data={Object.entries(REWARD_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Select
            aria-label="Партнёр"
            placeholder="Все партнёры"
            clearable
            searchable
            w={200}
            value={partnerId}
            onChange={setPartnerId}
            data={partners}
          />
          <Button
            component="a"
            href={`/api/partners/rewards.csv${toSearch(query)}`}
            variant="default"
            leftSection={<IconDownload size={16} />}
          >
            Реестр CSV
          </Button>
        </Group>
      </Group>
      {rewards.error && <Alert color="red">{rewards.error.message}</Alert>}
      {isMobile ? (
        <Stack gap="xs">
          {(rewards.data ?? []).map((r) => (
            <Paper key={r.id} withBorder p="sm" radius="md">
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text fw={500} truncate>
                  {r.partnerName}
                </Text>
                <Text fw={600} style={{ whiteSpace: 'nowrap' }}>
                  {formatPrice(r.amount, r.currency)}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                Сделка №{r.dealId} · {formatDateTime(r.closedAt)}
                {r.listingTitle && ` · ${r.listingTitle}`}
              </Text>
              <Group justify="space-between" mt={6}>
                <Badge color={REWARD_COLOR[r.status]} variant="light">
                  {REWARD_LABEL[r.status]}
                </Badge>
                {r.status === 'accrued' ? (
                  <Button size="xs" variant="light" onClick={() => setPaying(r)}>
                    Выплачено
                  </Button>
                ) : (
                  r.status === 'paid' && (
                    <Text size="xs" c="dimmed">
                      {formatDateTime(r.paidAt)} · {r.paidMethod}
                    </Text>
                  )
                )}
              </Group>
            </Paper>
          ))}
          {rewards.data?.length === 0 && (
            <Text size="sm" c="dimmed">
              Нет записей
            </Text>
          )}
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Партнёр</Table.Th>
                <Table.Th>Сделка</Table.Th>
                <Table.Th>Основание</Table.Th>
                <Table.Th ta="right">Сумма</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(rewards.data ?? []).map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{r.partnerName}</Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      №{r.dealId} · {formatDateTime(r.closedAt)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {[r.listingTitle, r.clientName].filter(Boolean).join(' → ')}
                    </Text>
                  </Table.Td>
                  <Table.Td>{r.basis ?? '—'}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {formatPrice(r.amount, r.currency)}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={REWARD_COLOR[r.status]} variant="light">
                      {REWARD_LABEL[r.status]}
                    </Badge>
                    {r.status === 'paid' && (
                      <Text size="xs" c="dimmed">
                        {formatDateTime(r.paidAt)} · {r.paidMethod}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {r.status === 'accrued' && (
                      <Button size="xs" variant="light" onClick={() => setPaying(r)}>
                        Выплачено
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
              {rewards.data?.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text size="sm" c="dimmed" ta="center">
                      Нет записей
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {rewards.isPending && <Loader size="sm" />}
      <Text size="xs" c="dimmed" mt="xs">
        «Ждёт разморозки» — партнёр заморожен; выплатить можно после оплаты подписки.{' '}
        <Anchor size="xs" onClick={() => setStatus('on_hold')}>
          Показать
        </Anchor>
      </Text>
      <PayoutModal reward={paying} onClose={() => setPaying(null)} />
    </Paper>
  );
}

function PayoutModal({ reward, onClose }: { reward: RewardDto | null; onClose: () => void }) {
  const [method, setMethod] = useState('');
  const [paidAt, setPaidAt] = useState(yerevanToday());
  const confirm = useConfirmPayout();

  return (
    <Modal opened={reward !== null} onClose={onClose} title="Подтвердить выплату">
      {reward && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate(
              { id: reward.id, method, paidAt },
              {
                onSuccess: () => {
                  setMethod('');
                  onClose();
                },
              },
            );
          }}
        >
          <Stack>
            <Text size="sm">
              {reward.partnerName}: {formatPrice(reward.amount, reward.currency)} по сделке №
              {reward.dealId}
            </Text>
            <TextInput
              label="Способ выплаты"
              placeholder="Перевод на карту, наличные…"
              required
              minLength={2}
              value={method}
              onChange={(e) => setMethod(e.currentTarget.value)}
              data-autofocus
            />
            <TextInput
              type="date"
              label="Дата выплаты"
              required
              max={yerevanToday()}
              value={paidAt}
              onChange={(e) => setPaidAt(e.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" loading={confirm.isPending}>
                Подтвердить
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
