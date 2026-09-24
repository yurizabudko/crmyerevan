import { ListingDraft } from '@crm/shared';
import { Alert, Anchor, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { issuesToErrors, zodValidate } from '../../lib/zodForm';
import { useCreateListing } from './api';
import { EMPTY_LISTING, toDraftInput, type ListingFormValues } from './formValues';
import { ListingFields } from './ListingFields';

interface Props {
  opened: boolean;
  onClose: () => void;
  onOpenListing: (id: number) => void;
}

/** Ручное добавление объявления (п. 3.2, «Ручной ввод»). */
export function AddListingModal({ opened, onClose, onOpenListing }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const create = useCreateListing();
  const form = useForm<ListingFormValues>({
    initialValues: EMPTY_LISTING,
    validate: (values) => zodValidate(ListingDraft)(toDraftInput(values)),
  });

  const duplicateId =
    create.error instanceof ApiError && create.error.code === 'DUPLICATE_LISTING'
      ? create.error.body.existingId
      : undefined;

  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };

  const submit = form.onSubmit((values) => {
    create.mutate(ListingDraft.parse(toDraftInput(values)), {
      onSuccess: (listing) => {
        notifications.show({ color: 'green', message: `Объявление «${listing.title}» добавлено` });
        close();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.body.issues) {
          form.setErrors(issuesToErrors(error.body.issues));
        }
      },
    });
  });

  return (
    <Modal opened={opened} onClose={close} title="Новое объявление" size="lg" fullScreen={isMobile}>
      <form onSubmit={submit}>
        <Stack>
          <ListingFields form={form} />
          <Text size="xs" c="dimmed">
            Фото можно добавить в карточке сразу после создания.
          </Text>
          {create.error && (
            <Alert color="red">
              {create.error.message}
              {duplicateId !== undefined && (
                <>
                  {' '}
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => {
                      close();
                      onOpenListing(duplicateId);
                    }}
                  >
                    Открыть карточку
                  </Anchor>
                </>
              )}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Отмена
            </Button>
            <Button type="submit" loading={create.isPending}>
              Добавить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
