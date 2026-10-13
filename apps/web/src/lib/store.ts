import { create } from 'zustand';
import { api, ApiError, type Label, type Note, type Project } from './api.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type DeviceSettings } from './settings.ts';
import { applyAppearance } from './appearance.ts';

interface State {
  settings: DeviceSettings;
  updateSettings(patch: Partial<DeviceSettings>): void;

  user: { id: number; username: string } | null;
  /** 'loading' until the first /api/auth/me answered. */
  auth: 'loading' | 'in' | 'out';
  setUser(u: State['user']): void;

  projects: Project[];
  labels: Label[];
  tags: { title: string; count: number }[];
  refreshMeta(): Promise<void>;
  /** The note list for the Notes page and the last view it showed (so the editor can update one entry without refetching). */
  notes: Note[];
  setNotes(n: Note[]): void;
  upsertNote(n: Note): void;
}

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
  projects: [], labels: [], tags: [],
  async refreshMeta() {
    try {
      const [projects, labels, tags] = await Promise.all([api.projects(), api.labels(), api.tags()]);
      set({ projects, labels, tags });
    } catch (e) { if (e instanceof ApiError && e.status === 401) get().setUser(null); }
  },
  notes: [],
  setNotes: (notes) => set({ notes }),
  upsertNote: (n) => set((s) => ({ notes: s.notes.some((x) => x.id === n.id) ? s.notes.map((x) => (x.id === n.id ? n : x)) : [n, ...s.notes] })),
}));

export { DEFAULT_SETTINGS };
