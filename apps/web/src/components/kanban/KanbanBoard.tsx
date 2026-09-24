import type { StageDto } from '@crm/shared';
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
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { IconArrowsSort, IconClockHour4, IconDots } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { usePref } from '../../lib/prefs';
import classes from './kanban.module.css';
import { DEFAULT_BOARD_PREFS, moveWithin, orderColumn, type BoardPrefs } from './ordering';

export interface KanbanItem {
  id: number;
  stageId: number | null;
}

interface Props<T extends KanbanItem> {
  stages: StageDto[];
  cards: T[];
  /** Ключ личной настройки с ручным порядком колонок. */
  prefsKey: string;
  renderCard: (card: T, dragging: boolean) => ReactNode;
  onOpen: (card: T) => void;
  onMove: (card: T, from: StageDto | undefined, to: StageDto) => void;
}

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

/**
 * Канбан-доска воронки: колонки этапов, перенос между этапами, сортировка по изменению
 * или ручной порядок с сохранением per-user per-column (БТ-3.3).
 */
export function KanbanBoard<T extends KanbanItem>({
  stages,
  cards,
  prefsKey,
  renderCard,
  onOpen,
  onMove,
}: Props<T>) {
  const [dragged, setDragged] = useState<T | null>(null);
  const [resetStage, setResetStage] = useState<StageDto | null>(null);
  const prefs = usePref<BoardPrefs>(prefsKey, DEFAULT_BOARD_PREFS);
  const manual = prefs.value.manual;

  const sensors = useSensors(
    // Небольшой порог, чтобы клик по карточке не превращался в перетаскивание.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // На телефоне — долгое нажатие, иначе нельзя прокручивать колонки.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = stages.map((stage) => ({
    stage,
    manual: manual[stage.id] !== undefined,
    cards: orderColumn(
      cards.filter((c) => c.stageId === stage.id),
      manual[stage.id],
    ),
  }));

  const setManual = (stageId: number, ids: number[] | null) => {
    const next = { ...manual };
    if (ids) next[stageId] = ids;
    else delete next[stageId];
    prefs.save({ manual: next });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
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
    const to = stages.find((s) => s.id === targetStageId);
    if (to)
      onMove(
        card,
        stages.find((s) => s.id === card.stageId),
        to,
      );
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={({ active }) => setDragged(cards.find((c) => c.id === active.id) ?? null)}
        onDragCancel={() => setDragged(null)}
        onDragEnd={onDragEnd}
      >
        <ScrollArea type="auto" offsetScrollbars>
          <Group align="flex-start" wrap="nowrap" gap="sm" className={classes.board}>
            {columns.map((column) => (
              <Column
                key={column.stage.id}
                {...column}
                renderCard={renderCard}
                onOpen={onOpen}
                onManual={() =>
                  setManual(
                    column.stage.id,
                    column.cards.map((c) => c.id),
                  )
                }
                onAuto={() => setResetStage(column.stage)}
              />
            ))}
          </Group>
        </ScrollArea>
        <DragOverlay>
          {dragged && <div className={classes.overlay}>{renderCard(dragged, true)}</div>}
        </DragOverlay>
      </DndContext>

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
    </>
  );
}

interface ColumnProps<T extends KanbanItem> {
  stage: StageDto;
  cards: T[];
  manual: boolean;
  renderCard: (card: T, dragging: boolean) => ReactNode;
  onOpen: (card: T) => void;
  onManual: () => void;
  onAuto: () => void;
}

function Column<T extends KanbanItem>({
  stage,
  cards,
  manual,
  renderCard,
  onOpen,
  onManual,
  onAuto,
}: ColumnProps<T>) {
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
              <SortableItem key={card.id} id={card.id} onClick={() => onOpen(card)}>
                {renderCard(card, false)}
              </SortableItem>
            ))}
          </SortableContext>
        ) : (
          cards.map((card) => (
            <DraggableItem key={card.id} id={card.id} onClick={() => onOpen(card)}>
              {renderCard(card, false)}
            </DraggableItem>
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

interface ItemProps {
  id: number;
  onClick: () => void;
  children: ReactNode;
}

function DraggableItem({ id, onClick, children }: ItemProps) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={classes.item}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function SortableItem({ id, onClick, children }: ItemProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={classes.item}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
