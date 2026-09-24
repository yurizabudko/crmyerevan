import { DICTIONARY_KINDS, type DictionaryKind } from '@crm/shared';
import { Loader, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import {
  useAddDictionaryItem,
  useAdminDictionaries,
  useReorderDictionary,
  useUpdateDictionaryItem,
} from './api';
import { AddRow, OrderedList } from './OrderedList';

const KIND_LABELS: Record<DictionaryKind, string> = {
  source: 'Источники',
  district: 'Районы',
  property_type: 'Типы объектов',
  reject_reason: 'Причины отказа',
};

/** Справочники (7.2). Значения не удаляются, а отключаются: на них ссылаются карточки. */
export function DictionariesTab() {
  const [kind, setKind] = useState<DictionaryKind>('source');
  const items = useAdminDictionaries();
  const add = useAddDictionaryItem();
  const update = useUpdateDictionaryItem();
  const reorder = useReorderDictionary();
  const list = (items.data ?? []).filter((i) => i.kind === kind);

  return (
    <Stack maw={640}>
      <SegmentedControl
        value={kind}
        onChange={(v) => setKind(v as DictionaryKind)}
        data={DICTIONARY_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
      />
      {items.isPending && <Loader />}
      <OrderedList
        items={list.map((i) => ({ id: i.id, name: i.name, muted: !i.isActive }))}
        onRename={(id, name) => update.mutate({ id, name })}
        onReorder={(ids) => reorder.mutate({ kind, ids })}
        actions={(item) => (
          <Switch
            size="xs"
            ml={4}
            checked={!item.muted}
            aria-label={`Используется: ${item.name}`}
            onChange={(e) => update.mutate({ id: item.id, isActive: e.currentTarget.checked })}
          />
        )}
      />
      <AddRow
        placeholder="Новое значение"
        pending={add.isPending}
        onAdd={(name) => add.mutate({ kind, name })}
      />
      <Text size="xs" c="dimmed">
        Отключённые значения пропадают из форм и фильтров, но остаются в существующих карточках.
      </Text>
    </Stack>
  );
}
