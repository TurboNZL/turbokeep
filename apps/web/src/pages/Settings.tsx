import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AppearanceLayout, WallpaperCard } from '../components/AppearanceCard.tsx';
import { Section } from '../components/Section.tsx';
import { GuidesTab } from '../components/GuidesTab.tsx';
import { ImportExport } from '../components/ImportExport.tsx';
import { AccountCards } from '../components/AccountCard.tsx';
import { api } from '../lib/api.ts';
import { cn } from '../lib/cn.ts';
import { useStore } from '../lib/store.ts';

export function SettingsPage() {
  const { settings, updateSettings } = useStore();
  const [params, setParams] = useSearchParams();
  const [version, setVersion] = useState('');
  useEffect(() => { void api.setup().then((i) => setVersion(i.version), () => {}); }, []);
  const tabs = [{ id: 'look', label: 'Appearance' }, { id: 'notes', label: 'Notes' }, { id: 'data', label: 'Import & export' }, { id: 'account', label: 'Account' }, { id: 'guides', label: 'Guides' }, { id: 'app', label: 'This app' }];
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'look';
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-x-1 border-b border-line pb-px">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} data-selected={tab === t.id || undefined} onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={cn('-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors', tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{t.label}</button>))}
      </div>

      {tab === 'look' && <><AppearanceLayout /><Section title="Wallpaper"><WallpaperCard /></Section></>}

      {tab === 'notes' && (
        <Section title="Editor">
          <p className="text-sm text-muted">These choices are kept in this browser only.</p>
          <label className="block space-y-1 text-sm">Font<select className="input !w-auto" value={settings.noteFont} onChange={(e) => updateSettings({ noteFont: e.target.value as 'sans' | 'mono' })}><option value="sans">Proportional</option><option value="mono">Monospace</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.notePreview} onChange={(e) => updateSettings({ notePreview: e.target.checked })} />Show the Markdown preview beside the text (notes marked Markdown)</label>
        </Section>)}

      {tab === 'data' && <ImportExport />}
      {tab === 'account' && <AccountCards />}
      {tab === 'guides' && <GuidesTab />}

      {tab === 'app' && (
        <Section title="TurboKeep">
          <p className="text-sm">Version <span className="font-mono">{version || '…'}</span>. Self-hosted notes and tasks; your data lives in the server's data folder.</p>
          <p className="text-sm text-muted">To update, pull the new image and restart: <code>docker compose pull &amp;&amp; docker compose up -d</code>. The Guides tab has the details.</p>
          <p className="text-sm"><a className="underline" href="https://github.com/TurboNZL/turbokeep/releases" target="_blank" rel="noreferrer noopener">Releases</a></p>
        </Section>)}
    </div>
  );
}
