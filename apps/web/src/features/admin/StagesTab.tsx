import type { Pipeline, StageDto } from '@crm/shared';
import { ActionIcon, Alert, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useClientBoard } from '../clients/api';
import { useListingBoard } from '../listings/api';
import { useAddStage, useDeleteStage, useRenameStage, useReorderStages } from './api';
import { AddRow, OrderedList } from './OrderedList';

/** Этапы воронок (7.2). */
export function StagesTab() {
  const listings = useListingBoard();
  const clients = useClientBoard();
  return (
    <Stack>
      <Alert variant="light" color="gray">
        Правила переходов привязаны к системным этапам и сохраняются при переименовании. У новых
        этапов правил нет. Удалить можно только добавленный этап без карточек.
      </Alert>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <PipelineStages
          pipeline="listings"
          title="Воронка объявлений"
          stages={listings.data?.stages}
        />
        <PipelineStages pipeline="clients" title="Воронка клиентов" stages={clients.data?.stages} />
      </SimpleGrid>
    </Stack>
  );
}

function PipelineStages({
  pipeline,
  title,
  stages,
}: {
  pipeline: Pipeline;
  title: string;
  stages: StageDto[] | undefined;
}) {
  const add = useAddStage();
  const rename = useRenameStage();
  const reorder = useReorderStages();
  const remove = useDeleteStage();
  if (!stages) return null;

  return (
    <Stack gap="xs">
      <Title order={4}>{title}</Title>
      <OrderedList
        items={stages.map((s) => ({
          id: s.id,
          name: s.name,
          badges: [s.isSystem ? 'системный' : 'добавлен', ...(s.isTerminal ? ['финальный'] : [])],
        }))}
        onRename={(id, name) => rename.mutate({ id, name })}
        onReorder={(ids) => reorder.mutate({ pipeline, ids })}
        actions={(item) =>
          stages.find((s) => s.id === item.id)?.isSystem ? null : (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={`Удалить: ${item.name}`}
              onClick={() => remove.mutate(item.id)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          )
        }
      />
      <AddRow
        placeholder="Новый этап"
        pending={add.isPending}
        onAdd={(name) => add.mutate({ pipeline, name })}
      />
      <Text size="xs" c="dimmed">
        Новый этап встаёт перед финальными; порядок можно поменять стрелками.
      </Text>
    </Stack>
  );
}
