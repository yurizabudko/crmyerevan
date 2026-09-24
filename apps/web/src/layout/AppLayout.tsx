import { AppShell, Burger, Group, NavLink, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { NavLink as RouterNavLink, Outlet } from 'react-router';
import { SECTIONS } from '../sections';

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Меню" />
          <Title order={4}>CRM</Title>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {SECTIONS.map(({ path, title, icon: Icon }) => (
          <NavLink
            key={path}
            component={RouterNavLink}
            to={path}
            label={title}
            leftSection={<Icon size={18} stroke={1.6} />}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
