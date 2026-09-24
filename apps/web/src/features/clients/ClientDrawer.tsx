import { can, type ClientDetailsDto, type StageDto, type UserDto } from '@crm/shared';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  Menu,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { NestedModal, useHasOpenModal } from '../../components/NestedModal';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowRight, IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useMe } from '../../auth/useAuth';
import { CommentBox, Field, History } from '../../components/cards/CardParts';
import { formatDateTime, formatPrice } from '../../lib/format';
import { useDictionaries, useUserDirectory } from '../listings/api';
import { useAddClientComment, useClient, useClientBoard, useDeleteClient } from './api';
import { EditClientModal } from './EditClientModal';
import { Selection } from './Selection';
import type { PendingClientMove } from './ClientStageModal';

interface Props {
  clientId: number | null;
  editRequested: boolean;
  onEditHandled: () => void;
  onClose: () => void;
  onMove: (move: PendingClientMove) => void;
}

/** Карточка клиента (4.3): данные, этап, правка, комментарии и история. */
export function ClientDrawer({ clientId, editRequested, onEditHandled, onClose, onMove }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const hasOpenModal = useHasOpenModal();
  const { data: me } = useMe();
  const client = useClient(clientId);
  const board = useClientBoard();
  const addComment = useAddClientComment();
  const remove = useDeleteClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const c = client.data;
  const showEdit = editing || (editRequested && !!c);

  return (
    <Drawer
      opened={clientId !== null}
      onClose={onClose}
      closeOnEscape={!hasOpenModal}
      position="right"
      size={isMobile ? '100%' : 'lg'}
      title="Клиент"
    >
      {client.isPending && <Loader />}
      {client.error && <Alert color="red">{client.error.message}</Alert>}
      {c && me && (
        <Stack gap="md">
          <Stack gap={4}>
            <Group gap="xs">
              <Title order={3}>{c.name}</Title>
              {c.isOverdue && (
                <Badge color="red" variant="light">
                  просрочено
                </Badge>
              )}
            </Group>
            <Text fw={600}>
              {c.budgetMax !== null || c.budgetMin !== null
                ? `Бюджет: ${budget(c)}`
                : 'Бюджет не указан'}
            </Text>
          </Stack>

          <Group gap="xs">
            <StageMenu client={c} stages={board.data?.stages ?? []} onMove={onMove} />
            <Button
              variant="default"
              leftSection={<IconPencil size={16} />}
              onClick={() => setEditing(true)}
            >
              Изменить
            </Button>
            {can.deleteCards(me) && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Button variant="default" px="xs" aria-label="Ещё">
                    <IconDots size={16} />
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={16} />}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Удалить карточку
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>

          <Details client={c} me={me} />

          <Divider />
          <Selection client={c} />

          <Divider label="Комментарии и история" labelPosition="left" />
          <CommentBox
            pending={addComment.isPending}
            error={addComment.error?.message}
            onSubmit={(comment, done) =>
              addComment.mutate({ id: c.id, comment }, { onSuccess: done })
            }
          />
          <History comments={c.comments} />

          <EditClientModal
            client={c}
            me={me}
            opened={showEdit}
            onClose={() => {
              setEditing(false);
              onEditHandled();
            }}
          />
          <NestedModal
            opened={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Удалить клиента?"
          >
            <Stack>
              <Text size="sm">
                «{c.name}» пропадёт из воронки и таблицы. История сохранится в журнале.
              </Text>
              {remove.error && <Alert color="red">{remove.error.message}</Alert>}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setConfirmDelete(false)}>
                  Отмена
                </Button>
                <Button
                  color="red"
                  loading={remove.isPending}
                  onClick={() =>
                    remove.mutate(c.id, {
                      onSuccess: () => {
                        setConfirmDelete(false);
                        onClose();
                      },
                    })
                  }
                >
                  Удалить
                </Button>
              </Group>
            </Stack>
          </NestedModal>
        </Stack>
      )}
    </Drawer>
  );
}

