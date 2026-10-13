import { type DB, all, get, run, tx } from './db.ts';
import { HttpError, createNote, createProject, createTask, ensureLabel, addComment, inbox, updateProject, INVERSE } from './store.ts';
import { buildStandardNotesZip, parseStandardNotes, type SnTag } from './formats/standardnotes.ts';
import { buildVikunjaZip, parseVikunja, type BuildOptions, type VProject, type VTask } from './formats/vikunja.ts';
import { ImportError, type ImportReport, type NoteOut } from './formats/types.ts';

/** Thrown inside the import transaction to undo it after counting what would have happened (preview / dry run). */
class DryRun extends Error {}

function guard<T>(fn: () => T): T {
  try { return fn(); } catch (e) { if (e instanceof ImportError) throw new HttpError(400, e.message); throw e; }
}

// ---------------- Standard Notes ----------------

export function exportStandardNotes(db: DB, userId: number, plainOnly: boolean): Uint8Array {
  const rows = all(db, 'select * from notes where user_id = ? order by created_at', userId);
  const tagRows = all(db, 'select nt.note_id, t.title from note_tags nt join tags t on t.id = nt.tag_id where t.user_id = ?', userId);
  const byNote = new Map<string, string[]>();
  for (const r of tagRows) (byNote.get(r.note_id) ?? byNote.set(r.note_id, []).get(r.note_id)!).push(r.title);
  const notes: NoteOut[] = rows.map((r) => ({ id: r.id, title: r.title, text: r.text, noteType: r.note_type, pinned: !!r.pinned, archived: !!r.archived, trashed: !!r.trashed, createdAt: r.created_at, updatedAt: r.updated_at, tags: byNote.get(r.id) ?? [] }));
  const tags: SnTag[] = all(db, 'select * from tags where user_id = ? order by title', userId).map((t) => ({
    id: t.id, title: t.title, createdAt: t.created_at, updatedAt: t.created_at, noteIds: all(db, 'select note_id from note_tags where tag_id = ?', t.id).map((r) => r.note_id as string),
  }));
  return buildStandardNotesZip(notes, tags, plainOnly);
}

export function importStandardNotes(db: DB, userId: number, files: { name: string; data: Uint8Array }[], dry: boolean): ImportReport {
  const report: ImportReport = { notes: 0, skipped: 0, tags: 0, warnings: [] };
  const run_ = () => tx(db, () => {
    const tagsBefore = Number(get(db, 'select count(*) c from tags where user_id = ?', userId)!.c);
    for (const f of files) {
      const { notes, warnings } = guard(() => parseStandardNotes(f.name, f.data));
      for (const w of warnings) if (!(report.warnings as string[]).includes(w)) (report.warnings as string[]).push(w);
      for (const n of notes) {
        let id = n.id;
        if (id) {
          const existing = get(db, 'select user_id from notes where id = ?', id);
          if (existing?.user_id === userId) { (report.skipped as number)++; continue; } // already imported
          if (existing) id = undefined; // another account on this server has it: new identity
        } else if (get(db, 'select 1 x from notes where user_id = ? and title = ? and text = ?', userId, n.title, n.text)) { (report.skipped as number)++; continue; }
        createNote(db, userId, n, { id, createdAt: n.createdAt, updatedAt: n.updatedAt });
        (report.notes as number)++;
      }
    }
    report.tags = Number(get(db, 'select count(*) c from tags where user_id = ?', userId)!.c) - tagsBefore;
    if (dry) throw new DryRun();
  });
  try { run_(); } catch (e) { if (!(e instanceof DryRun)) throw e; }
  return { ...report, dry };
}

// ---------------- Vikunja ----------------

export function exportVikunja(db: DB, user: { id: number; username: string }, opts: BuildOptions = {}): { zip: Uint8Array; droppedRelations: number } {
  const u = get(db, 'select created_at from users where id = ?', user.id)!;
  const labelsByTask = new Map<number, VTask['labels']>();
  for (const r of all(db, 'select tl.task_id, l.* from task_labels tl join labels l on l.id = tl.label_id where l.user_id = ?', user.id))
    (labelsByTask.get(r.task_id) ?? labelsByTask.set(r.task_id, []).get(r.task_id)!).push({ id: r.id, title: r.title, description: r.description, hexColor: r.hex_color, created: r.created_at, updated: r.updated_at });
  const group = (sql: string) => { const m = new Map<number, any[]>(); for (const r of all(db, sql, user.id)) (m.get(r.task_id) ?? m.set(r.task_id, []).get(r.task_id)!).push(r); return m; };
  const reminders = group('select r.* from task_reminders r join tasks t on t.id = r.task_id where t.user_id = ? order by r.id');
  const comments = group('select c.* from task_comments c join tasks t on t.id = c.task_id where t.user_id = ? order by c.id');
  const related = group('select r.task_id, r.kind, o.id, o.title, o.project_id from task_relations r join tasks t on t.id = r.task_id join tasks o on o.id = r.other_task_id where t.user_id = ? order by o.id');
  const projects = new Map<number, VProject>();
  for (const p of all(db, 'select * from projects where user_id = ? order by is_inbox desc, position, id', user.id))
    projects.set(p.id, { id: p.id, parentId: p.parent_id, title: p.title, description: p.description, hexColor: p.hex_color, isArchived: !!p.is_archived, isFavorite: !!p.is_favorite, position: p.position, created: p.created_at, updated: p.updated_at, tasks: [] });
  const index = new Map<number, number>();
  for (const t of all(db, 'select * from tasks where user_id = ? order by id', user.id)) {
    const n = (index.get(t.project_id) ?? 0) + 1;
    index.set(t.project_id, n);
    const rel: VTask['related'] = {};
    for (const x of related.get(t.id) ?? []) (rel[x.kind] ??= []).push({ id: x.id, title: x.title, projectId: x.project_id });
    projects.get(t.project_id)?.tasks.push({
      id: t.id, projectId: t.project_id, index: n, title: t.title, description: t.description, done: !!t.done, doneAt: t.done_at, dueDate: t.due_date, startDate: t.start_date, endDate: t.end_date,
      priority: t.priority, percentDone: t.percent_done, hexColor: t.hex_color, isFavorite: !!t.is_favorite, position: t.position, repeatAfter: t.repeat_after, repeatMode: t.repeat_mode,
      created: t.created_at, updated: t.updated_at, labels: labelsByTask.get(t.id) ?? [], related: rel,
      reminders: (reminders.get(t.id) ?? []).map((r) => ({ reminder: r.reminder, relativePeriod: r.relative_period, relativeTo: r.relative_to })),
      comments: (comments.get(t.id) ?? []).map((c) => ({ id: c.id, comment: c.comment, author: c.author, created: c.created_at, updated: c.updated_at })),
    });
  }
  return buildVikunjaZip({ id: user.id, username: user.username, created: u.created_at }, [...projects.values()], opts);
}

