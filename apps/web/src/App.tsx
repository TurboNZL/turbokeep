import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/api.ts';
import { useStore } from './lib/store.ts';
import { Layout } from './components/Layout.tsx';
import { LoginPage } from './pages/Login.tsx';
import { NotesPage } from './pages/Notes.tsx';
import { TasksPage } from './pages/Tasks.tsx';
import { SearchPage } from './pages/Search.tsx';
import { SettingsPage } from './pages/Settings.tsx';

export function App() {
  const auth = useStore((s) => s.auth);
  const setUser = useStore((s) => s.setUser);
  const refreshMeta = useStore((s) => s.refreshMeta);
  useEffect(() => { api.me().then((r) => setUser(r.user), () => setUser(null)); }, [setUser]);
  useEffect(() => { if (auth === 'in') void refreshMeta(); }, [auth, refreshMeta]);
  if (auth === 'loading') return <div className="grid h-full place-items-center text-sm text-muted">Loading…</div>;
  if (auth === 'out') return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/notes" replace />} />
        <Route path="/notes/:id?" element={<NotesPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/notes" replace />} />
      </Route>
    </Routes>
  );
}
