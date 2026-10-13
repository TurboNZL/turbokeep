import { useEffect, useState } from 'react';
import { Copy, KeyRound, LogOut, Trash2 } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { Section } from './Section.tsx';

export function AccountCards() {
  const { user, setUser } = useStore();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [tokens, setTokens] = useState<{ id: string; name: string; createdAt: string; lastUsed: string | null }[]>([]);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const load = () => void api.tokens().then(setTokens, () => {});
  useEffect(load, []);

  return (
    <>
      <Section title="Account">
        <p className="text-sm">Signed in as <span className="font-medium">{user?.username}</span>.</p>
        <button className="btn" onClick={async () => { await api.logout().catch(() => {}); setUser(null); }}><LogOut size={15} />Sign out</button>
      </Section>
      <Section title="Change password">
        <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setPwMsg(null); try { await api.changePassword(cur, next); setCur(''); setNext(''); setPwMsg('Password changed. Your other devices were signed out.'); } catch (err) { setPwMsg((err as Error).message); } }}>
          <label className="block space-y-1 text-sm">Current password<input className="input" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></label>
          <label className="block space-y-1 text-sm">New password (at least 10 characters)<input className="input" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <button className="btn">Change password</button>{pwMsg && <p className="text-sm" role="status">{pwMsg}</p>}
        </form>
      </Section>
      <Section title="API tokens">
        <p className="text-sm text-muted">For scripts and other apps. Send it as <code>Authorization: Bearer &lt;token&gt;</code> to the same address as this app. A token can do everything you can, so treat it like a password.</p>
        {fresh && <div className="space-y-1.5 rounded-theme border border-accent p-3 text-sm" role="status"><p>Copy it now. It is not shown again.</p><div className="flex gap-2"><input readOnly className="input font-mono" value={fresh} onFocus={(e) => e.currentTarget.select()} /><button className="btn" onClick={() => void navigator.clipboard?.writeText(fresh)} aria-label="Copy"><Copy size={15} /></button></div></div>}
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await api.createToken(name.trim() || 'API token'); setFresh(r.token); setName(''); load(); }}>
          <input className="input" aria-label="Token name" placeholder="What is it for?" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn"><KeyRound size={15} />Create</button></form>
        <ul className="divide-y divide-line text-sm">{tokens.map((t) => <li key={t.id} className="flex items-center gap-2 py-2"><span className="min-w-0 flex-1 truncate">{t.name} <span className="text-xs text-muted">· made {new Date(t.createdAt).toLocaleDateString()} · {t.lastUsed ? `used ${new Date(t.lastUsed).toLocaleDateString()}` : 'never used'}</span></span>
          <button className="btn btn-ghost !px-2 text-bad" aria-label={`Revoke ${t.name}`} onClick={async () => { await api.deleteToken(t.id); load(); }}><Trash2 size={15} /></button></li>)}</ul>
      </Section>
    </>
  );
}
