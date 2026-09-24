import { SUBSCRIPTION_STATUS_LABELS, type PartnerDealDto, type SubscriptionDto } from '@crm/shared';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Radio,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconCreditCard } from '@tabler/icons-react';
import { useState } from 'react';
import { formatDateTime, formatPrice } from '../../lib/format';
import {
  useAutoRenew,
  useMyDeals,
  usePayNow,
  usePayments,
  useReplaceCard,
  useStartTrial,
  useSubscription,
} from './api';
import { REWARD_LABEL, SUBSCRIPTION_COLOR } from './labels';
import { TelegramLink } from './TelegramLink';

const STATUS_COLOR = SUBSCRIPTION_COLOR;

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  return Math.max(
    0,
    Math.ceil((new Date(value.replace(' ', 'T')).getTime() - Date.now()) / 86_400_000),
  );
}

/** Личный кабинет партнёра (8.4). */
export function CabinetPage() {
  const sub = useSubscription();
  const s = sub.data;
  const hasAccess = s ? ['trial', 'active', 'grace'].includes(s.status) : false;

  return (
    <Stack gap="md" maw={960}>
      <Title order={2}>Подписка</Title>
      {sub.isPending && <Loader />}
      {s && (
        <>
          <StatusCard s={s} />
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            <Paper withBorder p="md" radius="md">
              <Text fw={600} mb="xs">
                Уведомления
              </Text>
              <TelegramLink linked={s.telegramLinked} />
            </Paper>
            <Payments />
          </SimpleGrid>
          <MyDeals enabled={hasAccess || s.status === 'frozen'} />
        </>
      )}
    </Stack>
  );
}

function StatusCard({ s }: { s: SubscriptionDto }) {
  const [scenario, setScenario] = useState<'success' | 'decline'>('success');
  const trial = useStartTrial();
  const pay = usePayNow();
  const card = useReplaceCard();
  const renew = useAutoRenew();
  const days = daysUntil(
    s.status === 'trial' || s.status === 'active' ? (s.nextChargeAt ?? s.periodEnd) : null,
  );
  const price = formatPrice(s.price, s.currency);

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={600}>Статус</Text>
            <Badge color={STATUS_COLOR[s.status]} variant="light">
              {SUBSCRIPTION_STATUS_LABELS[s.status]}
            </Badge>
          </Group>
          <Text c="dimmed" size="sm">
            {price} за 30 дней
          </Text>
        </Group>

        {days !== null && (
          <Text size="xl" fw={600}>
            {s.status === 'trial'
              ? 'До конца бесплатного периода'
              : s.autoRenew
                ? 'До следующего списания'
                : 'До конца подписки'}
            : {days} дн.
          </Text>
        )}
        {s.status === 'active' && !s.autoRenew && (
          <Text size="sm" c="dimmed">
            Автопродление отключено — после {formatDateTime(s.periodEnd)} доступ закроется.
          </Text>
        )}
        {s.status === 'grace' && (
          <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Оплата не прошла">
            Доступ сохраняется до {formatDateTime(s.graceUntil)}. Следующая попытка списания —{' '}
            {formatDateTime(s.retryAt)}. Проверьте карту или оплатите сейчас.
          </Alert>
        )}
        {s.status === 'frozen' && (
          <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Подписка заморожена">
            Оплата не прошла за 7 дней. Ваши карточки возвращены в общий пул, атрибуция сохранена —
            вознаграждения по сделкам начислятся после оплаты.
          </Alert>
        )}
        {s.status === 'canceled' && (
          <Alert color="gray" title="Подписка закончилась">
            Оплатите подписку, чтобы вернуться к работе.
          </Alert>
        )}
        {s.status === 'none' && (
          <Text size="sm">
            Первые 30 дней бесплатно. Для активации привяжите карту — списание {price} произойдёт
            только после бесплатного периода, за 3 дня мы предупредим.
          </Text>
        )}

        <Group gap="xs">
          <IconCreditCard size={18} />
          <Text size="sm">{s.card ? `Карта ${s.card.mask}` : 'Карта не привязана'}</Text>
        </Group>

        {s.provider === 'mock' && (
          <Radio.Group
            label="Тестовый режим оплаты — деньги не списываются"
            value={scenario}
            onChange={(v) => setScenario(v as 'success' | 'decline')}
          >
            <Group mt={4}>
              <Radio value="success" label="Тестовая карта: оплата проходит" />
              <Radio value="decline" label="Тестовая карта: отказ банка" />
            </Group>
          </Radio.Group>
        )}

        <Group gap="xs">
          {s.status === 'none' && (
            <Button loading={trial.isPending} onClick={() => trial.mutate(scenario)}>
              Начать бесплатный период
            </Button>
          )}
          {['grace', 'frozen', 'canceled'].includes(s.status) && (
            <Button
              color={s.status === 'grace' ? 'orange' : undefined}
              loading={pay.isPending}
              onClick={() => pay.mutate(undefined)}
            >
              Оплатить {price}
            </Button>
          )}
          {s.status !== 'none' && (
            <Button
              variant="default"
              loading={card.isPending}
              onClick={() => card.mutate(scenario)}
            >
              {s.card ? 'Заменить карту' : 'Привязать карту'}
            </Button>
          )}
        </Group>

        {['trial', 'active', 'grace'].includes(s.status) && (
          <Switch
            label="Автопродление"
            description={
              s.autoRenew
                ? 'Отключить можно в любой момент — доступ останется до конца периода'
                : undefined
            }
            checked={s.autoRenew}
            disabled={renew.isPending}
            onChange={(e) => renew.mutate(e.currentTarget.checked)}
          />
        )}
      </Stack>
    </Paper>
  );
}

