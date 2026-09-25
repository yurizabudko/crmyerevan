import { AppShell, Burger, Button, Group, Loader, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLogout } from '@tabler/icons-react';
import { ACCESS_STATUSES } from '@crm/shared';
import { Suspense } from 'react';
import { Navigate, NavLink as RouterNavLink, Outlet, useLocation } from 'react-router';
import { useLogout, useMe } from '../auth/useAuth';
import { useSubscription } from '../features/billing/api';
import { SECTIONS } from '../sections';

const ROLE_LABEL = { owner: 'Владелец', employee: 'Сотрудник', partner: 'Партнёр' } as const;

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { data: user } = useMe();
  const logout = useLogout();
  const { pathname } = useLocation();
  const isPartner = user?.role === 'partner';
  const subscription = useSubscription(isPartner);
  if (!user) return null;
  if (isPartner && subscription.isPending) return null;

  // Без активной подписки партнёру доступен только личный кабинет (8.1).
  const locked = isPartner && !ACCESS_STATUSES.includes(subscription.data?.status ?? 'none');
  if (locked && pathname !== '/cabinet') return <Navigate to="/cabinet" replace />;
  const sections = SECTIONS.filter((s) => s.visible(user) && (!locked || s.path === '/cabinet'));

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
          {sections.map(({ path, title, icon: Icon }) => (
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
        <Suspense fallback={<Loader m="md" />}>
          <Outlet />
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
}
