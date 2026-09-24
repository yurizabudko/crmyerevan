import { can, type UserDto } from '@crm/shared';
import { Stack, Tabs, Title } from '@mantine/core';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useMe } from '../../auth/useAuth';
import { UsersPage } from '../users/UsersPage';
import { AuditTab } from './AuditTab';
import { DictionariesTab } from './DictionariesTab';
import { ParserTab } from './ParserTab';
import { StagesTab } from './StagesTab';

interface AdminTab {
  value: string;
  label: string;
  allowed: (u: UserDto) => boolean;
  render: () => React.ReactNode;
}

/** Вкладки раздела 7 и кто их видит. */
const TABS: AdminTab[] = [
  { value: 'users', label: 'Пользователи', allowed: can.manageUsers, render: () => <UsersPage /> },
  {
    value: 'stages',
    label: 'Воронки',
    allowed: can.manageDictionaries,
    render: () => <StagesTab />,
  },
  {
    value: 'dictionaries',
    label: 'Справочники',
    allowed: can.manageDictionaries,
    render: () => <DictionariesTab />,
  },
  { value: 'parser', label: 'Парсер', allowed: can.manageParser, render: () => <ParserTab /> },
  { value: 'audit', label: 'Журнал', allowed: can.viewAudit, render: () => <AuditTab /> },
];

export function AdminPage() {
  const { data: me } = useMe();
  const { tab } = useParams();
  const navigate = useNavigate();
  if (!me) return null;

  const tabs = TABS.filter((t) => t.allowed(me));
  const current = tabs.find((t) => t.value === tab);
  if (!current) {
    return tabs[0] ? (
      <Navigate to={`/admin/${tabs[0].value}`} replace />
    ) : (
      <Navigate to="/" replace />
    );
  }

  return (
    <Stack>
      <Title order={2}>Администрирование</Title>
      <Tabs
        value={current.value}
        onChange={(v) => v && navigate(`/admin/${v}`)}
        keepMounted={false}
      >
        <Tabs.List>
          {tabs.map((t) => (
            <Tabs.Tab key={t.value} value={t.value}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {tabs.map((t) => (
          <Tabs.Panel key={t.value} value={t.value} pt="md">
            {t.render()}
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
}
