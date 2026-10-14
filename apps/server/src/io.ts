import { type DB, all, get, run, tx } from './db.ts';
import { VERSION } from './version.ts';
import { HttpError, createNote, createProject, createTask, addComment, inbox, updateProject, INVERSE } from './store.ts';
import { buildStandardNotesZip, parseStandardNotes, type SnTag } from './formats/standardnotes.ts';
import { buildTurboKeepZip, parseTurboKeep, type TkBundle, type TkNote } from './formats/turbokeep.ts';
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
  // a task's tags (the note's) are Vikunja's labels; they have no colour here
  const labelsByTask = new Map<number, VTask['labels']>();
  const labelIds = new Map<string, number>();
  for (const r of all(db, 'select t.id as task_id, g.title, g.created_at from tasks t join note_tags nt on nt.note_id = t.note_id join tags g on g.id = nt.tag_id where t.user_id = ? order by g.title', user.id)) {
    if (!labelIds.has(r.title)) labelIds.set(r.title, labelIds.size + 1);
    (labelsByTask.get(r.task_id) ?? labelsByTask.set(r.task_id, []).get(r.task_id)!).push({ id: labelIds.get(r.title)!, title: r.title, description: '', hexColor: '', created: r.created_at, updated: r.created_at });
  }
  const group = (sql: string) => { const m = new Map<number, any[]>(); for (const r of all(db, sql, user.id)) (m.get(r.task_id) ?? m.set(r.task_id, []).get(r.task_id)!).push(r); return m; };
  const reminders = group('select r.* from task_reminders r join tasks t on t.id = r.task_id where t.user_id = ? order by r.id');
  const comments = group('select c.* from task_comments c join tasks t on t.id = c.task_id where t.user_id = ? order by c.id');
  const related = group('select r.task_id, r.kind, o.id, o.project_id, n.title from task_relations r join tasks t on t.id = r.task_id join tasks o on o.id = r.other_task_id join notes n on n.id = o.note_id where t.user_id = ? order by o.id');
  const projects = new Map<number, VProject>();
  for (const p of all(db, 'select * from projects where user_id = ? order by is_inbox desc, position, id', user.id))
    projects.set(p.id, { id: p.id, parentId: p.parent_id, title: p.title, description: p.description, hexColor: p.hex_color, isArchived: !!p.is_archived, isFavorite: !!p.is_favorite, position: p.position, created: p.created_at, updated: p.updated_at, tasks: [] });
  const index = new Map<number, number>();
  for (const t of all(db, 'select t.*, n.title, n.text as description from tasks t join notes n on n.id = t.note_id where t.user_id = ? and n.trashed = 0 order by t.id', user.id)) {
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
  const report: ImportReport = { projects: 0, tasks: 0, tags: 0, comments: 0, relations: 0, warnings: [...warnings] };
  const inc = (k: string, n = 1) => { (report[k] as number) += n; };
  try {
    tx(db, () => {
      const tagsBefore = Number(get(db, 'select count(*) c from tags where user_id = ?', user.id)!.c);
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
            title: t.title, description: t.description, tags: t.labels.map((l) => l.title), projectId: pid, done: t.done, dueDate: t.dueDate, startDate: t.startDate, endDate: t.endDate, priority: t.priority, percentDone: t.percentDone,
            hexColor: t.hexColor, isFavorite: t.isFavorite, position: t.position, repeatAfter: t.repeatAfter, repeatMode: t.repeatMode,
            reminders: t.reminders,
          }, { createdAt: t.created, updatedAt: t.updated });
          if (t.done && t.doneAt) run(db, 'update tasks set done_at = ? where id = ?', t.doneAt, made.id);
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
      report.tags = Number(get(db, 'select count(*) c from tags where user_id = ?', user.id)!.c) - tagsBefore;
      if (dry) throw new DryRun();
    });
  } catch (e) { if (!(e instanceof DryRun)) throw e; }
  return { ...report, dry };
}

// ---------------- TurboKeep (everything, notes and tasks together) ----------------

