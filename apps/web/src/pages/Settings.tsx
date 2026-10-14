import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AppearanceLayout, WallpaperCard } from '../components/AppearanceCard.tsx';
import { Select } from '../components/Select.tsx';
import { AndroidCard } from '../components/AndroidCard.tsx';
import { ServerUpdateCard } from '../components/ServerUpdate.tsx';
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
    <div className="mx-auto max-w-7xl space-y-5">
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
          <div className="space-y-1 text-sm"><span>Font</span><Select className="!w-56" aria-label="Font" value={settings.noteFont} onChange={(v) => updateSettings({ noteFont: v as 'sans' | 'mono' })} options={[{ value: 'sans', label: 'Proportional' }, { value: 'mono', label: 'Monospace' }]} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.notePreview} onChange={(e) => updateSettings({ notePreview: e.target.checked })} />Show the Markdown preview beside the text (notes marked Markdown)</label>
        </Section>)}

      {tab === 'data' && <ImportExport />}
      {tab === 'account' && <AccountCards />}
      {tab === 'guides' && <GuidesTab />}

      {tab === 'app' && (
        <>
        <Section title="TurboKeep">
          <p className="text-sm">Version <span className="font-mono">{version || '…'}</span>. Self-hosted notes and tasks; your data lives in the server's data folder.</p>
          <p className="text-sm text-muted">The Guides tab explains how to update the server.</p>
          <p className="text-sm"><a className="underline" href="https://github.com/TurboNZL/turbokeep/releases" target="_blank" rel="noreferrer noopener">Releases</a></p>
        </Section>
        <AndroidCard />
        <ServerUpdateCard />
        </>)}
    </div>
  );
}
