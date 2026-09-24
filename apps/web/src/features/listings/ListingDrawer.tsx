import { can, type ListingDetailsDto, type StageDto, type UserDto } from '@crm/shared';
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
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowRight, IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useMe } from '../../auth/useAuth';
import { formatDateTime, formatPrice } from '../../lib/format';
import {
  useAddComment,
  useDeleteListing,
  useDictionaries,
  useListing,
  useListingBoard,
  useUserDirectory,
} from './api';
import { PhotoGallery } from './PhotoGallery';
import { CommentBox, Field, History } from '../../components/cards/CardParts';
import { EditListingModal } from './EditListingModal';
import type { PendingMove } from './StageChangeModal';

const OUTCOME = { success: 'сделка', lost: 'объект потерян' } as const;

interface Props {
  listingId: number | null;
  onClose: () => void;
  onMove: (move: PendingMove) => void;
}

/** Карточка объявления (п. 3.4): поля, смена этапа, правка, комментарии и история. */
export function ListingDrawer({ listingId, onClose, onMove }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { data: me } = useMe();
  const listing = useListing(listingId);
  const board = useListingBoard();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteListing();
  const addComment = useAddComment();
  const l = listing.data;

  return (
    <Drawer
      opened={listingId !== null}
      onClose={onClose}
      position="right"
      size={isMobile ? '100%' : 'lg'}
      title="Объявление"
    >
      {listing.isPending && <Loader />}
      {listing.error && <Alert color="red">{listing.error.message}</Alert>}
      {l && me && (
        <Stack gap="md">
          <Stack gap={4}>
            <Title order={3}>{l.title}</Title>
            <Group gap="xs">
              <Text fw={600}>{formatPrice(l.price, l.currency)}</Text>
              <Badge variant="light" color={l.source === 'parser' ? 'blue' : 'gray'}>
                {l.source === 'parser' ? 'автоимпорт' : 'вручную'}
              </Badge>
            </Group>
          </Stack>

          <Group gap="xs">
            <StageMenu listing={l} stages={board.data?.stages ?? []} onMove={onMove} />
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

          <PhotoGallery listing={l} me={me} />

          <Details listing={l} me={me} />

          <Divider label="Комментарии и история" labelPosition="left" />
          <CommentBox
            pending={addComment.isPending}
            error={addComment.error?.message}
            onSubmit={(comment, done) =>
              addComment.mutate({ id: l.id, comment }, { onSuccess: done })
            }
          />
          <History comments={l.comments} />

          <Modal
            opened={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Удалить карточку?"
          >
            <Stack>
              <Text size="sm">
                «{l.title}» пропадёт из воронки и таблицы. История и фото сохранятся в журнале.
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
                    remove.mutate(l.id, {
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
          </Modal>

          <EditListingModal
            listing={l}
            me={me}
            opened={editing}
            onClose={() => setEditing(false)}
          />
        </Stack>
      )}
    </Drawer>
  );
}

/** Смена этапа без перетаскивания — основной способ на телефоне. */
function StageMenu({
  listing,
  stages,
  onMove,
}: {
  listing: ListingDetailsDto;
  stages: StageDto[];
  onMove: (move: PendingMove) => void;
}) {
  const current = stages.find((s) => s.id === listing.stageId);
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <Button rightSection={<IconArrowRight size={16} />}>{current?.name ?? 'Этап'}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Перевести на этап</Menu.Label>
        {stages
          .filter((s) => s.id !== listing.stageId)
          .map((to) => (
            <Menu.Item key={to.id} onClick={() => onMove({ listing, from: current, to })}>
              {to.name}
            </Menu.Item>
          ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function Details({ listing: l, me }: { listing: ListingDetailsDto; me: UserDto }) {
  const dicts = useDictionaries();
  const directory = useUserDirectory(me.role !== 'partner');
  const dict = (kind: 'district' | 'property_type', id: number | null) =>
    dicts.data?.[kind].find((d) => d.id === id)?.name ?? null;
  const person = (id: number | null) => {
    if (id === null) return null;
    if (id === me.id) return me.displayName;
    return directory.data?.find((u) => u.id === id)?.displayName ?? `#${id}`;
  };

  return (
    <>
      <SimpleGrid cols={2} spacing="xs">
        <Field label="Район">{dict('district', l.districtId)}</Field>
        <Field label="Тип">{dict('property_type', l.propertyTypeId)}</Field>
        <Field label="Комнат">{l.rooms}</Field>
        <Field label="Площадь">{l.area !== null ? `${l.area} м²` : null}</Field>
        <Field label="Этаж">
          {l.floor !== null ? `${l.floor}${l.floorsTotal ? ` из ${l.floorsTotal}` : ''}` : null}
        </Field>
        <Field label="Адрес">{l.address}</Field>
        <Field label="Собственник">{l.ownerName}</Field>
        <Field label="Телефон">
          {l.phone && <Anchor href={`tel:${l.phone.replace(/[^\d+]/g, '')}`}>{l.phone}</Anchor>}
        </Field>
        <Field label="Другие контакты">{l.contactsExtra}</Field>
        <Field label="Встреча">{l.meetingAt ? formatDateTime(l.meetingAt) : null}</Field>
        <Field label="Комиссия">
          {l.commissionPercent !== null ? `${l.commissionPercent}%` : null}
        </Field>
        <Field label="Ответственный">{person(l.responsibleId) ?? 'общий пул'}</Field>
        <Field label="Партнёр-источник">{person(l.partnerSourceId)}</Field>
        {l.closeOutcome && (
          <Field label="Исход">{OUTCOME[l.closeOutcome as keyof typeof OUTCOME]}</Field>
        )}
        <Field label="Создано">{formatDateTime(l.createdAt)}</Field>
      </SimpleGrid>
      {l.sourceUrl && (
        <Anchor href={l.sourceUrl} target="_blank" rel="noreferrer" size="sm">
          Открыть на сайте-источнике
        </Anchor>
      )}
      {l.description && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {l.description}
        </Text>
      )}
    </>
  );
}
