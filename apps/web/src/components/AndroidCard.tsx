import { useEffect, useState } from 'react';
import { Download, RefreshCw, Settings2 } from 'lucide-react';
import { android, androidInfo, type AndroidInfo, type UpdateState } from '../lib/native.ts';
import { Section } from './Section.tsx';

/** Settings > This app, only inside the Android app: its version, the server address, and updating the app from the newest GitHub release. */
export function AndroidCard() {
  const [info, setInfo] = useState<AndroidInfo | null>(() => androidInfo());
  const [token, setToken] = useState('');
  useEffect(() => {
    const on = (e: Event) => setInfo((i) => (i ? { ...i, update: (e as CustomEvent<UpdateState>).detail } : i));
    window.addEventListener('turbokeep-update', on);
    return () => window.removeEventListener('turbokeep-update', on);
  }, []);
  const bridge = android();
  if (!bridge || !info) return null;
  const u = info.update;
  const text = u.status === 'checking' ? 'Looking for a new version…' : u.status === 'downloading' ? `Downloading ${u.version ?? ''} ${u.percent ?? 0}%` : u.status === 'ready' ? `Version ${u.version} is downloaded and ready to install.`
    : u.status === 'none' ? (u.message ?? 'You have the newest version.') : u.status === 'error' ? `Could not check: ${u.message ?? 'unknown error'}` : '';
  return (
    <Section title="Android app">
      <p className="text-sm">Version <span className="font-mono">{info.version}</span>.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className="btn" onClick={() => bridge.checkUpdate()} disabled={u.status === 'checking' || u.status === 'downloading'}><RefreshCw size={15} />Check for updates</button>
        {u.status === 'ready' && <button className="btn btn-accent" onClick={() => bridge.installUpdate()}><Download size={15} />Install {u.version}</button>}
        <button className="btn" onClick={() => bridge.openWidgetSettings()}><Settings2 size={15} />Widget settings</button>
        {text && <span className="text-muted" aria-live="polite">{text}</span>}
      </div>
      <p className="text-xs text-muted">Updates come from the newest release on GitHub; Android asks you to confirm the install. The widget on your home screen lists your open tasks: long-press the home screen, Widgets, TurboKeep.</p>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">GitHub token <span className="font-normal text-muted">(only while the repository is private)</span></summary>
        <div className="mt-2 flex gap-2"><input type="password" className="input" aria-label="GitHub token" value={token} placeholder={info.hasUpdateToken ? 'A token is saved' : 'ghp_… with read access'} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          <button className="btn" disabled={!token.trim()} onClick={() => { bridge.setUpdateToken(token.trim()); setToken(''); setInfo(androidInfo()); }}>Save</button></div>
      </details>
    </Section>
  );
}
