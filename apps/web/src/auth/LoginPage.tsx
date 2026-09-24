import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useLogin } from './useAuth';

export function LoginPage() {
  const login = useLogin();
  const form = useForm({
    initialValues: { login: '', password: '' },
    validate: {
      login: (v) => (v.trim() ? null : 'Введите логин'),
      password: (v) => (v ? null : 'Введите пароль'),
    },
  });

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={380}>
        <form onSubmit={form.onSubmit((values) => login.mutate(values))}>
          <Stack>
            <Title order={3}>Вход в CRM</Title>
            {login.error && <Alert color="red">{login.error.message}</Alert>}
            <TextInput
              label="Логин"
              autoComplete="username"
              autoCapitalize="none"
              {...form.getInputProps('login')}
            />
            <PasswordInput
              label="Пароль"
              autoComplete="current-password"
              {...form.getInputProps('password')}
            />
            <Button type="submit" loading={login.isPending}>
              Войти
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
