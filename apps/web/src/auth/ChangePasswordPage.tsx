import { ChangePasswordRequest } from '@crm/shared';
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodValidate } from '../lib/zodForm';
import { useChangePassword, useLogout } from './useAuth';

/** Обязательная смена временного пароля при первом входе (БТ-2.4.3). */
export function ChangePasswordPage() {
  const change = useChangePassword();
  const logout = useLogout();
  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '', repeat: '' },
    validate: (values) => ({
      ...zodValidate(ChangePasswordRequest)(values),
      ...(values.repeat !== values.newPassword ? { repeat: 'Пароли не совпадают' } : {}),
    }),
  });

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={400}>
        <form
          onSubmit={form.onSubmit(({ currentPassword, newPassword }) =>
            change.mutate({ currentPassword, newPassword }),
          )}
        >
          <Stack>
            <Title order={3}>Смена пароля</Title>
            <Text size="sm" c="dimmed">
              Вы вошли с временным паролем. Придумайте новый: не короче 8 символов, с буквами и
              цифрами.
            </Text>
            {change.error && <Alert color="red">{change.error.message}</Alert>}
            <PasswordInput
              label="Временный пароль"
              autoComplete="current-password"
              {...form.getInputProps('currentPassword')}
            />
            <PasswordInput
              label="Новый пароль"
              autoComplete="new-password"
              {...form.getInputProps('newPassword')}
            />
            <PasswordInput
              label="Повторите пароль"
              autoComplete="new-password"
              {...form.getInputProps('repeat')}
            />
            <Button type="submit" loading={change.isPending}>
              Сохранить
            </Button>
            <Button variant="subtle" color="gray" onClick={() => logout.mutate()}>
              Выйти
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