function budget(c: ClientDetailsDto): string {
  const cur = c.currency;
  if (c.budgetMin !== null && c.budgetMax !== null) {
    return `${formatPrice(c.budgetMin, null)} – ${formatPrice(c.budgetMax, cur)}`;
  }
  if (c.budgetMax !== null) return `до ${formatPrice(c.budgetMax, cur)}`;
  return `от ${formatPrice(c.budgetMin, cur)}`;
}

function StageMenu({
  client,
  stages,
  onMove,
}: {
  client: ClientDetailsDto;
  stages: StageDto[];
  onMove: (move: PendingClientMove) => void;
}) {
  const current = stages.find((s) => s.id === client.stageId);
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <Button rightSection={<IconArrowRight size={16} />}>{current?.name ?? 'Этап'}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Перевести на этап</Menu.Label>
        {stages
          .filter((s) => s.id !== client.stageId)
          .map((to) => (
            <Menu.Item key={to.id} onClick={() => onMove({ client, from: current, to })}>
              {to.name}
            </Menu.Item>
          ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function Details({ client: c, me }: { client: ClientDetailsDto; me: UserDto }) {
  const dicts = useDictionaries();
  const directory = useUserDirectory(me.role !== 'partner');
  const dict = (
    kind: 'district' | 'property_type' | 'source' | 'reject_reason',
    id: number | null,
  ) => dicts.data?.[kind].find((d) => d.id === id)?.name ?? null;
  const person = (id: number | null) => {
    if (id === null) return null;
    if (id === me.id) return me.displayName;
    return directory.data?.find((u) => u.id === id)?.displayName ?? `#${id}`;
  };
  const districts = c.districtIds
    .map((id) => dict('district', id))
    .filter(Boolean)
    .join(', ');
  const rooms =
    c.roomsMin !== null || c.roomsMax !== null
      ? [c.roomsMin, c.roomsMax].filter((v) => v !== null).join('–')
      : null;

  return (
    <>
      <SimpleGrid cols={2} spacing="xs">
        <Field label="Телефон">
          {c.phone && <Anchor href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</Anchor>}
        </Field>
        <Field label="Мессенджер">{c.messenger}</Field>
        <Field label="Источник">{dict('source', c.sourceId)}</Field>
        <Field label="Сроки">{c.timeframe}</Field>
        <Field label="Районы">{districts || null}</Field>
        <Field label="Тип объекта">{dict('property_type', c.propertyTypeId)}</Field>
        <Field label="Комнат">{rooms}</Field>
        <Field label="Этаж">{c.floorPreference}</Field>
        <Field label="Показов">{c.showingsCount}</Field>
        <Field label="Показ">{c.nextShowingAt ? formatDateTime(c.nextShowingAt) : null}</Field>
        <Field label="Согласованная цена">
          {c.agreedPrice !== null ? formatPrice(c.agreedPrice, c.currency) : null}
        </Field>
        {c.finalPrice !== null && (
          <Field label="Финальная цена">{formatPrice(c.finalPrice, c.currency)}</Field>
        )}
        {c.commissionFact !== null && (
          <Field label="Комиссия (факт)">{formatPrice(c.commissionFact, c.currency)}</Field>
        )}
        {c.rejectReasonId !== null && (
          <Field label="Причина отказа">{dict('reject_reason', c.rejectReasonId)}</Field>
        )}
        <Field label="Ответственный">{person(c.responsibleId)}</Field>
        <Field label="Партнёр-источник">{person(c.partnerSourceId)}</Field>
        <Field label="Объектов в подборке">{c.linkedListings}</Field>
        <Field label="Создан">{formatDateTime(c.createdAt)}</Field>
      </SimpleGrid>
      {c.notes && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {c.notes}
        </Text>
      )}
    </>
  );
}
