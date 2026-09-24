import { LINK_STATUS_LABELS, type ListingDetailsDto, type UserDto } from '@crm/shared';
import { Badge, Button, Card, Group, Loader, Stack, Text } from '@mantine/core';
import { NestedModal } from '../../components/NestedModal';
import { notifications } from '@mantine/notifications';
import { IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { formatPrice } from '../../lib/format';
import { useAddLink, useListingMatches } from './api';

/**
 * Клиенты в карточке объявления (БТ-4.4.2): кому предлагали объект, и подбор клиентов
 * по параметрам объекта (БТ-3.2.2).
 */
export function ListingClients({ listing, me }: { listing: ListingDetailsDto; me: UserDto }) {
  const [matching, setMatching] = useState(false);
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Клиенты ({listing.links.length})
        </Text>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconUsers size={14} />}
          onClick={() => setMatching(true)}
          disabled={listing.price === null}
          title={listing.price === null ? 'Укажите цену объекта для подбора' : undefined}
        >
          Подходящие клиенты
        </Button>
      </Group>
      {listing.links.length === 0 && (
        <Text size="sm" c="dimmed">
          {me.role === 'partner'
            ? 'Вашим клиентам объект не предлагался'
            : 'Объект никому не предлагался'}
        </Text>
      )}
      {listing.links.map((link) => (
        <Group key={link.id} justify="space-between" wrap="nowrap">
          <Text size="sm" truncate>
            {link.client?.name}
          </Text>
          <Badge variant="light" color={link.status === 'chosen' ? 'green' : 'gray'}>
            {LINK_STATUS_LABELS[link.status]}
          </Badge>
        </Group>
      ))}
      <ClientMatchesModal listing={listing} opened={matching} onClose={() => setMatching(false)} />
    </Stack>
  );
}

function ClientMatchesModal({
  listing,
  opened,
  onClose,
}: {
  listing: ListingDetailsDto;
  opened: boolean;
  onClose: () => void;
}) {
  const matches = useListingMatches(listing.id, opened);
  const add = useAddLink();
  return (
    <NestedModal opened={opened} onClose={onClose} title="Подходящие клиенты" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Бюджет покрывает {formatPrice(listing.price, listing.currency)}, район и тип объекта
          подходят.
        </Text>
        {matches.isFetching && <Loader size="sm" />}
        {matches.data?.length === 0 && (
          <Text size="sm" c="dimmed">
            Подходящих клиентов нет
          </Text>
        )}
        {matches.data?.map(({ client }) =>
          client ? (
            <Card key={client.id} withBorder padding="xs" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate>
                    {client.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {[
                      client.budgetMax !== null
                        ? `до ${formatPrice(client.budgetMax, client.currency)}`
                        : null,
                      client.phone,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Stack>
                <Button
                  size="xs"
                  loading={add.isPending && add.variables?.clientId === client.id}
                  onClick={() =>
                    add.mutate(
                      { clientId: client.id, listingId: listing.id },
                      {
                        onSuccess: () =>
                          notifications.show({
                            color: 'green',
                            message: `Объект добавлен в подборку «${client.name}»`,
                          }),
                        onError: (e) => notifications.show({ color: 'red', message: e.message }),
                      },
                    )
                  }
                >
                  Предложить
                </Button>
              </Group>
            </Card>
          ) : null,
        )}
      </Stack>
    </NestedModal>
  );
}
