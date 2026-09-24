import { ClientDraft } from '@crm/shared';
import { Alert, Anchor, Button, Group, Modal, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { issuesToErrors, zodValidate } from '../../lib/zodForm';
import { useCreateClient } from './api';
import { ClientFields } from './ClientFields';
import { EMPTY_CLIENT, toClientDraftInput, type ClientFormValues } from './formValues';

/** Новый клиент (4.1, этап 1): только вручную; при дубле телефона — ссылка на карточку (БТ-4.3). */
export function AddClientModal({
  opened,
  onClose,
  onOpenClient,
}: {
  opened: boolean;
  onClose: () => void;
  onOpenClient: (id: number) => void;
}) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const create = useCreateClient();
  const form = useForm<ClientFormValues>({
    initialValues: EMPTY_CLIENT,
    validate: (values) => zodValidate(ClientDraft)(toClientDraftInput(values)),
  });

  const duplicate =
    create.error instanceof ApiError && create.error.code === 'DUPLICATE_CLIENT'
      ? create.error.body
      : undefined;

  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };

  const submit = form.onSubmit((values) =>
    create.mutate(ClientDraft.parse(toClientDraftInput(values)), {
      onSuccess: (client) => {
        notifications.show({ color: 'green', message: `Клиент «${client.name}» добавлен` });
        close();
      },
      onError: (e) => {
        if (e instanceof ApiError && e.body.issues) form.setErrors(issuesToErrors(e.body.issues));
      },
    }),
  );

  return (
    <Modal opened={opened} onClose={close} title="Новый клиент" size="lg" fullScreen={isMobile}>
      <form onSubmit={submit}>
        <Stack>
          <ClientFields form={form} />
          {create.error && (
            <Alert color={duplicate ? 'orange' : 'red'}>
              {create.error.message}
              {duplicate?.existingId !== undefined && (
                <>
                  {' '}
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => {
                      close();
                      onOpenClient(duplicate.existingId!);
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
