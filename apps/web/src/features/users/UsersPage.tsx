import { CreateUserRequest, can, creatableRoles, type Role, type UserDto } from '@crm/shared';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Loader,
  Menu,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useMe } from '../../auth/useAuth';
import { formatDateTime } from '../../lib/format';
import { issuesToErrors, zodValidate } from '../../lib/zodForm';
import {
  generateTemporaryPassword,
  useCreateUser,
  useResetPassword,
  useSetBlocked,
  useSetPermissions,
  useUsers,
} from './api';

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Владелец',
  employee: 'Сотрудник',
  partner: 'Партнёр',
};

/** Раздел «Пользователи» (7.1). */
export function UsersPage() {
  const { data: me } = useMe();
  const users = useUsers();
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<{ login: string; password: string } | null>(null);
  const [permsFor, setPermsFor] = useState<UserDto | null>(null);
  if (!me) return null;

  const byId = new Map(users.data?.map((u) => [u.id, u]));

  return (
    <Stack>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
          Добавить
        </Button>
      </Group>

      {users.isPending && <Loader />}
      {users.error && <Alert color="red">{users.error.message}</Alert>}
      {users.data && (
        <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Логин</Table.Th>
                <Table.Th>Имя</Table.Th>
                <Table.Th>Роль</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th>Создан</Table.Th>
                <Table.Th>Кем</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.data.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td>{u.login}</Table.Td>
                  <Table.Td>{u.displayName}</Table.Td>
                  <Table.Td>{ROLE_LABEL[u.role]}</Table.Td>
                  <Table.Td>
                    <Badge color={u.status === 'active' ? 'green' : 'red'} variant="light">
                      {u.status === 'active' ? 'активен' : 'заблокирован'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatDateTime(u.createdAt)}</Table.Td>
                  <Table.Td>
                    {u.createdById ? (byId.get(u.createdById)?.login ?? '—') : '—'}
                  </Table.Td>
                  <Table.Td>
                    {u.id !== me.id && (
                      <UserActions
                        user={u}
                        me={me}
                        onPasswordIssued={setIssued}
                        onEditPerms={setPermsFor}
                      />
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <CreateUserModal
        opened={creating}
        me={me}
        onClose={() => setCreating(false)}
        onCreated={setIssued}
      />
      <PermissionsModal user={permsFor} onClose={() => setPermsFor(null)} />
      <Modal opened={issued !== null} onClose={() => setIssued(null)} title="Временный пароль">
        {issued && (
          <Stack>
            <Text size="sm">
              Передайте пользователю <b>{issued.login}</b> временный пароль. При первом входе
              система попросит его сменить. Повторно пароль не показывается.
            </Text>
            <Group>
              <Code fz="lg">{issued.password}</Code>
              <CopyButton value={issued.password}>
                {({ copied, copy }) => (
                  <Button size="xs" variant="light" onClick={copy}>
                    {copied ? 'Скопировано' : 'Копировать'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

function UserActions({
  user,
  me,
  onPasswordIssued,
  onEditPerms,
}: {
  user: UserDto;
  me: UserDto;
  onPasswordIssued: (v: { login: string; password: string }) => void;
  onEditPerms: (u: UserDto) => void;
}) {
  const setBlocked = useSetBlocked();
  const reset = useResetPassword();
  const blocked = user.status === 'blocked';
  const canBlock = user.role !== 'owner' || me.role === 'owner';
  const fail = (e: Error) => notifications.show({ color: 'red', message: e.message });

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label="Действия">
          <IconDots size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {canBlock && (
          <Menu.Item
            color={blocked ? undefined : 'red'}
            onClick={() => setBlocked.mutate({ id: user.id, blocked: !blocked }, { onError: fail })}
          >
            {blocked ? 'Разблокировать' : 'Заблокировать'}
          </Menu.Item>
        )}
        {can.resetPassword(me) && (
          <Menu.Item
            onClick={() => {
              const password = generateTemporaryPassword();
              reset.mutate(
                { id: user.id, temporaryPassword: password },
                {
                  onSuccess: () => onPasswordIssued({ login: user.login, password }),
                  onError: fail,
                },
              );
            }}
          >
            Сбросить пароль
          </Menu.Item>
        )}
        {can.setPermissions(me) && user.role === 'employee' && (
          <Menu.Item onClick={() => onEditPerms(user)}>Права</Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

const PERM_LABELS = {
  grantAccess: 'Выдача доступов (раздел «Пользователи»)',
  deleteCards: 'Удаление карточек',
  manageDictionaries: 'Управление воронками и справочниками',
} as const;

function CreateUserModal({
  opened,
  me,
  onClose,
  onCreated,
}: {
  opened: boolean;
  me: UserDto;
  onClose: () => void;
  onCreated: (v: { login: string; password: string }) => void;
}) {
  const create = useCreateUser();
  const roles = creatableRoles(me);
  const initial = () => ({
    login: '',
    displayName: '',
    role: (roles.includes('employee') ? 'employee' : roles[0]) as Role,
    temporaryPassword: generateTemporaryPassword(),
    perms: { grantAccess: false, deleteCards: false, manageDictionaries: false },
  });
  const form = useForm({ initialValues: initial(), validate: zodValidate(CreateUserRequest) });

  const close = () => {
    form.setValues(initial());
    form.clearErrors();
    create.reset();
    onClose();
  };

  const submit = form.onSubmit((values) => {
    create.mutate(CreateUserRequest.parse(values), {
      onSuccess: (user) => {
        onCreated({ login: user.login, password: values.temporaryPassword });
        close();
      },
      onError: (e) => {
        if (e instanceof ApiError && e.body.issues) form.setErrors(issuesToErrors(e.body.issues));
      },
    });
  });

  return (
    <Modal opened={opened} onClose={close} title="Новый пользователь">
      <form onSubmit={submit}>
        <Stack>
          {create.error && <Alert color="red">{create.error.message}</Alert>}
          <TextInput
            label="Логин"
            autoCapitalize="none"
            withAsterisk
            {...form.getInputProps('login')}
          />
          <TextInput label="Имя" withAsterisk {...form.getInputProps('displayName')} />
          <Select
            label="Роль"
            data={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            allowDeselect={false}
            {...form.getInputProps('role')}
          />
          <TextInput
            label="Временный пароль"
            description="Пользователь сменит его при первом входе"
            {...form.getInputProps('temporaryPassword')}
          />
          {can.setPermissions(me) && form.values.role === 'employee' && (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Права сотрудника
              </Text>
              {(Object.keys(PERM_LABELS) as (keyof typeof PERM_LABELS)[]).map((key) => (
                <Checkbox
                  key={key}
                  label={PERM_LABELS[key]}
                  {...form.getInputProps(`perms.${key}`, { type: 'checkbox' })}
                />
              ))}
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Отмена
            </Button>
            <Button type="submit" loading={create.isPending}>
              Создать
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function PermissionsModal({ user, onClose }: { user: UserDto | null; onClose: () => void }) {
  const setPerms = useSetPermissions();
  const [perms, setLocal] = useState(user?.perms);
  const current = perms ?? user?.perms;

  return (
    <Modal
      opened={user !== null}
      onClose={() => {
        setLocal(undefined);
        onClose();
      }}
      title={`Права: ${user?.displayName ?? ''}`}
    >
      {user && current && (
        <Stack>
          {(Object.keys(PERM_LABELS) as (keyof typeof PERM_LABELS)[]).map((key) => (
            <Checkbox
              key={key}
              label={PERM_LABELS[key]}
              checked={current[key]}
              onChange={(e) => setLocal({ ...current, [key]: e.currentTarget.checked })}
            />
          ))}
          <Group justify="flex-end">
            <Button
              loading={setPerms.isPending}
              onClick={() =>
                setPerms.mutate(
                  { id: user.id, perms: current },
                  {
                    onSuccess: () => {
                      setLocal(undefined);
                      onClose();
                    },
                    onError: (e) => notifications.show({ color: 'red', message: e.message }),
                  },
                )
              }
            >
              Сохранить
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