export function exportTurboKeep(db: DB, userId: number): Uint8Array {
  const tagRows = all(db, 'select nt.note_id, t.title from note_tags nt join tags t on t.id = nt.tag_id where t.user_id = ? order by t.title', userId);
  const tags = new Map<string, string[]>();
  for (const r of tagRows) (tags.get(r.note_id) ?? tags.set(r.note_id, []).get(r.note_id)!).push(r.title);
  const group = (sql: string) => { const m = new Map<number, any[]>(); for (const r of all(db, sql, userId)) (m.get(r.task_id) ?? m.set(r.task_id, []).get(r.task_id)!).push(r); return m; };
  const reminders = group('select r.* from task_reminders r join tasks t on t.id = r.task_id where t.user_id = ? order by r.id');
  const comments = group('select c.* from task_comments c join tasks t on t.id = c.task_id where t.user_id = ? order by c.id');
  const tasks = new Map<string, any>();
  for (const t of all(db, 'select * from tasks where user_id = ? order by id', userId)) tasks.set(t.note_id, t);
  const notes: TkNote[] = all(db, 'select * from notes where user_id = ? order by created_at, id', userId).map((n) => {
    const t = tasks.get(n.id);
    return {
      id: n.id, title: n.title, text: n.text, noteType: n.note_type, pinned: !!n.pinned, archived: !!n.archived, trashed: !!n.trashed, tags: tags.get(n.id) ?? [], createdAt: n.created_at, updatedAt: n.updated_at,
      task: t ? {
        projectId: t.project_id, done: !!t.done, doneAt: t.done_at, dueDate: t.due_date, startDate: t.start_date, endDate: t.end_date, priority: t.priority, percentDone: t.percent_done, hexColor: t.hex_color,
        isFavorite: !!t.is_favorite, position: t.position, repeatAfter: t.repeat_after, repeatMode: t.repeat_mode, createdAt: t.created_at, updatedAt: t.updated_at,
        reminders: (reminders.get(t.id) ?? []).map((r) => ({ reminder: r.reminder, relativePeriod: r.relative_period, relativeTo: r.relative_to })),
        comments: (comments.get(t.id) ?? []).map((c) => ({ comment: c.comment, author: c.author, createdAt: c.created_at, updatedAt: c.updated_at })),
      } : null,
    };
  });
  const bundle: TkBundle = {
    projects: all(db, 'select * from projects where user_id = ? order by is_inbox desc, id', userId).map((p) => ({
      id: p.id, title: p.title, description: p.description, hexColor: p.hex_color, parentId: p.parent_id, isArchived: !!p.is_archived, isFavorite: !!p.is_favorite, isInbox: !!p.is_inbox, position: p.position })),
    notes,
    tagStyles: all(db, "select title, emoji, color from tags where user_id = ? and (emoji != '' or color != '') order by title", userId).map((t) => ({ title: t.title, emoji: t.emoji, color: t.color })),
    relations: all(db, 'select a.note_id as note_id, b.note_id as other_note_id, r.kind from task_relations r join tasks a on a.id = r.task_id join tasks b on b.id = r.other_task_id where a.user_id = ? order by r.task_id, r.other_task_id', userId)
      .map((r) => ({ noteId: r.note_id, otherNoteId: r.other_note_id, kind: r.kind })),
  };
  return buildTurboKeepZip(bundle, VERSION);
}

