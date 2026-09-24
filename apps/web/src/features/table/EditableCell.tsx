import { NumberInput, Select, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { EditKind } from './columns';

interface Props {
  kind: EditKind;
  initial: string | number | null;
  onSave: (value: string | number | null) => void;
  onCancel: () => void;
}

/** Редактор ячейки: Enter/уход фокуса — сохранить, Escape — отменить (БТ-5.6). */
export function EditableCell({ kind, initial, onSave, onCancel }: Props) {
  const [value, setValue] = useState<string | number | null>(initial);
  const commit = (next = value) => onSave(next === '' ? null : next);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') onCancel();
  };

  if (kind.type === 'select') {
    return (
      <Select
        size="xs"
        autoFocus
        defaultDropdownOpened
        data={kind.options}
        value={value === null ? null : String(value)}
        clearable={kind.clearable}
        searchable
        comboboxProps={{ withinPortal: true }}
        onChange={(v) => commit(v === null ? null : Number(v))}
        onBlur={onCancel}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
    );
  }
  if (kind.type === 'number') {
    return (
      <NumberInput
        size="xs"
        autoFocus
        min={0}
        thousandSeparator=" "
        value={value ?? ''}
        onChange={(v) => setValue(v === '' ? null : Number(v))}
        onBlur={() => commit()}
        onKeyDown={keys}
      />
    );
  }
  return (
    <TextInput
      size="xs"
      autoFocus
      value={value === null ? '' : String(value)}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={() => commit()}
      onKeyDown={keys}
    />
  );
}