export function importVikunja(db: DB, user: { id: number; username: string }, data: Uint8Array, dry: boolean): ImportReport {
  const { projects, warnings } = guard(() => parseVikunja(data));
  const report: ImportReport = { projects: 0, tasks: 0, labels: 0, comments: 0, relations: 0, warnings: [...warnings] };
  const inc = (k: string, n = 1) => { (report[k] as number) += n; };
  try {
    tx(db, () => {
      const labelsBefore = Number(get(db, 'select count(*) c from labels where user_id = ?', user.id)!.c);
      const projectMap = new Map<number, number>(); // Vikunja's id -> ours
      const taskMap = new Map<number, number>();
      for (const p of projects) {
        // a project that is Vikunja's Inbox joins ours instead of making a second one
        if (!p.parentOldId && p.title.toLowerCase() === 'inbox') projectMap.set(p.oldId, inbox(db, user.id));
        else { projectMap.set(p.oldId, createProject(db, user.id, { title: p.title, description: p.description, hexColor: p.hexColor, isFavorite: p.isFavorite, position: p.position }).id); inc('projects'); }
      }
      for (const p of projects) {
        const parent = p.parentOldId ? projectMap.get(p.parentOldId) : undefined, id = projectMap.get(p.oldId)!;
        if (parent && parent !== id && !get(db, 'select 1 x from projects where id = ? and is_inbox = 1', id)) updateProject(db, user.id, id, { parentId: parent });
      }
      for (const p of projects) {
        const pid = projectMap.get(p.oldId)!;
        for (const t of p.tasks) {
          const made = createTask(db, user.id, {
            title: t.title, description: t.description, projectId: pid, done: t.done, dueDate: t.dueDate, startDate: t.startDate, endDate: t.endDate, priority: t.priority, percentDone: t.percentDone,
            hexColor: t.hexColor, isFavorite: t.isFavorite, position: t.position, repeatAfter: t.repeatAfter, repeatMode: t.repeatMode,
            reminders: t.reminders,
          }, { createdAt: t.created, updatedAt: t.updated });
          if (t.done && t.doneAt) run(db, 'update tasks set done_at = ? where id = ?', t.doneAt, made.id);
          for (const l of t.labels) run(db, 'insert or ignore into task_labels (task_id, label_id) values (?,?)', made.id, ensureLabel(db, user.id, l.title, l.hexColor, l.description));
          for (const c of t.comments) { addComment(db, user.id, made.id, c.comment, c.author, { created: c.created, updated: c.updated }); inc('comments'); }
          if (t.oldId) taskMap.set(t.oldId, made.id);
          inc('tasks');
        }
      }
      // relations last: both ends must exist. Vikunja stores both directions, so each pair arrives twice; the inverse is added with it
      let dropped = 0;
      for (const p of projects) for (const t of p.tasks) {
        const from = taskMap.get(t.oldId);
        if (!from) continue;
        for (const [kind, list] of Object.entries(t.related)) {
          if (!(kind in INVERSE)) { dropped += list.length; continue; }
          for (const r of list) {
            const to = taskMap.get(r.oldId);
            if (!to || to === from) { dropped++; continue; }
            const had = get(db, 'select 1 x from task_relations where task_id = ? and other_task_id = ? and kind = ?', from, to, kind);
            run(db, 'insert or ignore into task_relations (task_id, other_task_id, kind) values (?,?,?)', from, to, kind);
            run(db, 'insert or ignore into task_relations (task_id, other_task_id, kind) values (?,?,?)', to, from, INVERSE[kind]);
            if (!had) inc('relations');
          }
        }
      }
      if (dropped) (report.warnings as string[]).push(`${dropped} task relation${dropped === 1 ? '' : 's'} pointed at tasks that are not in the file and were skipped.`);
      for (const p of projects) if (p.isArchived) { const id = projectMap.get(p.oldId)!; if (!get(db, 'select 1 x from projects where id = ? and is_inbox = 1', id)) updateProject(db, user.id, id, { isArchived: true }); }
      report.labels = Number(get(db, 'select count(*) c from labels where user_id = ?', user.id)!.c) - labelsBefore;
      if (dry) throw new DryRun();
    });
  } catch (e) { if (!(e instanceof DryRun)) throw e; }
  return { ...report, dry };
}
