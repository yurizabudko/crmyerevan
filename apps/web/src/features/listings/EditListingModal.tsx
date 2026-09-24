import {
  PARTNER_EDITABLE_LISTING_FIELDS,
  ListingPatch,
  type ListingDto,
  type UserDto,
} from '@crm/shared';
import { Alert, Button, Group, Modal, Select, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo } from 'react';
import { ApiError } from '../../api/client';
import { issuesToErrors } from '../../lib/zodForm';
import { useUpdateListing, useUserDirectory } from './api';
import { fromDto, toPatch, type ListingFormValues } from './formValues';
import { COMMISSION_OPTIONS, ListingFields } from './ListingFields';

interface Props {
  listing: ListingDto;
  me: UserDto;
  opened: boolean;
  onClose: () => void;
}

/** Правка карточки. Партнёру доступны только поля из БТ-2.3.1, остальные заблокированы. */
export function EditListingModal({ listing, me, opened, onClose }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const update = useUpdateListing();
  const isPartner = me.role === 'partner';
  const directory = useUserDirectory(!isPartner);
  const initial = useMemo(() => fromDto(listing), [listing]);
  const form = useForm<ListingFormValues>({ initialValues: initial });

  const isLocked = (field: keyof ListingFormValues) =>
    isPartner && !(PARTNER_EDITABLE_LISTING_FIELDS as readonly string[]).includes(field);

  const people = (directory.data ?? []).filter((u) => u.status === 'active');
  const staffOptions = people.map((u) => ({ value: String(u.id), label: u.displayName }));
  const partnerOptions = people
    .filter((u) => u.role === 'partner')
    .map((u) => ({ value: String(u.id), label: u.displayName }));

  const close = () => {
    update.reset();
    form.setValues(initial);
    onClose();
  };

  const submit = form.onSubmit((values) => {
    const parsed = ListingPatch.safeParse(toPatch(initial, values, listing.version));
    if (!parsed.success) {
      form.setErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
      );
      return;
    }
    if (Object.keys(parsed.data).length === 1) return close();
    update.mutate(
      { id: listing.id, patch: parsed.data },
      {
        onSuccess: close,
        onError: (e) => {
          if (e instanceof ApiError && e.body.issues) form.setErrors(issuesToErrors(e.body.issues));
        },
      },
    );
  });

  return (
    <Modal opened={opened} onClose={close} title="Редактирование" size="lg" fullScreen={isMobile}>
      <form onSubmit={submit}>
        <Stack>
          <ListingFields form={form} isLocked={isLocked} />
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <Select
              label="Комиссия агентства"
              data={COMMISSION_OPTIONS}
              clearable
              {...form.getInputProps('commissionPercent')}
            />
            <TextInput
              label="Встреча"
              description="Время Еревана"
              type="datetime-local"
              {...form.getInputProps('meetingAt')}
            />
            {!isPartner && (
              <Select
                label="Ответственный"
                data={staffOptions}
                clearable
                searchable
                placeholder="Общий пул"
                {...form.getInputProps('responsibleId')}
              />
            )}
            {me.role === 'owner' && (
              <Select
                label="Партнёр-источник"
                data={partnerOptions}
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
