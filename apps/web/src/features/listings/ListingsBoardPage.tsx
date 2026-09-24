import type { DictionariesDto, ListingDto, StageDto } from '@crm/shared';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
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
import { useMe } from '../../auth/useAuth';
import { formatPrice } from '../../lib/format';
import { AddListingModal } from './AddListingModal';
import { useDictionaries, useListingBoard } from './api';
import { ListingDrawer } from './ListingDrawer';
import { StageChangeModal, type PendingMove } from './StageChangeModal';
import classes from './board.module.css';

/** Воронка объявлений: колонки этапов, свежие изменения сверху (БТ-3.3.1), перетаскивание. */
export function ListingsBoardPage() {
  const { data: me } = useMe();
  const board = useListingBoard();
  const dicts = useDictionaries();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [move, setMove] = useState<PendingMove | null>(null);
  const [dragged, setDragged] = useState<ListingDto | null>(null);

  const sensors = useSensors(
    // Небольшой порог, чтобы клик по карточке не превращался в перетаскивание.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // На телефоне — долгое нажатие, иначе нельзя прокручивать колонки.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const card = board.data?.cards.find((c) => c.id === active.id);
    const to = board.data?.stages.find((s) => `stage-${s.id}` === over?.id);
    if (!card || !to || card.stageId === to.id) return;
    setMove({ listing: card, from: board.data?.stages.find((s) => s.id === card.stageId), to });
  };

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
        <DndContext
          sensors={sensors}
          onDragStart={({ active }) =>
            setDragged(board.data.cards.find((c) => c.id === active.id) ?? null)
          }
          onDragCancel={() => setDragged(null)}
          onDragEnd={onDragEnd}
        >
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
          <DragOverlay>
            {dragged && <CardBody card={dragged} dicts={dicts.data} className={classes.overlay} />}
          </DragOverlay>
        </DndContext>
      )}

      <AddListingModal opened={adding} onClose={() => setAdding(false)} onOpenListing={setOpenId} />
      <ListingDrawer listingId={openId} onClose={() => setOpenId(null)} onMove={setMove} />
      {me && <StageChangeModal move={move} me={me} onClose={() => setMove(null)} />}
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
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });
  return (
    <Box ref={setNodeRef} className={classes.column} data-over={isOver || undefined}>
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
          <DraggableCard key={card.id} card={card} dicts={dicts} onOpen={onOpen} />
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

function DraggableCard({
  card,
  dicts,
  onOpen,
}: {
  card: ListingDto;
  dicts: DictionariesDto | undefined;
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <CardBody
        card={card}
        dicts={dicts}
        className={classes.card}
        onClick={() => onOpen(card.id)}
      />
    </div>
  );
}

function CardBody({
  card,
  dicts,
  className,
  onClick,
}: {
  card: ListingDto;
  dicts: DictionariesDto | undefined;
  className?: string;
  onClick?: () => void;
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
      className={className}
      onClick={onClick}
      aria-label={card.title}
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
        {card.responsibleId === null && (
          <Badge size="xs" variant="light" color="yellow">
            пул
          </Badge>
        )}
      </Group>
    </Card>
  );
}
