import type { ClientDto, DictionariesDto } from '@crm/shared';
import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useMe } from '../../auth/useAuth';
import { KanbanBoard } from '../../components/kanban/KanbanBoard';
import { formatPrice } from '../../lib/format';
import { useDictionaries } from '../listings/api';
import { AddClientModal } from './AddClientModal';
import { useClientBoard } from './api';
import { ClientDrawer } from './ClientDrawer';
import { ClientStageModal, type PendingClientMove } from './ClientStageModal';

/** Воронка клиентов (раздел 4). Просроченные карточки подсвечены (БТ-4.2.1). */
export function ClientsBoardPage() {
  const { data: me } = useMe();
  const board = useClientBoard();
  const dicts = useDictionaries();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editRequested, setEditRequested] = useState(false);
  const [move, setMove] = useState<PendingClientMove | null>(null);
  const overdue = board.data?.cards.filter((c) => c.isOverdue).length ?? 0;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Title order={2}>Воронка клиентов</Title>
          {overdue > 0 && (
            <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />}>
              просрочено: {overdue}
            </Badge>
          )}
        </Group>
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
          prefsKey="clients.board"
          renderCard={(card) => <ClientCard card={card} dicts={dicts.data} />}
          onOpen={(card) => setOpenId(card.id)}
          onMove={(client, from, to) => setMove({ client, from, to })}
        />
      )}

      <AddClientModal opened={adding} onClose={() => setAdding(false)} onOpenClient={setOpenId} />
      <ClientDrawer
        clientId={openId}
        editRequested={editRequested}
        onEditHandled={() => setEditRequested(false)}
        onClose={() => setOpenId(null)}
        onMove={setMove}
      />
      {me && (
        <ClientStageModal
          move={move}
          me={me}
          onClose={() => setMove(null)}
          onEdit={(id) => {
            setOpenId(id);
            setEditRequested(true);
          }}
        />
      )}
    </Stack>
  );
}

function ClientCard({ card, dicts }: { card: ClientDto; dicts: DictionariesDto | undefined }) {
  const districts = card.districtIds
    .map((id) => dicts?.district.find((d) => d.id === id)?.name)
    .filter(Boolean);
  const budget = card.budgetMax ?? card.budgetMin;

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      aria-label={card.name}
      style={card.isOverdue ? { borderColor: 'var(--mantine-color-red-5)' } : undefined}
    >
      <Group justify="space-between" wrap="nowrap" gap={4}>
        <Text fw={500} size="sm" truncate>
          {card.name}
        </Text>
        {card.isOverdue && (
          <Badge size="xs" color="red" variant="light">
            просрочено
          </Badge>
        )}
      </Group>
      {budget !== null && (
        <Text size="sm" fw={600} mt={4}>
          {card.budgetMax !== null ? 'до ' : 'от '}
          {formatPrice(budget, card.currency)}
        </Text>
      )}
      <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
        {[card.phone, districts.join(', ') || null].filter(Boolean).join(' · ')}
      </Text>
      {card.showingsCount > 0 && (
        <Badge size="xs" variant="light" mt={6}>
          показов: {card.showingsCount}
        </Badge>
      )}
    </Card>
  );
}
