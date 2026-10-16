import { useState } from 'react';
import { useStore } from '../lib/store.ts';
import { Section } from './Section.tsx';

/**
 * Settings > This app: the Cloudflare Access service token of this server (Zero Trust > Access > Service Auth). It is kept in this browser only and goes into the
 * pairing code for the phone, which sends it as CF-Access-Client-Id / -Secret (the widget needs it when its sign-in runs out). The web page itself never needs
 * it: you pass Cloudflare Access when you open the page.
 */
export function AccessCard() {
  const { settings, updateSettings } = useStore();
  const [id, setId] = useState(settings.cfAccessId);
  const [secret, setSecret] = useState(settings.cfAccessSecret);
  const [saved, setSaved] = useState(false);
  const changed = id.trim() !== settings.cfAccessId || secret.trim() !== settings.cfAccessSecret;
  return (
    <Section title="Cloudflare Access">
      <p className="text-sm text-muted">Only if this server is behind Cloudflare Access: the service token (Zero Trust &gt; Access &gt; Service Auth). It is kept on this device and goes into the pairing code below, so the phone's widget can get through when its sign-in runs out. On the phone itself it can be changed under Settings &gt; This app &gt; Change server.</p>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); updateSettings({ cfAccessId: id.trim(), cfAccessSecret: secret.trim() }); setSaved(true); setTimeout(() => setSaved(false), 3000); }}>
        <label className="block space-y-1 text-sm">Client ID<input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" placeholder="xxxxxxxx.access" /></label>
        <label className="block space-y-1 text-sm">Client secret<input className="input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder="Shown once when the token is made" /></label>
        <div className="flex items-center gap-3"><button className="btn btn-accent" disabled={!changed}>Save</button>
          {(settings.cfAccessId || settings.cfAccessSecret) && <button type="button" className="btn" onClick={() => { setId(''); setSecret(''); updateSettings({ cfAccessId: '', cfAccessSecret: '' }); }}>Clear</button>}
          {saved && <span className="text-sm text-muted" role="status">Saved.</span>}</div>
      </form>
    </Section>
  );
}
