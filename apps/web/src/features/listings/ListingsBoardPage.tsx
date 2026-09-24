import type { DictionariesDto, ListingDto } from '@crm/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useMe } from '../../auth/useAuth';
import { KanbanBoard } from '../../components/kanban/KanbanBoard';
import { formatPrice } from '../../lib/format';
import { AddListingModal } from './AddListingModal';
import { useDictionaries, useListingBoard } from './api';
import { ListingDrawer } from './ListingDrawer';
import { StageChangeModal, type PendingMove } from './StageChangeModal';

/** Воронка объявлений (раздел 3): свежие изменения сверху, перенос между этапами, ручной порядок. */
export function ListingsBoardPage() {
  const { data: me } = useMe();
  const board = useListingBoard();
  const dicts = useDictionaries();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [move, setMove] = useState<PendingMove | null>(null);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Воронка объявлений</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setAdding(true)}>
          Добавить
        </Button>
      </Group>

      {board.isPending && <Loader />}
      {board.error && <Alert color="red">{board.error.message}</Alert>}
      {board.data && (
        <KanbanBoard
          stages={board.data.stages}
          cards={board.data.cards}
          prefsKey="listings.board"
          renderCard={(card) => <ListingCard card={card} dicts={dicts.data} />}
          onOpen={(card) => setOpenId(card.id)}
          onMove={(listing, from, to) => setMove({ listing, from, to })}
        />
      )}

      <AddListingModal opened={adding} onClose={() => setAdding(false)} onOpenListing={setOpenId} />
      <ListingDrawer listingId={openId} onClose={() => setOpenId(null)} onMove={setMove} />
      {me && <StageChangeModal move={move} me={me} onClose={() => setMove(null)} />}
    </Stack>
  );
}

function ListingCard({ card, dicts }: { card: ListingDto; dicts: DictionariesDto | undefined }) {
  const district = dicts?.district.find((d) => d.id === card.districtId)?.name;
  const facts = [
    card.rooms !== null ? `${card.rooms} комн.` : null,
    card.area !== null ? `${card.area} м²` : null,
    district,
  ].filter(Boolean);

  return (
    <Card withBorder padding="sm" radius="md" aria-label={card.title}>
      {card.coverPhotoId !== null && (
        <Card.Section mb="xs">
          <Image
            src={`/api/photos/${card.coverPhotoId}?size=thumb`}
            h={120}
            fit="cover"
            alt=""
            loading="lazy"
            draggable={false}
          />
        </Card.Section>
      )}
      <Text fw={500} size="sm" lineClamp={2}>
        {card.title}
      </Text>
      <Text size="sm" fw={600} mt={4}>
        {formatPrice(card.price, card.currency)}
      </Text>
      {facts.length > 0 && (
        <Text size="xs" c="dimmed" mt={2}>
          {facts.join(' · ')}
        </Text>
      )}
      <Group gap={4} mt={6}>
        <Badge size="xs" variant="light" color={card.source === 'parser' ? 'blue' : 'gray'}>
          {card.source === 'parser' ? 'авто' : 'вручную'}
        </Badge>
        {card.responsibleId === null && (
          <Badge size="xs" variant="light" color="yellow">
            пул
          </Badge>
        )}
      </Group>
    </Card>
  );
}
