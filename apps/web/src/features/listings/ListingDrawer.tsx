import type { CommentDto } from '@crm/shared';
import {
  Alert,
  Anchor,
  Badge,
  Divider,
  Drawer,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Timeline,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { ReactNode } from 'react';
import { formatDateTime, formatPrice } from '../../lib/format';
import { useDictionaries, useListing } from './api';

/** Карточка объявления (п. 3.4). Редактирование и смена этапа — следующим шагом этапа 2. */
export function ListingDrawer({
  listingId,
  onClose,
}: {
  listingId: number | null;
  onClose: () => void;
}) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const listing = useListing(listingId);
  const dicts = useDictionaries();
  const l = listing.data;

  const name = (kind: 'district' | 'property_type', id: number | null) =>
    dicts.data?.[kind].find((d) => d.id === id)?.name ?? null;

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
      {l && (
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

          <SimpleGrid cols={2} spacing="xs">
            <Field label="Район">{name('district', l.districtId)}</Field>
            <Field label="Тип">{name('property_type', l.propertyTypeId)}</Field>
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

          <Divider label="История" labelPosition="left" />
          <History comments={l.comments} />
        </Stack>
      )}
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{children ?? '—'}</Text>
    </Stack>
  );
}

function History({ comments }: { comments: CommentDto[] }) {
  if (comments.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Записей пока нет
      </Text>
    );
  }
  return (
    <Timeline bulletSize={10} lineWidth={2}>
      {comments.map((c) => (
        <Timeline.Item key={c.id} color={c.kind === 'system' ? 'gray' : 'indigo'}>
          <Text size="sm">{c.body}</Text>
          {c.field && (
            <Text size="xs" c="dimmed">
              {c.field}: {c.oldValue ?? '—'} → {c.newValue ?? '—'}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {formatDateTime(c.createdAt)}
          </Text>
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
