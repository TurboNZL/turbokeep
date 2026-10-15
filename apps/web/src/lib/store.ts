import { create } from 'zustand';
import { api, ApiError, type Note, type TagInfo } from './api.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type DeviceSettings } from './settings.ts';
import { takeMeta } from './prefetch.ts';
import { applyAppearance } from './appearance.ts';

export interface Toast { id: number; message: string; tone?: 'bad'; action?: { label: string; run: () => void } }

interface State {
  settings: DeviceSettings;
  updateSettings(patch: Partial<DeviceSettings>): void;

  user: { id: number; username: string } | null;
  /** 'loading' until the first /api/auth/me answered. */
  auth: 'loading' | 'in' | 'out';
  setUser(u: State['user']): void;

  tags: TagInfo[];
  refreshMeta(): Promise<void>;
  /** The list Home is showing (so the editor and the menus can update one entry without asking the server again). */
  notes: Note[];
  setNotes(n: Note[]): void;
  upsertNote(n: Note): void;
  /** like upsertNote, but only when the list already has the note (an editor must not add a note to a list it does not belong in) */
  replaceNote(n: Note): void;
  removeNote(id: string): void;
  /** The note open on Home. Kept when you go to Settings and back, and after a reload, so switching tabs never closes the note you were reading. */
  openNote: string | null;
  setOpenNote(id: string | null): void;

  toasts: Toast[];
  toast(message: string, o?: Pick<Toast, 'action' | 'tone'>): void;
  dismissToast(id: number): void;
}

function readOpenNote(): string | null { try { return localStorage.getItem('turbokeep.openNote'); } catch { return null; } }
let toastId = 0;

export const useStore = create<State>((set, get) => ({
  settings: loadSettings(),
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
    applyAppearance(settings);
  },
  user: null, auth: 'loading',
  setUser: (user) => set({ user, auth: user ? 'in' : 'out' }),
  tags: [],
  async refreshMeta() {
    // the prefetched answer was asked before signing in when this is a fresh sign-in: a refusal there is stale, so ask again
    try { set({ tags: await (takeMeta() ?? api.tags()).catch(() => api.tags()) }); } catch (e) { if (e instanceof ApiError && e.status === 401) get().setUser(null); }
  },
  notes: [],
  setNotes: (notes) => set({ notes }),
  upsertNote: (n) => set((s) => ({ notes: s.notes.some((x) => x.id === n.id) ? s.notes.map((x) => (x.id === n.id ? n : x)) : [n, ...s.notes] })),
  replaceNote: (n) => set((s) => (s.notes.some((x) => x.id === n.id) ? { notes: s.notes.map((x) => (x.id === n.id ? n : x)) } : s)),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((x) => x.id !== id) })),
  openNote: readOpenNote(),
  setOpenNote: (id) => { try { id ? localStorage.setItem('turbokeep.openNote', id) : localStorage.removeItem('turbokeep.openNote'); } catch { /* private window */ } set({ openNote: id }); },
  toasts: [],
  toast(message, o) {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, ...o }] }));
    setTimeout(() => get().dismissToast(id), o?.action ? 7000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export { DEFAULT_SETTINGS };
