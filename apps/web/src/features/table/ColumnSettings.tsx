import { ActionIcon, Button, Checkbox, Group, Popover, Stack, Text } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconColumns } from '@tabler/icons-react';
import type { ColumnDef, ColumnPrefs } from './columns';

/** Показ, скрытие и порядок колонок — сохраняются для пользователя (БТ-5.2). */
export function ColumnSettings<T>({
  columns,
  prefs,
  onChange,
}: {
  columns: ColumnDef<T>[];
  prefs: ColumnPrefs;
  onChange: (prefs: ColumnPrefs) => void;
}) {
  const order = columns.map((c) => c.key);
  const move = (index: number, delta: number) => {
    const next = [...order];
    const [key] = next.splice(index, 1);
    next.splice(index + delta, 0, key!);
    onChange({ ...prefs, order: next });
  };
  const toggle = (key: string, visible: boolean) =>
    onChange({
      order,
      hidden: visible ? prefs.hidden.filter((k) => k !== key) : [...prefs.hidden, key],
    });

  return (
    <Popover position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <Button variant="default" leftSection={<IconColumns size={16} />}>
          Колонки
        </Button>
      </Popover.Target>
      <Popover.Dropdown mah={420} style={{ overflowY: 'auto' }}>
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            Видимость и порядок колонок
          </Text>
          {columns.map((c, i) => (
            <Group key={c.key} justify="space-between" gap="xs" wrap="nowrap">
              <Checkbox
                size="xs"
                label={c.label}
                checked={!prefs.hidden.includes(c.key)}
                onChange={(e) => toggle(c.key, e.currentTarget.checked)}
              />
              <Group gap={2} wrap="nowrap">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  disabled={i === 0}
                  aria-label={`Выше: ${c.label}`}
                  onClick={() => move(i, -1)}
                >
                  <IconArrowUp size={12} />
                </ActionIcon>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  disabled={i === columns.length - 1}
                  aria-label={`Ниже: ${c.label}`}
                  onClick={() => move(i, 1)}
                >
                  <IconArrowDown size={12} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
