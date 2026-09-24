import { Navigate, createBrowserRouter } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { SectionPlaceholder } from './pages/SectionPlaceholder';
import { SECTIONS } from './sections';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/listings" replace /> },
      ...SECTIONS.map(({ path, title }) => ({
        path,
        element: <SectionPlaceholder title={title} />,
      })),
      { path: '*', element: <SectionPlaceholder title="Страница не найдена" /> },
    ],
  },
]);
