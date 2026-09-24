import type { DictionariesDto, ListingDto, StageDto } from '@crm/shared';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Image,
  Loader,
  Menu,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowsSort, IconClockHour4, IconDots, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useMe } from '../../auth/useAuth';
import { formatPrice } from '../../lib/format';
import { usePref } from '../../lib/prefs';
import { AddListingModal } from './AddListingModal';
import { useDictionaries, useListingBoard } from './api';
import { ListingDrawer } from './ListingDrawer';
import {
  BOARD_PREFS_KEY,
  DEFAULT_BOARD_PREFS,
  moveWithin,
  orderColumn,
  type BoardPrefs,
} from './ordering';
import { StageChangeModal, type PendingMove } from './StageChangeModal';
import classes from './board.module.css';

const isColumnId = (id: unknown) => String(id).startsWith('stage-');

/**
 * Цель перетаскивания: карточка под указателем важнее колонки, иначе при переносе
 * на первое место целью оказывается сама колонка. Для клавиатуры — ближайшие углы.
 */
const collision: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  const cards = underPointer.filter((c) => !isColumnId(c.id));
  if (cards.length > 0) return cards;
  if (underPointer.length > 0) return underPointer;
  return closestCorners(args);
};

/** Воронка объявлений: колонки этапов, свежие изменения сверху (БТ-3.3.1), перетаскивание. */
export function ListingsBoardPage() {
  const { data: me } = useMe();
  const board = useListingBoard();
  const dicts = useDictionaries();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [move, setMove] = useState<PendingMove | null>(null);
  const [dragged, setDragged] = useState<ListingDto | null>(null);
  const [resetStage, setResetStage] = useState<StageDto | null>(null);
  const prefs = usePref<BoardPrefs>(BOARD_PREFS_KEY, DEFAULT_BOARD_PREFS);
  const manual = prefs.value.manual;

  const columns = (board.data?.stages ?? []).map((stage) => ({
    stage,
    manual: manual[stage.id] !== undefined,
    cards: orderColumn(
      (board.data?.cards ?? []).filter((c) => c.stageId === stage.id),
      manual[stage.id],
    ),
  }));

  const setManual = (stageId: number, ids: number[] | null) => {
    const next = { ...manual };
    if (ids) next[stageId] = ids;
    else delete next[stageId];
    prefs.save({ manual: next });
  };

  const sensors = useSensors(
    // Небольшой порог, чтобы клик по карточке не превращался в перетаскивание.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // На телефоне — долгое нажатие, иначе нельзя прокручивать колонки.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const cards = board.data?.cards ?? [];
    const card = cards.find((c) => c.id === active.id);
    if (!card || !over) return;
    // Отпустили над колонкой или над карточкой в ней.
    const overCard = cards.find((c) => c.id === over.id);
    const targetStageId = overCard?.stageId ?? Number(String(over.id).replace('stage-', ''));

    if (targetStageId === card.stageId) {
      const column = columns.find((c) => c.stage.id === targetStageId);
      if (!column?.manual) return;
      const ids = column.cards.map((c) => c.id);
      // Отпустили на пустом месте колонки — в конец.
      const target = overCard?.id ?? ids[ids.length - 1];
      if (target !== undefined) setManual(targetStageId, moveWithin(ids, card.id, target));
      return;
    }
    const to = board.data?.stages.find((s) => s.id === targetStageId);
    if (to)
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
          collisionDetection={collision}
          onDragStart={({ active }) =>
            setDragged(board.data.cards.find((c) => c.id === active.id) ?? null)
          }
          onDragCancel={() => setDragged(null)}
          onDragEnd={onDragEnd}
        >
          <ScrollArea type="auto" offsetScrollbars>
            <Group align="flex-start" wrap="nowrap" gap="sm" className={classes.board}>
              {columns.map(({ stage, cards, manual: isManual }) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  cards={cards}
                  manual={isManual}
                  dicts={dicts.data}
                  onOpen={setOpenId}
                  onManual={() =>
                    setManual(
                      stage.id,
                      cards.map((c) => c.id),
                    )
                  }
                  onAuto={() => setResetStage(stage)}
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
      <Modal
        opened={resetStage !== null}
        onClose={() => setResetStage(null)}
        title="Вернуть сортировку по изменению?"
      >
        <Stack>
          <Text size="sm">
            Ручной порядок карточек в колонке «{resetStage?.name}» будет сброшен. Восстановить его
            будет нельзя.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setResetStage(null)}>
              Отмена
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (resetStage) setManual(resetStage.id, null);
                setResetStage(null);
              }}
            >
              Сбросить порядок
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

interface ColumnProps {
  stage: StageDto;
  cards: ListingDto[];
  manual: boolean;
  dicts: DictionariesDto | undefined;
  onOpen: (id: number) => void;
  onManual: () => void;
  onAuto: () => void;
}

/** Колонка этапа. Сортировка — по изменению или ручная (БТ-3.3.1–3.3.3). */
function StageColumn({ stage, cards, manual, dicts, onOpen, onManual, onAuto }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });
  return (
    <Box ref={setNodeRef} className={classes.column} data-over={isOver || undefined}>
      <Group justify="space-between" mb="xs" px={4} wrap="nowrap">
        <Text fw={600} size="sm" truncate>
          {stage.name}
        </Text>
        <Group gap={4} wrap="nowrap">
          {manual && <IconArrowsSort size={14} color="var(--mantine-color-dimmed)" />}
          <Badge variant="light" color="gray">
            {cards.length}
          </Badge>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Сортировка: ${stage.name}`}
              >
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Сортировка</Menu.Label>
              <Menu.Item
                leftSection={<IconClockHour4 size={16} />}
                disabled={!manual}
                onClick={onAuto}
              >
                По изменению {!manual && '✓'}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconArrowsSort size={16} />}
                disabled={manual}
                onClick={onManual}
              >
                Вручную {manual && '✓'}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <Stack gap="xs">
        {manual ? (
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <SortableCard key={card.id} card={card} dicts={dicts} onOpen={onOpen} />
            ))}
          </SortableContext>
        ) : (
          cards.map((card) => (
            <DraggableCard key={card.id} card={card} dicts={dicts} onOpen={onOpen} />
          ))
        )}
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

function SortableCard({
  card,
  dicts,
  onOpen,
}: {
  card: ListingDto;
  dicts: DictionariesDto | undefined;
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
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
