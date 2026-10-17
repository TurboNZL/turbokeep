import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, ApiError } from './lib/api.ts';
import { useStore } from './lib/store.ts';
import { Layout } from './components/Layout.tsx';
import { LoginPage } from './pages/Login.tsx';
import { HomePage } from './pages/Home.tsx';
import { ShelfPage } from './pages/Shelf.tsx';
// Settings (the theme catalogue, the guides, import and export) is only fetched when someone opens it: Home loads without it
const SettingsPage = lazy(() => import('./pages/Settings.tsx').then((m) => ({ default: m.SettingsPage })));

export function App() {
  const auth = useStore((s) => s.auth);
  const setUser = useStore((s) => s.setUser);
  const refreshMeta = useStore((s) => s.refreshMeta);
  useEffect(() => {
    // Opened as the remembered person already; the server confirms. Only a refusal (or nobody remembered) shows the sign-in page: a server that cannot be reached keeps the remembered list on screen.
    api.me().then((r) => setUser(r.user), (e) => { if (e instanceof ApiError && e.status !== 0 && e.status < 500 || useStore.getState().auth !== 'in') setUser(null); });
  }, [setUser]);
  useEffect(() => { if (auth === 'in') void refreshMeta(); }, [auth, refreshMeta]);
  if (auth === 'loading') return <div className="grid h-full place-items-center text-sm text-muted">Loading…</div>;
  if (auth === 'out') return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="/home/:id?" element={<HomePage />} />
        <Route path="/archive/:id?" element={<HomePage archive />} />
        <Route path="/bin" element={<ShelfPage pile="bin" />} />
        <Route path="/notes/:id?" element={<Navigate to="/home" replace />} />
        <Route path="/tasks" element={<Navigate to="/home" replace />} />
        <Route path="/search" element={<Navigate to="/home" replace />} />
        <Route path="/settings" element={<Suspense fallback={null}><SettingsPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
