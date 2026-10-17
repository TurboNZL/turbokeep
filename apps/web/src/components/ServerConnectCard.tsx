import { useState } from 'react';
import { useStore } from '../lib/store.ts';
import { api } from '../lib/api.ts';
import { speedTest, type SpeedLine } from '../lib/speedTest.ts';
import { keepCodec } from './PairPhoneCard.tsx';
import { PairDevice } from './PairDevice.tsx';
import { Section } from './Section.tsx';

/**
 * Inside the Android app: where the server is and how to get in. The same card as TurboMusic's Settings > Server (address, access token, Cloudflare Access service
 * token, Test connection, Speed test, Save, Pair a device): the page is bundled in the app, so the app has no connection of its own to set up.
 * The token can be pasted (Account > API tokens on a connected device), come from a pairing code, or be made by signing in on the next screen.
 */
export function ServerConnectCard({ title = 'Server' }: { title?: string }) {
  const { settings, updateSettings } = useStore();
  const [url, setUrl] = useState(settings.serverUrl);
  const [token, setToken] = useState(settings.token);
  const [cfId, setCfId] = useState(settings.cfAccessId);
  const [cfSecret, setCfSecret] = useState(settings.cfAccessSecret);
  const [status, setStatus] = useState<string | null>(null);
  const [speed, setSpeed] = useState<SpeedLine[] | 'running' | null>(null);
  const base = () => url.trim().replace(/\/+$/, '');
  const headers = (): Record<string, string> => (cfId.trim() && cfSecret.trim() ? { 'CF-Access-Client-Id': cfId.trim(), 'CF-Access-Client-Secret': cfSecret.trim() } : {});

  async function test() {
    setStatus('Checking…');
    try {
      const h = await fetch(`${base()}/api/health`, { headers: headers(), cache: 'no-store' });
      const body = h.ok ? await h.json().catch(() => null) : null;
      if (!body?.ok) { setStatus(h.status === 401 || h.status === 403 || h.status === 302 || (h.ok && !body) ? 'Cloudflare Access turned the request away: check the service token (and that the Access policy action is Service Auth).' : `No TurboKeep answered at that address (HTTP ${h.status}).`); return; }
      if (!token.trim()) { setStatus(`Server found (version ${body.version}). Add a token, or sign in on the next screen.`); return; }
      const me = await fetch(`${base()}/api/auth/me`, { headers: { ...headers(), Authorization: `Bearer ${token.trim()}` }, cache: 'no-store' });
      setStatus(me.ok ? `Connected as ${(await me.json()).user?.username ?? 'you'} · version ${body.version}` : me.status === 401 ? 'Server found, but the token is wrong.' : `Server found, but sign-in answered HTTP ${me.status}.`);
    } catch { setStatus(`Cannot reach the server.${cfId ? ' With Cloudflare Access in front, also check the service token and the CORS setting described below.' : ''}`); }
  }
  async function runSpeed() { setSpeed('running'); setSpeed(await speedTest(base(), headers(), token.trim())); }
  const save = () => {
    // a token belongs to one server: a new address with the old token typed in would only be refused
    const moved = base() !== settings.serverUrl && token.trim() === settings.token;
    if (moved) setToken('');
    updateSettings({ serverUrl: base(), token: moved ? '' : token.trim(), cfAccessId: cfId.trim(), cfAccessSecret: cfSecret.trim() }); setStatus(moved ? 'Saved. The old token was for another server, so it was cleared: add one, or sign in.' : 'Saved.');
  };

  return (
    <Section title={title}>
      <p className="text-sm text-muted">Where your TurboKeep server is. The app shows its own copy of the page and talks to the server at this address.</p>
      <label className="block space-y-1 text-sm">URL<input className="input" placeholder="https://keep.example.com or http://192.168.1.20:47901" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <label className="block space-y-1 text-sm">Token <span className="text-muted">(optional: or sign in on the next screen)</span><input className="input font-mono" type="password" placeholder="tk_… from Account > API tokens, or a pairing code below" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
      <details className="rounded-theme border border-line p-3 text-sm" open={!!(cfId || cfSecret)}>
        <summary className="cursor-pointer">Cloudflare Access service token{cfId && cfSecret ? ' (set)' : ''}</summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">Only if the server is behind Cloudflare Access with a Service Auth policy. Create a service token in Zero Trust (Access › Service credentials), add it to the policy, and paste the two halves here. They are sent as <code>CF-Access-Client-Id</code> and <code>CF-Access-Client-Secret</code> on every request. This is separate from the token above, which TurboKeep itself checks.</p>
          <label className="block space-y-1">Client ID<input className="input font-mono" autoComplete="off" placeholder="xxxxxxxx.access" value={cfId} onChange={(e) => setCfId(e.target.value)} /></label>
          <label className="block space-y-1">Client secret<input className="input font-mono" type="password" autoComplete="off" value={cfSecret} onChange={(e) => setCfSecret(e.target.value)} /></label>
          <p className="text-xs text-muted">The app&apos;s page is not on the server&apos;s address, so the browser first sends a preflight request that Access must let through: in the Access application&apos;s CORS settings turn on <em>Bypass options requests to origin</em> (the app also answers preflights itself), and turn the <em>binding cookie</em> off.</p>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={() => void test()} disabled={!url.trim()}>Test connection</button>
        <button className="btn" onClick={() => void runSpeed()} disabled={speed === 'running' || !url.trim()} title="Times the server and tells whether Cloudflare Access accepts the token">Speed test</button>
        <button className="btn btn-accent" onClick={save} disabled={!url.trim()}>Save</button>
        {speed && <div className="w-full rounded-theme border border-line p-3 text-sm" role="status" aria-live="polite">
          {speed === 'running' ? 'Measuring…' : <ul className="space-y-1">{speed.map((l) => <li key={l.label} className="flex flex-wrap items-baseline gap-x-3"><span className="w-64 shrink-0">{l.label}</span><b className="w-20 shrink-0 tabular-nums">{l.ms === null ? '—' : `${l.ms} ms`}</b><span className="text-xs text-muted">{l.note}</span></li>)}</ul>}
        </div>}
      </div>
      {status && <div className="rounded-theme bg-raised p-3 text-sm" role="status">{status}</div>}
      <PairDevice codec={keepCodec} appName="TurboKeep" defaultAddress={base()} getToken={async () => (await api.createToken('Paired device')).token} access={{ id: cfId, secret: cfSecret }} addressPlaceholder="https://keep.example.com" label="Pair a device"
        onUse={(p) => { setUrl(p.url); setToken(p.token); setCfId(p.access?.id ?? ''); setCfSecret(p.access?.secret ?? ''); updateSettings({ serverUrl: p.url, token: p.token, cfAccessId: p.access?.id ?? '', cfAccessSecret: p.access?.secret ?? '' }); }}
        afterMake="On the other device, paste the code under “Use a code” in Settings > This app (or on this first screen in the app)." />
    </Section>
  );
}
