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
  /** How the items are ordered when a page or tab has no choice of its own. 'manual' is your own order (drag to change it); the others are automatic and switch dragging off. */
  sort: SortId;
  /** The order each page and tab chose (see `sortKey` in views.ts: 'list', 'all', 'tag:work', 'archive:list' ...). */
  sorts: Record<string, SortId>;
  /** The width of the divisions of Home, in rem: the tag column, the list of items, a card of the Keep wall. */
  railWidth: number;
  listWidth: number;
  cardWidth: number;
  /** The order of the pages in the side bar, top bar or dock. */
  navOrder: NavId[];
}
export type SortId = 'manual' | 'newest' | 'edited' | 'oldest' | 'title' | 'due';
export type NavId = 'home' | 'archive' | 'bin' | 'settings';
export const SIZE_LIMITS = { railWidth: { min: 7, max: 22, step: 0.5 }, listWidth: { min: 18, max: 52, step: 1 }, cardWidth: { min: 11, max: 30, step: 0.5 } } as const;
export const SORT_IDS: SortId[] = ['manual', 'newest', 'edited', 'oldest', 'title', 'due'];
export const NAV_IDS: NavId[] = ['home', 'archive', 'bin', 'settings'];

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'auto', ui: 'auto', layout: 'side', glass: 'regular', wallpaper: false, wallpaperDarkness: 0.35, wallpaperCustom: false,
  themeUpdates: true, themesToken: '', noteFont: 'sans', notePreview: true, keepView: false, sort: 'manual', sorts: {}, railWidth: 11, listWidth: 28, cardWidth: 16, navOrder: NAV_IDS,
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
    if (!SORT_IDS.includes(s.sort)) s.sort = 'manual'; // 'auto' from before
    s.sorts = Object.fromEntries(Object.entries(s.sorts && typeof s.sorts === 'object' ? s.sorts : {}).filter(([, v]) => SORT_IDS.includes(v as SortId))) as Record<string, SortId>;
    for (const k of ['railWidth', 'listWidth', 'cardWidth'] as const) { const l = SIZE_LIMITS[k]; s[k] = Number.isFinite(s[k]) ? Math.min(l.max, Math.max(l.min, s[k])) : DEFAULT_SETTINGS[k]; }
    s.navOrder = cleanNavOrder(s.navOrder);
    return s;
  } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(s: DeviceSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: the choice lasts until the tab closes */ }
}
