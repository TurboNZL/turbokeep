import { useEffect, useState } from 'react';
import { api, type SetupInfo } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { android } from '../lib/native.ts';
import { ServerConnectCard } from '../components/ServerConnectCard.tsx';

/** Sign in, or (first run, or when the server allows sign-ups) create an account. */
export function LoginPage() {
  const setUser = useStore((s) => s.setUser);
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.setup().then((i) => { setInfo(i); if (i.needsSetup) setMode('register'); }, () => setError('Cannot reach the server.')); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { setUser((mode === 'login' ? await api.login(username, password) : await api.register(username, password, code || undefined)).user); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const canRegister = info?.needsSetup || info?.allowSignup;
  return (
    <div className="grid min-h-full place-content-center justify-items-center gap-3 p-4">
      <form onSubmit={submit} className="card bt-panel w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-3"><img src="/icon.svg" alt="" width={36} height={36} /><div><h1 className="text-lg font-bold">TurboKeep</h1><p className="text-xs text-muted">{mode === 'register' ? (info?.needsSetup ? 'Create the first account' : 'Create an account') : 'Sign in'}</p></div></div>
        <label className="block space-y-1 text-sm">Username<input className="input" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label className="block space-y-1 text-sm">Password{mode === 'register' && <span className="text-muted"> (at least 10 characters)</span>}<input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {mode === 'register' && info?.setupCodeRequired && <label className="block space-y-1 text-sm">Setup code<input className="input font-mono" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value.trim())} /><span className="text-xs text-muted">Printed by the installer and in the server log (<code>journalctl -u turbokeep</code>). It stops strangers claiming a server that is already reachable.</span></label>}
        {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
        <button className="btn btn-accent w-full" disabled={busy || !info}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        {canRegister && !info?.needsSetup && <button type="button" className="btn btn-ghost w-full text-sm" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'I already have an account'}</button>}
      </form>
      {android() && <details className="mt-3 w-full max-w-sm text-sm"><summary className="cursor-pointer text-center text-muted">Server and Cloudflare Access</summary><div className="mt-2"><ServerConnectCard /></div></details>}
    </div>
  );
}
