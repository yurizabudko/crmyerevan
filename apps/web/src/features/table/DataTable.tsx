import { Box, Center, Table, Text, UnstyledButton } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import type { ColumnDef } from './columns';
import { EditableCell } from './EditableCell';
import classes from './table.module.css';

interface Props<T extends { id: number }> {
  columns: ColumnDef<T>[];
  rows: T[];
  sort: string | undefined;
  onSort: (sort: string | undefined) => void;
  onOpen: (row: T) => void;
  onEdit: (row: T, field: string, value: string | number | null) => void;
  rowHighlight?: (row: T) => boolean;
}

/**
 * Таблица с сортировкой по заголовку (БТ-5.5), редактированием ячеек (БТ-5.6)
 * и открытием карточки по клику на строку (БТ-5.7).
 */
export function DataTable<T extends { id: number }>({
  columns,
  rows,
  sort,
  onSort,
  onOpen,
  onEdit,
  rowHighlight,
}: Props<T>) {
  const [editing, setEditing] = useState<{ id: number; key: string } | null>(null);
  const sortKey = sort?.replace(/^-/, '');
  const desc = sort?.startsWith('-');

  // Цикл: по возрастанию → по убыванию → без сортировки (по изменению).
  const toggle = (key: string) => onSort(sortKey !== key ? key : desc ? undefined : `-${key}`);

  return (
    <Table.ScrollContainer minWidth={Math.max(600, columns.length * 130)}>
      <Table striped highlightOnHover verticalSpacing={6} className={classes.table}>
        <Table.Thead>
          <Table.Tr>
            {columns.map((c) => (
              <Table.Th key={c.key} style={{ minWidth: c.width }}>
                {c.sortable ? (
                  <UnstyledButton className={classes.sort} onClick={() => toggle(c.key)}>
                    {c.label}
                    {sortKey === c.key &&
                      (desc ? <IconArrowDown size={14} /> : <IconArrowUp size={14} />)}
                  </UnstyledButton>
                ) : (
                  c.label
                )}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr
              key={row.id}
              className={classes.row}
              data-highlight={rowHighlight?.(row) || undefined}
              onClick={() => onOpen(row)}
            >
              {columns.map((c) => {
                const isEditing = editing?.id === row.id && editing.key === c.key;
                const value = c.render(row);
                return (
                  <Table.Td key={c.key}>
                    {isEditing && c.edit ? (
                      <Box onClick={(e) => e.stopPropagation()}>
                        <EditableCell
                          kind={c.edit.kind}
                          initial={c.edit.value(row)}
                          onCancel={() => setEditing(null)}
                          onSave={(next) => {
                            setEditing(null);
                            if (next !== c.edit!.value(row)) onEdit(row, c.edit!.field, next);
                          }}
                        />
                      </Box>
                    ) : (
                      <Box className={classes.cell}>
                        {/* Переносятся только широкие текстовые колонки (название, имя). */}
                        <Text
                          size="sm"
                          lineClamp={c.width ? 2 : undefined}
                          style={c.width ? undefined : { whiteSpace: 'nowrap' }}
                        >
                          {value ?? '—'}
                        </Text>
                        {c.edit && (
                          <UnstyledButton
                            className={classes.edit}
                            aria-label={`Изменить: ${c.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing({ id: row.id, key: c.key });
                            }}
                          >
                            <IconPencil size={14} />
                          </UnstyledButton>
                        )}
                      </Box>
                    )}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {rows.length === 0 && (
        <Center py="xl">
          <Text c="dimmed">Ничего не найдено</Text>
        </Center>
      )}
    </Table.ScrollContainer>
  );
}
