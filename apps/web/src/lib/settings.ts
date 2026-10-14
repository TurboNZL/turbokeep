import type { LayoutId } from './layout.ts';

/** Per-device choices (look, behaviour). They live in this browser, not on the server: a phone and a desktop can look different. */
export interface DeviceSettings {
  theme: string;
  ui: string;
  layout: LayoutId;
  glass: 'regular' | 'clear';
  wallpaper: boolean;
  wallpaperDarkness: number;
  wallpaperCustom: boolean;
  themeUpdates: boolean;
  themesToken: string;
  noteFont: 'sans' | 'mono';
  /** Show the Markdown preview next to the editor for notes of type markdown. */
  notePreview: boolean;
  /** Google Keep style: notes and tasks as a wall of cards, an item opens in a window. */
  keepView: boolean;
  /** How the notes are ordered. 'auto': newest first on the Keep wall, the server's order (due dates for tasks) in the list. */
  sort: SortId;
}
export type SortId = 'auto' | 'newest' | 'edited' | 'oldest' | 'title';

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'auto', ui: 'auto', layout: 'side', glass: 'regular', wallpaper: false, wallpaperDarkness: 0.35, wallpaperCustom: false,
  themeUpdates: true, themesToken: '', noteFont: 'sans', notePreview: true, keepView: false, sort: 'auto',
};

const KEY = 'turbokeep.settings';
export function loadSettings(): DeviceSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(s: DeviceSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: the choice lasts until the tab closes */ }
}
