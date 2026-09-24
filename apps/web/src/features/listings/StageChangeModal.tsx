import {
  checkListingTransition,
  listingTransitionRequirements,
  type ListingCloseOutcome,
  type ListingDto,
  type StageDto,
  type UserDto,
} from '@crm/shared';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  List,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { useChangeStage } from './api';
import { isoToYerevanInput, yerevanInputToIso } from '../../lib/format';

export interface PendingMove {
  listing: ListingDto;
  from: StageDto | undefined;
  to: StageDto;
}

/**
 * Подтверждение перехода с обязательными полями (БТ-3.1.1). Если этапу ничего не нужно,
 * переход выполняется сразу, без окна.
 */
export function StageChangeModal({
  move,
  me,
  onClose,
}: {
  move: PendingMove | null;
  me: UserDto;
  onClose: () => void;
}) {
  const change = useChangeStage();
  const [contactConfirmed, setContact] = useState(false);
  const [actualityConfirmed, setActuality] = useState(false);
  const [meetingAt, setMeetingAt] = useState('');
  const [closeOutcome, setOutcome] = useState<ListingCloseOutcome | ''>('');

  const req = move ? listingTransitionRequirements(move.from?.code ?? null, move.to.code) : null;
  const needsInput = req ? Object.values(req).some(Boolean) : false;

  const input = {
    contactConfirmed,
    actualityConfirmed,
    meetingAt: meetingAt ? yerevanInputToIso(meetingAt) : undefined,
    closeOutcome: closeOutcome || undefined,
  };
  const errors = move
    ? checkListingTransition({
        actor: me,
        from: { code: move.from?.code ?? null, isTerminal: move.from?.isTerminal ?? false },
        to: { code: move.to.code },
        hasMeetingAt: move.listing.meetingAt !== null,
        input,
      })
    : [];

  const submit = () => {
    if (!move) return;
    change.mutate(
      {
        id: move.listing.id,
        change: { stageId: move.to.id, version: move.listing.version, ...input },
      },
      {
        onSuccess: close,
        onError: (error) => {
          // Конфликты версий уже показаны общим обработчиком мутации.
          if (!(error instanceof ApiError && error.status === 409)) {
            notifications.show({ color: 'red', message: error.message });
          }
          close();
        },
      },
    );
  };

  const close = () => {
    setContact(false);
    setActuality(false);
    setMeetingAt('');
    setOutcome('');
    change.reset();
    onClose();
  };

  // Переход без обязательных полей — сразу, без окна.
  useEffect(() => {
    if (move && !needsInput && errors.length === 0 && change.isIdle) submit();
  }, [move]);

  // Если переход запрещён правилами роли — показываем причину.
  const blocked = move !== null && !needsInput && errors.length > 0;

  return (
    <Modal
      opened={move !== null && (needsInput || blocked)}
      onClose={close}
      title={move ? `Перевод на этап «${move.to.name}»` : ''}
    >
      {move && req && (
        <Stack>
          <Text size="sm" fw={500} lineClamp={2}>
            {move.listing.title}
          </Text>
          {req.contactConfirmed && (
            <Checkbox
              label="Контакт с собственником состоялся"
              checked={contactConfirmed}
              onChange={(e) => setContact(e.currentTarget.checked)}
            />
          )}
          {req.actualityConfirmed && (
            <Checkbox
              label="Собственник подтвердил актуальность объекта"
              checked={actualityConfirmed}
              onChange={(e) => setActuality(e.currentTarget.checked)}
            />
          )}
          {req.meetingAt && (
            <TextInput
              label="Дата и время встречи"
              description="Время Еревана"
              type="datetime-local"
              value={meetingAt || isoToYerevanInput(move.listing.meetingAt)}
              onChange={(e) => setMeetingAt(e.currentTarget.value)}
            />
          )}
          {req.closeOutcome && (
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Исход
              </Text>
              <SegmentedControl
                value={closeOutcome}
                onChange={(v) => setOutcome(v as ListingCloseOutcome)}
                data={[
                  { value: 'success', label: 'Сделка' },
                  { value: 'lost', label: 'Объект потерян' },
                ]}
              />
            </Stack>
          )}
          {errors.length > 0 && (
            <Alert color={blocked ? 'red' : 'gray'} variant="light">
              <List size="sm">
                {errors.map((e) => (
                  <List.Item key={e}>{e}</List.Item>
                ))}
              </List>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Отмена
            </Button>
            {!blocked && (
              <Button onClick={submit} disabled={errors.length > 0} loading={change.isPending}>
                Перевести
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
