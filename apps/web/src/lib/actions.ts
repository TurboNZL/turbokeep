import { api, type Note, type NotePatch } from './api.ts';
import { useStore } from './store.ts';
import { android } from './native.ts';
import { copyText, noteLink } from './clip.ts';

/** The list only holds the start of each text (the server sends excerpts), so the editor does not put whole texts back into it. */
export const excerpt = (n: Note): Note => (n.text.length > 400 ? { ...n, text: n.text.slice(0, 400) } : n);

let widgetTimer: number | undefined;
/** The Android widget shows the list: tell it (once, after a short pause) that something changed. */
export function pokeWidgets() {
  window.clearTimeout(widgetTimer);
  widgetTimer = window.setTimeout(() => { try { android()?.refreshWidgets(); } catch { /* no app */ } }, 800);
}

/**
 * Changes a note from anywhere (a row, a menu, the editor's buttons): the list shows the change at once and is put back if the server refuses.
 * Pinning, finishing, filing and the like never touch the text, so they cannot clash with an editor that is open on the same note.
 */
export async function patchNote(id: string, patch: NotePatch): Promise<Note | null> {
  const st = useStore.getState();
  const before = st.notes.find((n) => n.id === id);
  const { base: _base, ...fields } = patch;
  if (before) st.replaceNote({ ...before, ...fields } as Note);
  try {
    const saved = await api.updateNote(id, patch);
    useStore.getState().replaceNote(excerpt(saved));
    if (patch.tags || patch.archived || patch.trashed) void useStore.getState().refreshMeta();
    pokeWidgets();
    return saved;
  } catch (e) {
    if (before) useStore.getState().replaceNote(before);
    useStore.getState().toast((e as Error).message || 'Could not save that change', { tone: 'bad' });
    return null;
  }
}

export async function copyNoteLink(id: string) {
  const ok = await copyText(noteLink(id));
  useStore.getState().toast(ok ? 'Link copied. Paste it into another note to link them.' : `Could not copy. The link is ${noteLink(id)}`, ok ? undefined : { tone: 'bad' });
}
