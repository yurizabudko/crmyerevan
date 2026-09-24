import {
  LINK_STATUS_LABELS,
  type ClientDetailsDto,
  type ClientListingLinkDto,
  type DictionariesDto,
} from '@crm/shared';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { NestedModal } from '../../components/NestedModal';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSearch, IconSparkles, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { formatDateTime, formatPrice, yerevanInputToIso } from '../../lib/format';
import { useDictionaries } from '../listings/api';
import { useAddLink, useClientMatches, useRemoveLink, useUpdateLink } from './api';

const STATUS_OPTIONS = Object.entries(LINK_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const STATUS_COLOR: Record<string, string> = {
  proposed: 'gray',
  showing_scheduled: 'blue',
  shown: 'indigo',
  client_rejected: 'red',
  chosen: 'green',
};

/** Подборка клиента (БТ-4.4): объекты со статусами, показы, автоподбор. */
export function Selection({ client }: { client: ClientDetailsDto }) {
  const dicts = useDictionaries();
  const update = useUpdateLink();
  const remove = useRemoveLink();
  const [matching, setMatching] = useState(false);
  const [scheduling, setScheduling] = useState<ClientListingLinkDto | null>(null);
  const [showingAt, setShowingAt] = useState('');

  const fail = (e: Error) => notifications.show({ color: 'red', message: e.message });
  const setStatus = (link: ClientListingLinkDto, status: string) => {
    if (status === 'showing_scheduled') {
      setScheduling(link);
      return;
    }
    update.mutate(
      { clientId: client.id, linkId: link.id, update: { status: status as never } },
      { onError: fail },
    );
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Подборка ({client.links.length})
        </Text>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconSparkles size={14} />}
          onClick={() => setMatching(true)}
        >
          Подобрать объекты
        </Button>
      </Group>
      {client.links.length === 0 && (
        <Text size="sm" c="dimmed">
          Объекты ещё не предлагались
        </Text>
      )}
      {client.links.map((link) => (
        <Card key={link.id} withBorder padding="xs" radius="md">
          <Group wrap="nowrap" gap="sm" align="flex-start">
            {link.listing?.coverPhotoId ? (
              <Image
                src={`/api/photos/${link.listing.coverPhotoId}?size=thumb`}
                w={64}
                h={48}
                radius="sm"
                fit="cover"
                alt=""
              />
            ) : null}
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {link.listing?.title ?? 'Объект удалён'}
              </Text>
              <Text size="xs" c="dimmed">
                {[
                  link.listing ? formatPrice(link.listing.price, link.listing.currency) : null,
                  districtName(dicts.data, link.listing?.districtId ?? null),
                  link.showingAt ? `показ ${formatDateTime(link.showingAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Select
                size="xs"
                w={180}
                data={STATUS_OPTIONS}
                value={link.status}
                allowDeselect={false}
                aria-label="Статус объекта в подборке"
                onChange={(v) => v && v !== link.status && setStatus(link, v)}
                styles={{ input: { color: `var(--mantine-color-${STATUS_COLOR[link.status]}-7)` } }}
              />
            </Stack>
            {link.status !== 'chosen' && (
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Убрать из подборки"
                onClick={() =>
                  remove.mutate({ clientId: client.id, linkId: link.id }, { onError: fail })
                }
              >
                <IconX size={16} />
              </ActionIcon>
            )}
          </Group>
        </Card>
      ))}

      <MatchesModal clientId={client.id} opened={matching} onClose={() => setMatching(false)} />
      <NestedModal
        opened={scheduling !== null}
        onClose={() => setScheduling(null)}
        title="Назначить показ"
      >
        <Stack>
          <Text size="sm">{scheduling?.listing?.title}</Text>
          <TextInput
            label="Дата и время показа"
            description="Время Еревана"
            type="datetime-local"
            value={showingAt}
            onChange={(e) => setShowingAt(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setScheduling(null)}>
              Отмена
            </Button>
            <Button
              disabled={!showingAt}
              loading={update.isPending}
              onClick={() =>
                scheduling &&
                update.mutate(
                  {
                    clientId: client.id,
                    linkId: scheduling.id,
                    update: {
                      status: 'showing_scheduled',
                      showingAt: yerevanInputToIso(showingAt),
                    },
                  },
                  {
                    onSuccess: () => {
                      setScheduling(null);
                      setShowingAt('');
                    },
                    onError: fail,
                  },
                )
              }
            >
              Назначить
            </Button>
          </Group>
        </Stack>
      </NestedModal>
    </Stack>
  );
}

function districtName(dicts: DictionariesDto | undefined, id: number | null) {
  return id === null ? null : (dicts?.district.find((d) => d.id === id)?.name ?? null);
}

/** Автоподбор по параметрам клиента или поиск по названию. */
function MatchesModal({
  clientId,
  opened,
  onClose,
}: {
  clientId: number;
  opened: boolean;
  onClose: () => void;
}) {
  const dicts = useDictionaries();
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q.trim(), 300);
  const matches = useClientMatches(clientId, debounced, opened);
  const add = useAddLink();

  return (
    <NestedModal opened={opened} onClose={onClose} title="Подбор объектов" size="lg">
      <Stack>
        <TextInput
          placeholder="Поиск по названию — или оставьте пустым для подбора по параметрам"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        {matches.isFetching && <Loader size="sm" />}
        {matches.data?.length === 0 && (
          <Text size="sm" c="dimmed">
            {debounced
              ? 'Ничего не найдено'
              : 'Подходящих объектов нет. Проверьте бюджет, районы и тип объекта в карточке клиента.'}
          </Text>
        )}
        {matches.data?.map(({ listing, reasons }) =>
          listing ? (
            <Card key={listing.id} withBorder padding="xs" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate>
                    {listing.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {[
                      formatPrice(listing.price, listing.currency),
                      listing.rooms !== null ? `${listing.rooms} комн.` : null,
                      districtName(dicts.data, listing.districtId),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Group gap={4}>
                    {reasons.map((r) => (
                      <Badge key={r} size="xs" variant="light" color="teal">
                        {r}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
                <Button
                  size="xs"
                  loading={add.isPending && add.variables?.listingId === listing.id}
                  onClick={() =>
                    add.mutate(
                      { clientId, listingId: listing.id },
                      { onError: (e) => notifications.show({ color: 'red', message: e.message }) },
                    )
                  }
                >
                  В подборку
                </Button>
              </Group>
            </Card>
          ) : null,
        )}
      </Stack>
    </NestedModal>
  );
}
