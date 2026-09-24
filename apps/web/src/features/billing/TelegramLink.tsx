import { Anchor, Button, Code, Stack, Text } from '@mantine/core';
import { IconBrandTelegram } from '@tabler/icons-react';
import { useTelegramLink } from './api';

/** Привязка Telegram для уведомлений (БТ-8.3.3): одноразовая ссылка на бота. */
export function TelegramLink({ linked }: { linked: boolean }) {
  const link = useTelegramLink();
  return (
    <Stack gap="xs">
      <Text size="sm">
        {linked
          ? 'Telegram привязан — уведомления о списаниях и выплатах приходят туда.'
          : 'Привяжите Telegram, чтобы получать уведомления о списаниях, ошибках оплаты и выплатах.'}
      </Text>
      <Button
        variant="light"
        leftSection={<IconBrandTelegram size={18} />}
        loading={link.isPending}
        onClick={() => link.mutate()}
        w="fit-content"
      >
        {linked ? 'Привязать заново' : 'Привязать Telegram'}
      </Button>
      {link.data &&
        (link.data.url ? (
          <Text size="sm">
            Откройте ссылку и нажмите «Запустить»:{' '}
            <Anchor href={link.data.url} target="_blank" rel="noreferrer">
              {link.data.url}
            </Anchor>
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Бот ещё не настроен. Когда администратор подключит бота, отправьте ему команду{' '}
            <Code>/start {link.data.token}</Code>
          </Text>
        ))}
    </Stack>
  );
}
