import { ParserSettings } from '@crm/shared';
import {
  Alert,
  Button,
  Group,
  Loader,
  NumberInput,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import { formatDateTime } from '../../lib/format';
import { zodValidate } from '../../lib/zodForm';
import { useParserRuns, useParserSettings, useSaveParserSettings } from './api';

/** Настройки парсера и лог запусков (7.3). Сам автоимпорт пока не подключён. */
export function ParserTab() {
  const settings = useParserSettings();
  const runs = useParserRuns();
  const save = useSaveParserSettings();
  const form = useForm<ParserSettings>({
    initialValues: {
      enabled: false,
      intervalMinutes: 5,
      city: 'yerevan',
      category: 'apartments',
      ownerOnly: true,
    },
    validate: zodValidate(ParserSettings),
  });

  useEffect(() => {
    if (settings.data) {
      form.setValues(settings.data);
      form.resetDirty(settings.data);
    }
  }, [settings.data]);

  return (
    <Stack maw={640}>
      <Alert color="yellow" variant="light" title="Автоимпорт с list.am пока не подключён">
        Объявления добавляются вручную. Настройки сохраняются и начнут действовать, когда будет
        выбран источник данных (parse.bot, официальный доступ list.am или расширение браузера).
      </Alert>
      {settings.isPending ? (
        <Loader />
      ) : (
        <form
          onSubmit={form.onSubmit((values) =>
            save.mutate(values, {
              onSuccess: () =>
                notifications.show({ color: 'green', message: 'Настройки сохранены' }),
            }),
          )}
        >
          <Stack>
            <Switch label="Сбор включён" {...form.getInputProps('enabled', { type: 'checkbox' })} />
            <NumberInput
              label="Частота опроса, минут"
              description="От 2 до 15 минут"
              min={2}
              max={15}
              {...form.getInputProps('intervalMinutes')}
            />
            <Group grow>
              <TextInput label="Город" {...form.getInputProps('city')} />
              <TextInput label="Категория" {...form.getInputProps('category')} />
            </Group>
            <Switch
              label="Только от собственника"
              {...form.getInputProps('ownerOnly', { type: 'checkbox' })}
            />
            <Group>
              <Button type="submit" loading={save.isPending} disabled={!form.isDirty()}>
                Сохранить
              </Button>
            </Group>
          </Stack>
        </form>
      )}

      <Title order={4} mt="md">
        Последние запуски
      </Title>
      {runs.data?.length === 0 && (
        <Text size="sm" c="dimmed">
          Запусков ещё не было
        </Text>
      )}
      {!!runs.data?.length && (
        <Table.ScrollContainer minWidth={560}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Начало</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th ta="right">Новых</Table.Th>
                <Table.Th ta="right">Обновлено</Table.Th>
                <Table.Th>Ошибки</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {runs.data.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{formatDateTime(r.startedAt)}</Table.Td>
                  <Table.Td>{r.status}</Table.Td>
                  <Table.Td ta="right">{r.foundNew}</Table.Td>
                  <Table.Td ta="right">{r.updated}</Table.Td>
                  <Table.Td>{r.errors ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
