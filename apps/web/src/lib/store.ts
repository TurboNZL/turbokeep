import { create } from 'zustand';
import { api, ApiError, type Note, type TagInfo } from './api.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type DeviceSettings } from './settings.ts';
import { takeMeta } from './prefetch.ts';
import { applyAppearance } from './appearance.ts';
import { tasksInTags } from './views.ts';
import { onNewToken, syncNativeServer } from './native.ts';
import { cacheLevel, ownCache, recall, remember, setCacheLevel } from './cache.ts';

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
  /** What each page (home, archive) last showed, so leaving it for another page and coming back finds the same item open and the same tag chosen. */
  pages: Record<string, { id: string | null; search: string }>;
  setPage(page: string, id: string | null, search: string): void;

  toasts: Toast[];
  toast(message: string, o?: Pick<Toast, 'action' | 'tone'>): void;
  dismissToast(id: number): void;
}

function readOpenNote(): string | null { try { return localStorage.getItem('turbokeep.openNote'); } catch { return null; } }
function readPages(): Record<string, { id: string | null; search: string }> { try { return JSON.parse(localStorage.getItem('turbokeep.pages') ?? '{}'); } catch { return {}; } }
/** Who was signed in last time on this device: the page opens as that person at once (their remembered list is shown) and asks the server in the background; a refusal there shows the sign-in page. */
function readUser(): { id: number; username: string } | null {
  try { const u = JSON.parse(localStorage.getItem('turbokeep.user') ?? 'null'); return u && typeof u.id === 'number' && typeof u.username === 'string' && cacheLevel() !== 'off' ? u : null; } catch { return null; }
}
function saveUser(u: { id: number; username: string } | null) { try { if (u) localStorage.setItem('turbokeep.user', JSON.stringify(u)); else localStorage.removeItem('turbokeep.user'); } catch { /* private window */ } }
let toastId = 0;

export const useStore = create<State>((set, get) => ({
  settings: (() => { const s = loadSettings(); setCacheLevel(s.cacheLevel); return s; })(),
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    if (patch.cacheLevel) setCacheLevel(settings.cacheLevel);
    if (['serverUrl', 'token', 'cfAccessId', 'cfAccessSecret'].some((k) => k in patch)) syncNativeServer(settings);
    set({ settings });
    if (patch.countTasks !== undefined) void get().refreshMeta(); // the tags column counts differently now: ask again at once, no reload needed
    applyAppearance(settings);
  },
  user: readUser(), auth: readUser() ? 'in' : 'loading', // the person who was signed in last time (the settings above are read first, so the cache level is known)
  setUser: (user) => { ownCache(user?.id ?? null); saveUser(user); set({ user, auth: user ? 'in' : 'out' }); },
  tags: recall<TagInfo[]>('tags') ?? [],
  async refreshMeta() {
    // the prefetched answer was asked before signing in when this is a fresh sign-in: a refusal there is stale, so ask again
    const withTasks = tasksInTags(get().settings.countTasks, false);
    try { const tags = await ((withTasks ? null : takeMeta()) ?? api.tags('live', withTasks)).catch(() => api.tags('live', withTasks)); remember('tags', tags); set({ tags }); } catch (e) { if (e instanceof ApiError && e.status === 401) get().setUser(null); }
  },
  notes: [],
  setNotes: (notes) => set({ notes }),
  upsertNote: (n) => set((s) => ({ notes: s.notes.some((x) => x.id === n.id) ? s.notes.map((x) => (x.id === n.id ? n : x)) : [n, ...s.notes] })),
  replaceNote: (n) => set((s) => (s.notes.some((x) => x.id === n.id) ? { notes: s.notes.map((x) => (x.id === n.id ? n : x)) } : s)),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((x) => x.id !== id) })),
  pages: readPages(),
  setPage: (page, id, search) => set((s) => { const pages = { ...s.pages, [page]: { id, search } }; try { localStorage.setItem('turbokeep.pages', JSON.stringify(pages)); } catch { /* private window */ } return { pages }; }),
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

// inside the Android app the page is bundled and the connection lives in these settings (as in TurboMusic): feed it to api.ts and to the app at start,
// and save a token the page learns by itself (signing in)
syncNativeServer(useStore.getState().settings);
onNewToken((token) => useStore.getState().updateSettings({ token }));
