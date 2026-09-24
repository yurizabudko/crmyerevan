import { ActionIcon, Badge, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconCheck, IconPencil, IconX } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';

export interface OrderedItem {
  id: number;
  name: string;
  badges?: string[];
  muted?: boolean;
}

/**
 * Список с переименованием и порядком стрелками — для этапов и справочников.
 * Стрелки вместо перетаскивания: предсказуемо на телефоне и с клавиатуры.
 */
export function OrderedList({
  items,
  onRename,
  onReorder,
  actions,
}: {
  items: OrderedItem[];
  onRename: (id: number, name: string) => void;
  onReorder: (ids: number[]) => void;
  actions?: (item: OrderedItem) => ReactNode;
}) {
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const move = (index: number, delta: number) => {
    const ids = items.map((i) => i.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    onReorder(ids);
  };
  const save = () => {
    if (editing && editing.name.trim()) onRename(editing.id, editing.name.trim());
    setEditing(null);
  };

  return (
    <Stack gap={4}>
      {items.map((item, i) => (
        <Paper key={item.id} withBorder px="sm" py={6} radius="sm">
          <Group justify="space-between" wrap="nowrap" gap="xs">
            {editing?.id === item.id ? (
              <TextInput
                size="xs"
                autoFocus
                value={editing.name}
                onChange={(e) => setEditing({ id: item.id, name: e.currentTarget.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') setEditing(null);
                }}
                style={{ flex: 1 }}
                aria-label="Новое название"
              />
            ) : (
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                <Text
                  size="sm"
                  truncate
                  c={item.muted ? 'dimmed' : undefined}
                  td={item.muted ? 'line-through' : undefined}
                >
                  {item.name}
                </Text>
                {item.badges?.map((b) => (
                  <Badge key={b} size="xs" variant="light" color="gray">
                    {b}
                  </Badge>
                ))}
              </Group>
            )}
            <Group gap={2} wrap="nowrap">
              {editing?.id === item.id ? (
                <>
                  <ActionIcon variant="subtle" aria-label="Сохранить" onClick={save}>
                    <IconCheck size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Отмена"
                    onClick={() => setEditing(null)}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </>
              ) : (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={`Переименовать: ${item.name}`}
                  onClick={() => setEditing({ id: item.id, name: item.name })}
                >
                  <IconPencil size={16} />
                </ActionIcon>
              )}
              <ActionIcon
                variant="subtle"
                color="gray"
                disabled={i === 0}
                aria-label={`Выше: ${item.name}`}
                onClick={() => move(i, -1)}
              >
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                disabled={i === items.length - 1}
                aria-label={`Ниже: ${item.name}`}
                onClick={() => move(i, 1)}
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              {actions?.(item)}
            </Group>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

/** Строка «добавить элемент». */
export function AddRow({
  placeholder,
  onAdd,
  pending,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName('');
  };
  return (
    <Group gap="xs" wrap="nowrap">
      <TextInput
        size="sm"
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{ flex: 1 }}
      />
      <ActionIcon
        size="lg"
        variant="light"
        aria-label="Добавить"
        loading={pending}
        onClick={submit}
      >
        <IconCheck size={18} />
      </ActionIcon>
    </Group>
  );
}
