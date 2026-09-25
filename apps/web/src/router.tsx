import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { SectionPlaceholder } from './pages/SectionPlaceholder';

// Разделы грузятся по требованию — первый экран на мобильном интернете открывается быстрее.
const ClientsBoardPage = lazy(() =>
  import('./features/clients/ClientsBoardPage').then((m) => ({ default: m.ClientsBoardPage })),
);
const AdminPage = lazy(() =>
  import('./features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const CabinetPage = lazy(() =>
  import('./features/billing/CabinetPage').then((m) => ({ default: m.CabinetPage })),
);
const PartnersPage = lazy(() =>
  import('./features/partners/PartnersPage').then((m) => ({ default: m.PartnersPage })),
);
const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ListingsBoardPage = lazy(() =>
  import('./features/listings/ListingsBoardPage').then((m) => ({ default: m.ListingsBoardPage })),
);
const TablePage = lazy(() =>
  import('./features/table/TablePage').then((m) => ({ default: m.TablePage })),
);

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
      { path: 'cabinet', element: <CabinetPage /> },
      { path: 'partners', element: <PartnersPage /> },
      { path: 'admin', element: <AdminPage /> },
      { path: 'admin/:tab', element: <AdminPage /> },
      { path: '*', element: <SectionPlaceholder title="Страница не найдена" /> },
    ],
  },
]);
