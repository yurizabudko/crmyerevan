import { Navigate, createBrowserRouter } from 'react-router';
import { ClientsBoardPage } from './features/clients/ClientsBoardPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ListingsBoardPage } from './features/listings/ListingsBoardPage';
import { TablePage } from './features/table/TablePage';
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
      { path: 'clients', element: <ClientsBoardPage /> },
      { path: 'table', element: <TablePage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'admin/users', element: <UsersPage /> },
      { path: '*', element: <SectionPlaceholder title="Страница не найдена" /> },
    ],
  },
]);
