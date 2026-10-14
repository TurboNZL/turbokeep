import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { api, download, type Report } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { Section } from './Section.tsx';

const LABEL: Record<string, string> = { notes: 'notes', skipped: 'already here (skipped)', tags: 'new tags', projects: 'projects', tasks: 'tasks', comments: 'comments', relations: 'task relations' };

function ImportBox({ kind, accept, multiple, hint }: { kind: 'turbokeep' | 'standardnotes' | 'vikunja'; accept: string; multiple: boolean; hint: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshMeta = useStore((s) => s.refreshMeta);

  async function go(dry: boolean) {
    setBusy(true); setError(null);
    try { const r = await api.importFiles(kind, files, dry); setReport(r); if (!dry) { void refreshMeta(); setFiles([]); if (input.current) input.current.value = ''; } }
    catch (e) { setError((e as Error).message); setReport(null); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept={accept} multiple={multiple} aria-label={`File to import (${kind})`} className="block w-full text-sm" onChange={(e) => { setFiles([...(e.target.files ?? [])]); setReport(null); setError(null); }} />
      <p className="text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={!files.length || busy} onClick={() => void go(true)}>Preview</button>
        <button className="btn btn-accent" disabled={!files.length || busy || !report?.dry} onClick={() => void go(false)} title={report?.dry ? '' : 'Preview first'}><Upload size={15} />Import</button>
      </div>
      {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
      {report && (
        <div className="rounded-theme bg-raised p-3 text-sm" aria-live="polite">
          <div className="font-medium">{report.dry ? 'Would import (nothing has been written yet):' : 'Imported:'}</div>
          <ul className="mt-1 list-disc pl-5">{Object.entries(report).filter(([k, v]) => typeof v === 'number' && LABEL[k]).map(([k, v]) => <li key={k}>{v as number} {LABEL[k]}</li>)}</ul>
          {report.warnings.map((w) => <p key={w} className="mt-1.5 text-warn">{w}</p>)}
        </div>)}
    </div>
  );
}

export function ImportExport() {
  const [crossProject, setCrossProject] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (path: string, name: string) => {
    setMsg(null);
    try { const { dropped } = await download(path, name); if (dropped) setMsg(`${dropped} relation${dropped === 1 ? '' : 's'} between different projects ${dropped === 1 ? 'was' : 'were'} left out of the Vikunja file. Tick the box above to keep them (newer Vikunja only).`); }
    catch (e) { setMsg((e as Error).message); }
  };
  return (
    <>
      <Section title="Export">
        <p className="text-sm text-muted">Your data is yours: nothing here is locked in. Exports contain everything in your account, including the trash and archive.</p>
        <div className="space-y-3">
          <div className="space-y-1.5"><h3 className="text-sm font-semibold">Everything: TurboKeep</h3>
            <p className="text-xs text-muted">One zip with your notes and tasks together (tags, lists, reminders, repeats, relations, comments, pins, archive and trash). The way to move to another TurboKeep server or keep a backup you can read.</p>
            <button className="btn" onClick={() => void run('/api/export/turbokeep', 'turbokeep.zip')}><Download size={15} />TurboKeep backup (.zip)</button></div>
          <div className="space-y-1.5"><h3 className="text-sm font-semibold">Notes: Standard Notes</h3>
            <p className="text-xs text-muted">The same zip Standard Notes writes for a decrypted backup: a JSON backup with tags, pins and dates that Standard Notes can import, plus every note as a <code>.txt</code> file in <code>Items/Note/</code>.</p>
            <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => void run('/api/export/standardnotes', 'standard-notes.zip')}><Download size={15} />Standard Notes backup (.zip)</button>
              <button className="btn" onClick={() => void run('/api/export/standardnotes?plain=1', 'notes-plaintext.zip')}><Download size={15} />Plain text files only (.zip)</button></div></div>
          <div className="space-y-1.5"><h3 className="text-sm font-semibold">Tasks: Vikunja</h3>
            <p className="text-xs text-muted">Vikunja's own data export format (<code>VERSION</code> + <code>data.json</code>). In Vikunja: Settings &gt; Import from other services &gt; Vikunja file. Attachments are not part of it. Descriptions become simple HTML paragraphs.</p>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={crossProject} onChange={(e) => setCrossProject(e.target.checked)} /><span>Keep relations between tasks in different projects <span className="text-muted">(Vikunja 0.24 and older duplicates the tasks they name; newer versions do not. Off is safe everywhere.)</span></span></label>
            <button className="btn" onClick={() => void run(`/api/export/vikunja${crossProject ? '?relations=all' : ''}`, 'vikunja.zip')}><Download size={15} />Vikunja export (.zip)</button></div>
          {msg && <p className="rounded-theme bg-raised p-2.5 text-sm" role="status">{msg}</p>}
        </div>
      </Section>
      <Section title="Import: TurboKeep">
        <ImportBox kind="turbokeep" multiple={false} accept=".zip,.json" hint="A zip made by TurboKeep's export (or its turbokeep.json). Notes that are already here (same id) are skipped, so importing twice is safe." />
      </Section>
      <Section title="Import notes: Standard Notes">
        <ImportBox kind="standardnotes" multiple accept=".zip,.txt,.md,.markdown,.json" hint="Use the decrypted zip (Standard Notes: Account > Data Backups > Download backup > Decrypted), its JSON file, or plain .txt / .md files. Importing the same backup twice does not duplicate anything." />
      </Section>
      <Section title="Import tasks: Vikunja">
        <ImportBox kind="vikunja" multiple={false} accept=".zip,.json" hint="Vikunja: Settings > Export your data, then pick the zip it gives you (or its data.json). Lists, subprojects, tasks (each becomes a note), labels (they become tags), reminders, repeats, relations and comments come across; attachments, assignees, kanban buckets and saved filters do not." />
      </Section>
    </>
  );
}
