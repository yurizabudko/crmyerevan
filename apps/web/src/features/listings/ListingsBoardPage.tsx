import type { DictionariesDto, ListingDto, StageDto } from '@crm/shared';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { formatPrice } from '../../lib/format';
import { AddListingModal } from './AddListingModal';
import { useDictionaries, useListingBoard } from './api';
import { ListingDrawer } from './ListingDrawer';
import classes from './board.module.css';

/** Воронка объявлений: колонки этапов, свежие изменения сверху (БТ-3.3.1). */
export function ListingsBoardPage() {
  const board = useListingBoard();
  const dicts = useDictionaries();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

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
        <ScrollArea type="auto" offsetScrollbars>
          <Group align="flex-start" wrap="nowrap" gap="sm" className={classes.board}>
            {board.data.stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                cards={board.data.cards.filter((c) => c.stageId === stage.id)}
                dicts={dicts.data}
                onOpen={setOpenId}
              />
            ))}
          </Group>
        </ScrollArea>
      )}

      <AddListingModal opened={adding} onClose={() => setAdding(false)} onOpenListing={setOpenId} />
      <ListingDrawer listingId={openId} onClose={() => setOpenId(null)} />
    </Stack>
  );
}

interface ColumnProps {
  stage: StageDto;
  cards: ListingDto[];
  dicts: DictionariesDto | undefined;
  onOpen: (id: number) => void;
}

function StageColumn({ stage, cards, dicts, onOpen }: ColumnProps) {
  return (
    <Box className={classes.column}>
      <Group justify="space-between" mb="xs" px={4}>
        <Text fw={600} size="sm">
          {stage.name}
        </Text>
        <Badge variant="light" color="gray">
          {cards.length}
        </Badge>
      </Group>
      <Stack gap="xs">
        {cards.map((card) => (
          <ListingCard key={card.id} card={card} dicts={dicts} onOpen={onOpen} />
        ))}
        {cards.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py="md">
            Пусто
          </Text>
        )}
      </Stack>
    </Box>
  );
}

function ListingCard({
  card,
  dicts,
  onOpen,
}: {
  card: ListingDto;
  dicts: DictionariesDto | undefined;
  onOpen: (id: number) => void;
}) {
  const district = dicts?.district.find((d) => d.id === card.districtId)?.name;
  const facts = [
    card.rooms !== null ? `${card.rooms} комн.` : null,
    card.area !== null ? `${card.area} м²` : null,
    district,
  ].filter(Boolean);

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      className={classes.card}
      onClick={() => onOpen(card.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(card.id)}
    >
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
      </Group>
    </Card>
  );
}
