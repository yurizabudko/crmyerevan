import { AppShell, Burger, Button, Group, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLogout } from '@tabler/icons-react';
import { NavLink as RouterNavLink, Outlet } from 'react-router';
import { useLogout, useMe } from '../auth/useAuth';
import { SECTIONS } from '../sections';

const ROLE_LABEL = { owner: 'Владелец', employee: 'Сотрудник', partner: 'Партнёр' } as const;

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { data: user } = useMe();
  const logout = useLogout();
  if (!user) return null;

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Меню" />
            <Title order={4}>CRM</Title>
          </Group>
          <Text size="sm" c="dimmed" truncate visibleFrom="xs">
            {user.displayName} · {ROLE_LABEL[user.role]}
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow>
          {SECTIONS.filter((s) => s.visible(user)).map(({ path, title, icon: Icon }) => (
            <NavLink
              key={path}
              component={RouterNavLink}
              to={path}
              label={title}
              leftSection={<Icon size={18} stroke={1.6} />}
              onClick={close}
            />
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <Button
            variant="subtle"
            color="gray"
            fullWidth
            justify="flex-start"
            leftSection={<IconLogout size={18} />}
            loading={logout.isPending}
            onClick={() => logout.mutate()}
          >
            Выйти
          </Button>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
