import type { CommentDto, NewComment } from '@crm/shared';
import { Button, Group, SegmentedControl, Stack, Text, Textarea, Timeline } from '@mantine/core';
import { IconPhoneCall } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { formatDateTime } from '../../lib/format';

/** Поле карточки «подпись — значение». */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{children ?? '—'}</Text>
    </Stack>
  );
}

/** Ввод комментария или отметки о звонке (БТ-3.4.1). */
export function CommentBox({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (comment: NewComment, done: () => void) => void;
  pending: boolean;
  error?: string;
}) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'manual' | 'call'>('manual');

  return (
    <Stack gap="xs">
      <Textarea
        placeholder={kind === 'call' ? 'Итог звонка…' : 'Комментарий…'}
        autosize
        minRows={2}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        error={error}
      />
      <Group justify="space-between">
        <SegmentedControl
          size="xs"
          value={kind}
          onChange={(v) => setKind(v as 'manual' | 'call')}
          data={[
            { value: 'manual', label: 'Комментарий' },
            { value: 'call', label: 'Звонок' },
          ]}
        />
        <Button
          size="xs"
          disabled={!body.trim()}
          loading={pending}
          onClick={() =>
            onSubmit({ body, kind }, () => {
              setBody('');
              setKind('manual');
            })
          }
        >
          Добавить
        </Button>
      </Group>
    </Stack>
  );
}

/** Лента комментариев и системной истории карточки (БТ-3.4.2). */
export function History({ comments }: { comments: CommentDto[] }) {
  if (comments.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Записей пока нет
      </Text>
    );
  }
  return (
    <Timeline bulletSize={18} lineWidth={2}>
      {comments.map((c) => (
        <Timeline.Item
          key={c.id}
          color={c.kind === 'system' ? 'gray' : c.kind === 'call' ? 'teal' : 'indigo'}
          bullet={c.kind === 'call' ? <IconPhoneCall size={11} /> : undefined}
        >
          <Text
            size="sm"
            style={{ whiteSpace: 'pre-wrap' }}
            c={c.kind === 'system' ? 'dimmed' : undefined}
          >
            {c.body}
          </Text>
          <Text size="xs" c="dimmed">
            {c.authorName ?? 'Система'} · {formatDateTime(c.createdAt)}
          </Text>
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
