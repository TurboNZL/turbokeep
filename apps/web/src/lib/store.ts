import { create } from 'zustand';
import { api, ApiError, type Note, type Project, type TagInfo } from './api.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type DeviceSettings } from './settings.ts';
import { takeMeta } from './prefetch.ts';
import { applyAppearance } from './appearance.ts';

interface State {
  settings: DeviceSettings;
  updateSettings(patch: Partial<DeviceSettings>): void;

  user: { id: number; username: string } | null;
  /** 'loading' until the first /api/auth/me answered. */
  auth: 'loading' | 'in' | 'out';
  setUser(u: State['user']): void;

  projects: Project[];
  tags: TagInfo[];
  refreshMeta(): Promise<void>;
  /** The note list for the Notes page and the last view it showed (so the editor can update one entry without refetching). */
  notes: Note[];
  setNotes(n: Note[]): void;
  /** The note open on Home. Kept when you go to Settings and back, and after a reload, so switching tabs never closes the note you were reading. */
  openNote: string | null;
  setOpenNote(id: string | null): void;
  upsertNote(n: Note): void;
}

function readOpenNote(): string | null { try { return localStorage.getItem('turbokeep.openNote'); } catch { return null; } }

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
  projects: [], tags: [],
  async refreshMeta() {
    try {
      const [projects, tags] = await (takeMeta() ?? Promise.all([api.projects(), api.tags()]));
      set({ projects, tags });
    } catch (e) { if (e instanceof ApiError && e.status === 401) get().setUser(null); }
  },
  notes: [],
  setNotes: (notes) => set({ notes }),
  openNote: readOpenNote(),
  setOpenNote: (id) => { try { id ? localStorage.setItem('turbokeep.openNote', id) : localStorage.removeItem('turbokeep.openNote'); } catch { /* private window */ } set({ openNote: id }); },
  upsertNote: (n) => set((s) => ({ notes: s.notes.some((x) => x.id === n.id) ? s.notes.map((x) => (x.id === n.id ? n : x)) : [n, ...s.notes] })),
}));

export { DEFAULT_SETTINGS };
