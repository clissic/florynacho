import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router-dom';
import { ApiProvider } from './lib/api';
import { AdminLoginPage, AdminPage } from './pages/AdminPages';
import { GestionPage } from './pages/GestionPage';
import { HomePage, InvitePage, PreviewPage } from './pages/publicPages';

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/i/:token', element: <InvitePage /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '/gestion', element: <GestionPage /> },
  { path: '/validar/:token', element: <ValidateRedirect /> },
  { path: '/admin/preview', element: <PreviewPage /> },
  { path: '*', element: <MissingPage /> },
]);

function ValidateRedirect() {
  const { token = '' } = useParams();
  const safe = /^[a-f0-9]{32}$/i.test(token) ? token : '';
  return <Navigate to={safe ? `/gestion?entrada=${safe}` : '/gestion'} replace />;
}

function MissingPage() {
  return (
    <main className="notice">
      <p className="eyebrow">Florencia & Ignacio</p>
      <h1>No encontramos esta página</h1>
      <p>
        <a href="/">Volver al inicio</a>
      </p>
    </main>
  );
}

export function App() {
  return (
    <ApiProvider>
      <RouterProvider router={router} />
    </ApiProvider>
  );
}
