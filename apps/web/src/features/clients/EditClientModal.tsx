import {
  ClientPatch,
  PARTNER_LOCKED_CLIENT_FIELDS,
  type ClientDto,
  type UserDto,
} from '@crm/shared';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo } from 'react';
import { ApiError } from '../../api/client';
import { issuesToErrors } from '../../lib/zodForm';
import { useUserDirectory } from '../listings/api';
import { useUpdateClient } from './api';
import { ClientFields } from './ClientFields';
import { fromClient, toClientPatch, type ClientFormValues } from './formValues';

/** Правка клиента. Партнёру недоступны финансовые итоги сделки и назначения (БТ-2.3.2). */
export function EditClientModal({
  client,
  me,
  opened,
  onClose,
}: {
  client: ClientDto;
  me: UserDto;
  opened: boolean;
  onClose: () => void;
}) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const update = useUpdateClient();
  const isPartner = me.role === 'partner';
  const directory = useUserDirectory(!isPartner);
  const initial = useMemo(() => fromClient(client), [client]);
  const form = useForm<ClientFormValues>({ initialValues: initial });
  const locked = (field: string) =>
    isPartner && (PARTNER_LOCKED_CLIENT_FIELDS as readonly string[]).includes(field);

  const people = (directory.data ?? []).filter((u) => u.status === 'active');

  const close = () => {
    update.reset();
    form.setValues(initial);
    onClose();
  };

  const submit = form.onSubmit((values) => {
    const parsed = ClientPatch.safeParse(toClientPatch(initial, values, client.version));
    if (!parsed.success) {
      form.setErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
      );
      return;
    }
    if (Object.keys(parsed.data).length === 1) return close();
    update.mutate(
      { id: client.id, patch: parsed.data },
      {
        onSuccess: close,
        onError: (e) => {
          if (e instanceof ApiError && e.body.issues) form.setErrors(issuesToErrors(e.body.issues));
        },
      },
    );
  });

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Редактирование клиента"
      size="lg"
      fullScreen={isMobile}
    >
      <form onSubmit={submit}>
        <Stack>
          <ClientFields form={form} />
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <NumberInput
              label="Согласованная цена"
              min={0}
              thousandSeparator=" "
              {...form.getInputProps('agreedPrice')}
            />
            <TextInput
              label="Показ"
              description="Время Еревана"
              type="datetime-local"
              {...form.getInputProps('nextShowingAt')}
            />
            {!locked('finalPrice') && (
              <NumberInput
                label="Финальная цена"
                min={0}
                thousandSeparator=" "
                {...form.getInputProps('finalPrice')}
              />
            )}
            {!locked('commissionFact') && (
              <NumberInput
                label="Комиссия (факт)"
                min={0}
                thousandSeparator=" "
                {...form.getInputProps('commissionFact')}
              />
            )}
            {!isPartner && (
              <Select
                label="Ответственный"
                data={people.map((u) => ({ value: String(u.id), label: u.displayName }))}
                clearable
                searchable
                {...form.getInputProps('responsibleId')}
              />
            )}
            {me.role === 'owner' && (
              <Select
                label="Партнёр-источник"
                data={people
                  .filter((u) => u.role === 'partner')
                  .map((u) => ({ value: String(u.id), label: u.displayName }))}
                clearable
                searchable
                {...form.getInputProps('partnerSourceId')}
              />
            )}
          </SimpleGrid>
          {update.error && <Alert color="red">{update.error.message}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Отмена
            </Button>
            <Button type="submit" loading={update.isPending}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
