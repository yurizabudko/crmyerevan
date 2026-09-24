import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ApiError } from './api/client';
import { AuthGate } from './auth/AuthGate';
import { OpenModalsProvider } from './components/NestedModal';
import { ME_KEY } from './auth/useAuth';
import { router } from './router';

const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    },
  },
});

function handleApiError(error: unknown) {
  if (!(error instanceof ApiError)) return;
  // Сессия истекла или пользователя заблокировали — возвращаем на экран входа.
  if (error.status === 401) queryClient.setQueryData(ME_KEY, null);
  if (error.code === 'PASSWORD_CHANGE_REQUIRED')
    void queryClient.invalidateQueries({ queryKey: ME_KEY });
  // Подписка партнёра закончилась — AppLayout переведёт его в личный кабинет.
  if (error.code === 'SUBSCRIPTION_REQUIRED')
    void queryClient.invalidateQueries({ queryKey: ['subscription'] });
}

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated') handleApiError(event.query.state.error);
});
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === 'updated') handleApiError(event.mutation?.state.error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-center" />
      <QueryClientProvider client={queryClient}>
        <OpenModalsProvider>
          <AuthGate>
            <RouterProvider router={router} />
          </AuthGate>
        </OpenModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
