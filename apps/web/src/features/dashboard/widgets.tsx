import type { Conversion, MoneyByCurrency, StageCount } from '@crm/shared';
import { Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';
import { formatPrice } from '../../lib/format';
import classes from './dashboard.module.css';

const number = new Intl.NumberFormat('ru-RU');

/** Числовая плитка: подпись, значение, пояснение (контракт stat tile). */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Paper withBorder p="md" radius="md" className={classes.tile}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text className={classes.value}>{value}</Text>
      {hint && (
        <Text size="xs" c="dimmed" mt={4}>
          {hint}
        </Text>
      )}
    </Paper>
  );
}

export function formatMoney(list: MoneyByCurrency[] | null): string {
  if (!list || list.length === 0) return '0';
  return list.map((m) => formatPrice(m.amount, m.currency)).join(' + ');
}

/**
 * Распределение по этапам: горизонтальные полосы одного цвета (величина, не категории),
 * значение на конце полосы, подсказка при наведении.
 */
export function StageBars({ title, stages }: { title: string; stages: StageCount[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="xs">
        <Text fw={600}>{title}</Text>
        <Text size="sm" c="dimmed">
          всего {number.format(total)}
        </Text>
      </Group>
      <Stack gap={0} role="list">
        {stages.map((s) => (
          <Tooltip
            key={s.stageId}
            label={`${s.name}: ${number.format(s.count)}${total ? ` (${Math.round((s.count / total) * 100)}%)` : ''}`}
            position="top-start"
            openDelay={100}
          >
            <div className={classes.barRow} role="listitem" aria-label={`${s.name}: ${s.count}`}>
              <Text size="sm" truncate>
                {s.name}
              </Text>
              <div className={classes.barTrack}>
                <div
                  className={classes.bar}
                  style={{ width: `calc(${(s.count / max) * 100}% - 32px)` }}
                />
                <span className={classes.barValue}>{number.format(s.count)}</span>
              </div>
            </div>
          </Tooltip>
        ))}
      </Stack>
    </Paper>
  );
}

/** Конверсии (виджет 3): процент и «n из N», шкала на дорожке того же цвета. */
export function Conversions({ items }: { items: Conversion[] }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb="sm">
        Конверсии
      </Text>
      <Stack gap="md">
        {items.map((c) => {
          const pct = c.total ? Math.round((c.converted / c.total) * 100) : null;
          return (
            <Stack key={c.key} gap={4}>
              <Group justify="space-between" gap="xs">
                <Text size="sm">{c.label}</Text>
                <Text size="sm" fw={600}>
                  {pct === null ? '—' : `${pct}%`}
                </Text>
              </Group>
              <div
                className={classes.meter}
                role="meter"
                aria-label={c.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct ?? 0}
              >
                <div className={classes.meterFill} style={{ width: `${pct ?? 0}%` }} />
              </div>
              <Text size="xs" c="dimmed">
                {c.total
                  ? `${c.converted} из ${c.total} клиентов`
                  : 'Нет клиентов на входе за период'}
              </Text>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}