export function importTurboKeep(db: DB, user: { id: number; username: string }, data: Uint8Array, dry: boolean): ImportReport {
  const { bundle, warnings } = guard(() => parseTurboKeep(data));
  const report: ImportReport = { notes: 0, tasks: 0, projects: 0, tags: 0, comments: 0, relations: 0, skipped: 0, warnings: [...warnings] };
  const inc = (k: string, n = 1) => { (report[k] as number) += n; };
  try {
    tx(db, () => {
      const tagsBefore = Number(get(db, 'select count(*) c from tags where user_id = ?', user.id)!.c);
      // projects first, parents before children; one that already exists (same name, same parent) is reused, so a second import adds nothing
      const projectMap = new Map<number, number>();
      let pending = bundle.projects.slice();
      for (let pass = 0; pending.length && pass < 50; pass++) {
        const later: typeof pending = [];
        for (const p of pending) {
          if (p.parentId && !projectMap.has(p.parentId) && bundle.projects.some((x) => x.id === p.parentId)) { later.push(p); continue; }
          const parent = p.parentId ? projectMap.get(p.parentId) ?? null : null;
          if (p.isInbox) { projectMap.set(p.id, inbox(db, user.id)); continue; }
          const same = get(db, 'select id from projects where user_id = ? and title = ? and coalesce(parent_id, 0) = ? and is_inbox = 0', user.id, p.title, parent ?? 0);
          if (same) { projectMap.set(p.id, same.id); continue; }
          const made = createProject(db, user.id, { title: p.title, description: p.description, hexColor: p.hexColor, parentId: parent, isFavorite: p.isFavorite, position: p.position });
          if (p.isArchived) updateProject(db, user.id, made.id, { isArchived: true });
          projectMap.set(p.id, made.id); inc('projects');
        }
        pending = later;
      }
      const noteMap = new Map<string, string>(); // id in the file -> id here (they differ only when another account on this server already has that id)
      for (const n of bundle.notes) {
        let id = n.id;
        const existing = get(db, 'select user_id from notes where id = ?', id);
        if (existing?.user_id === user.id) { inc('skipped'); noteMap.set(n.id, id); continue; }
        if (existing) id = crypto.randomUUID();
        createNote(db, user.id, { title: n.title, text: n.text, noteType: n.noteType, pinned: n.pinned, archived: n.archived, trashed: n.trashed, tags: n.tags }, { id, createdAt: n.createdAt, updatedAt: n.updatedAt });
        noteMap.set(n.id, id); inc('notes');
        if (n.task) {
          const t = n.task;
          const made = createTask(db, user.id, { noteId: id, projectId: projectMap.get(t.projectId), done: t.done, dueDate: t.dueDate, startDate: t.startDate, endDate: t.endDate, priority: t.priority, percentDone: t.percentDone,
            hexColor: t.hexColor, isFavorite: t.isFavorite, position: t.position, repeatAfter: t.repeatAfter, repeatMode: t.repeatMode, reminders: t.reminders }, { createdAt: t.createdAt, updatedAt: t.updatedAt });
          if (t.done && t.doneAt) run(db, 'update tasks set done_at = ? where id = ?', t.doneAt, made.id);
          for (const c of t.comments) { addComment(db, user.id, made.id, c.comment, c.author, { created: c.createdAt, updated: c.updatedAt }); inc('comments'); }
          inc('tasks');
        }
      }
      let dropped = 0;
      for (const r of bundle.relations) {
        const a = noteMap.get(r.noteId), b = noteMap.get(r.otherNoteId);
        const ta = a && get(db, 'select id from tasks where note_id = ? and user_id = ?', a, user.id), tb = b && get(db, 'select id from tasks where note_id = ? and user_id = ?', b, user.id);
        if (!ta || !tb || ta.id === tb.id || !(r.kind in INVERSE)) { dropped++; continue; }
        const had = get(db, 'select 1 x from task_relations where task_id = ? and other_task_id = ? and kind = ?', ta.id, tb.id, r.kind);
        run(db, 'insert or ignore into task_relations (task_id, other_task_id, kind) values (?,?,?)', ta.id, tb.id, r.kind);
        run(db, 'insert or ignore into task_relations (task_id, other_task_id, kind) values (?,?,?)', tb.id, ta.id, INVERSE[r.kind]);
        if (!had) inc('relations');
      }
      if (dropped) (report.warnings as string[]).push(`${dropped} relation${dropped === 1 ? '' : 's'} could not be restored (a task they name is not in the file).`);
      // tag looks: only fill in a tag that has none yet, so importing never overwrites what you chose here
      for (const t of bundle.tagStyles) run(db, "update tags set emoji = case when emoji = '' then ? else emoji end, color = case when color = '' then ? else color end where user_id = ? and title = ?", t.emoji, t.color, user.id, t.title);
      report.tags = Number(get(db, 'select count(*) c from tags where user_id = ?', user.id)!.c) - tagsBefore;
      if (dry) throw new DryRun();
    });
  } catch (e) { if (!(e instanceof DryRun)) throw e; }
  return { ...report, dry };
}
