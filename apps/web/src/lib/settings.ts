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
  /** Google Keep style: items as a wall of cards, an item opens in a window. */
  keepView: boolean;
  /** How the items are ordered. 'manual' is your own order (drag to change it); the others are automatic and switch dragging off. */
  sort: SortId;
  /** The order of the pages in the side bar, top bar or dock. */
  navOrder: NavId[];
}
export type SortId = 'manual' | 'newest' | 'edited' | 'oldest' | 'title' | 'due';
export type NavId = 'home' | 'archive' | 'bin' | 'settings';
export const NAV_IDS: NavId[] = ['home', 'archive', 'bin', 'settings'];

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'auto', ui: 'auto', layout: 'side', glass: 'regular', wallpaper: false, wallpaperDarkness: 0.35, wallpaperCustom: false,
  themeUpdates: true, themesToken: '', noteFont: 'sans', notePreview: true, keepView: false, sort: 'manual', navOrder: NAV_IDS,
};

const KEY = 'turbokeep.settings';
/** A saved navOrder is used only if it still names every page once (pages were added and removed between versions); missing ones are appended. */
export const cleanNavOrder = (v: unknown): NavId[] => {
  const seen = (Array.isArray(v) ? v : []).filter((x, i, a): x is NavId => NAV_IDS.includes(x as NavId) && a.indexOf(x) === i);
  return [...seen, ...NAV_IDS.filter((x) => !seen.includes(x))];
};
export function loadSettings(): DeviceSettings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } as DeviceSettings;
    if (!['manual', 'newest', 'edited', 'oldest', 'title', 'due'].includes(s.sort)) s.sort = 'manual'; // 'auto' from before
    s.navOrder = cleanNavOrder(s.navOrder);
    return s;
  } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(s: DeviceSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: the choice lasts until the tab closes */ }
}
