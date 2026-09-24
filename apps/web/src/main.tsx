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

// Сессия истекла или пользователя заблокировали — возвращаем на экран входа.
queryClient.getQueryCache().subscribe((event) => {
  const error = event.query.state.error;
  if (event.type === 'updated' && error instanceof ApiError) {
    if (error.status === 401) queryClient.setQueryData(ME_KEY, null);
    if (error.code === 'PASSWORD_CHANGE_REQUIRED')
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
  }
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
