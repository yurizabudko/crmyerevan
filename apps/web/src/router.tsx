import { Navigate, createBrowserRouter } from 'react-router';
import { ClientsBoardPage } from './features/clients/ClientsBoardPage';
import { AdminPage } from './features/admin/AdminPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ListingsBoardPage } from './features/listings/ListingsBoardPage';
import { TablePage } from './features/table/TablePage';
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
      { path: 'admin', element: <AdminPage /> },
      { path: 'admin/:tab', element: <AdminPage /> },
      { path: '*', element: <SectionPlaceholder title="Страница не найдена" /> },
    ],
  },
]);
