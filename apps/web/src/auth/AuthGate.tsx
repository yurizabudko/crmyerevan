import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { ChangePasswordPage } from './ChangePasswordPage';
import { LoginPage } from './LoginPage';
import { useMe } from './useAuth';

/** Показывает приложение только после входа и смены временного пароля. */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) {
    return (
      <Center mih="100dvh">
        <Loader />
      </Center>
    );
  }
  if (!me.data) return <LoginPage />;
  if (me.data.mustChangePassword) return <ChangePasswordPage />;
  return children;
}
