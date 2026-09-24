import { Navigate, createBrowserRouter } from 'react-router';
import { ListingsBoardPage } from './features/listings/ListingsBoardPage';
import { UsersPage } from './features/users/UsersPage';
import { AppLayout } from './layout/AppLayout';
import { SectionPlaceholder } from './pages/SectionPlaceholder';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/listings" replace /> },
      { path: 'listings', element: <ListingsBoardPage /> },
      { path: 'clients', element: <SectionPlaceholder title="Воронка клиентов" /> },
      { path: 'table', element: <SectionPlaceholder title="Таблица" /> },
      { path: 'dashboard', element: <SectionPlaceholder title="Дашборд" /> },
      { path: 'admin/users', element: <UsersPage /> },
      { path: '*', element: <SectionPlaceholder title="Страница не найдена" /> },
    ],
  },
]);