function Payments() {
  const payments = usePayments();
  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb="xs">
        История платежей
      </Text>
      {payments.data?.length === 0 && (
        <Text size="sm" c="dimmed">
          Платежей ещё не было
        </Text>
      )}
      <Stack gap={4}>
        {payments.data?.slice(0, 10).map((p) => (
          <Group key={p.id} justify="space-between" wrap="nowrap">
            <Text size="sm">{formatDateTime(p.at)}</Text>
            <Group gap="xs" wrap="nowrap">
              <Text size="sm">{formatPrice(p.amount, p.currency)}</Text>
              <Badge size="sm" variant="light" color={p.status === 'succeeded' ? 'green' : 'red'}>
                {p.status === 'succeeded' ? 'оплачено' : 'ошибка'}
              </Badge>
            </Group>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

function MyDeals({ enabled }: { enabled: boolean }) {
  const deals = useMyDeals(enabled);
  const list: PartnerDealDto[] = deals.data ?? [];
  const sum = (status: string[]) =>
    list.filter((d) => status.includes(d.rewardStatus)).reduce((s, d) => s + d.reward, 0);
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Мои сделки</Text>
        <Text size="sm" c="dimmed">
          начислено {formatPrice(sum(['accrued', 'paid']), null)} · выплачено{' '}
          {formatPrice(sum(['paid']), null)}
        </Text>
      </Group>
      {list.length === 0 ? (
        <Text size="sm" c="dimmed">
          Сделок с вашей атрибуцией пока нет. Вознаграждение — 10% от комиссии агентства по сделке.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Дата</Table.Th>
                <Table.Th>Объект</Table.Th>
                <Table.Th>Клиент</Table.Th>
                <Table.Th ta="right">Цена сделки</Table.Th>
                <Table.Th ta="right">Вознаграждение</Table.Th>
                <Table.Th>Статус</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((d) => (
                <Table.Tr key={`${d.dealId}-${d.basis}`}>
                  <Table.Td>{formatDateTime(d.closedAt)}</Table.Td>
                  <Table.Td>{d.listingTitle ?? '—'}</Table.Td>
                  <Table.Td>{d.clientName ?? '—'}</Table.Td>
                  <Table.Td ta="right">{formatPrice(d.finalPrice, d.currency)}</Table.Td>
                  <Table.Td ta="right">{formatPrice(d.reward, d.currency)}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={
                        d.rewardStatus === 'paid'
                          ? 'green'
                          : d.rewardStatus === 'on_hold'
                            ? 'orange'
                            : 'blue'
                      }
                    >
                      {REWARD_LABEL[d.rewardStatus]}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  );
}
