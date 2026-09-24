import { Stack, Text, Title } from '@mantine/core';

export function SectionPlaceholder({ title }: { title: string }) {
  return (
    <Stack gap="xs">
      <Title order={2}>{title}</Title>
      <Text c="dimmed">Раздел в разработке.</Text>
    </Stack>
  );
}
