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
  /** Markdown notes show the rendered text until you click into them; with this on, the editor and the preview sit side by side instead. */
  markdownSplit: boolean;
  /** How Home shows items: 'list' (a column with the editor beside it), 'wall' (Google Keep: cards, an item opens in a window) or 'pane' (cards, an item opens in a panel on the right). */
  viewStyle: ViewStyle;
  /** On the Home list with nothing open, the list takes the whole width (no panel beside it). */
  fullWhenIdle: boolean;
  /** The divider between the list and the open note shows itself when the open note is not under the tag the list is showing. */
  dividerWhenForeign: boolean;
  /** Where tasks that carry a tag are counted and listed under that tag: never (only notes sent to the tag), on Home, in the Archive, or both. */
  countTasks: CountTasks;
  /** How much the page remembers so it opens faster (see lib/cache.ts). */
  cacheLevel: CacheLevel;
  /** The size of the buttons on an item (the check box, the pencil, the dots). */
  buttonSize: 'small' | 'medium' | 'large';
  /** The width of the editor panel beside the Keep wall, in rem (drag the divider to change it). */
  paneWidth: number;
  /** The size of an emoji and of the name in the tags column, and the space between cards of the Keep views, all in rem. */
  railEmoji: number;
  railText: number;
  cardGap: number;
  /** In the Keep views: typing the first letter in the add box opens the item straight away (in its window or panel) with that letter in it. */
  popupOnType: boolean;
  /** With popupOnType: the item made by typing opens above the list instead (the add box grows into the editor and the page splits from the top). */
  editorOnTop: boolean;
  /** The Cloudflare Access service token of this server, kept for the pairing code (the phone needs it when the server sits behind Cloudflare Access). */
  cfAccessId: string;
  cfAccessSecret: string;
  /** Inside the Android app (the page is bundled, like TurboMusic's): the server's address and this device's API token. Empty in a browser, where the page is the server's own. */
  serverUrl: string;
  token: string;
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
export type CountTasks = 'never' | 'home' | 'archive' | 'both';
export type CacheLevel = 'off' | 'low' | 'medium' | 'high';
export type ViewStyle = 'list' | 'wall' | 'pane';
export type SortId = 'manual' | 'newest' | 'edited' | 'oldest' | 'title' | 'due';
export type NavId = 'home' | 'archive' | 'bin' | 'settings';
export const SIZE_LIMITS = { railWidth: { min: 7, max: 22, step: 0.5 }, listWidth: { min: 12, max: 90, step: 1 }, cardWidth: { min: 11, max: 30, step: 0.5 }, paneWidth: { min: 16, max: 90, step: 1 }, railEmoji: { min: 0.875, max: 2.5, step: 0.125 }, railText: { min: 0.75, max: 1.25, step: 0.0625 }, cardGap: { min: 0, max: 2, step: 0.125 } } as const;
export const SORT_IDS: SortId[] = ['manual', 'newest', 'edited', 'oldest', 'title', 'due'];
export const NAV_IDS: NavId[] = ['home', 'archive', 'bin', 'settings'];

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'auto', ui: 'auto', layout: 'side', glass: 'regular', wallpaper: false, wallpaperDarkness: 0.35, wallpaperCustom: false,
  themeUpdates: true, themesToken: '', noteFont: 'sans', markdownSplit: false, viewStyle: 'list', cfAccessId: '', cfAccessSecret: '', serverUrl: '', token: '', fullWhenIdle: false, dividerWhenForeign: false, countTasks: 'never', cacheLevel: 'medium', buttonSize: 'medium', paneWidth: 28, railEmoji: 1.25, railText: 0.875, cardGap: 0.75, popupOnType: false, editorOnTop: false, sort: 'manual', sorts: {}, railWidth: 11, listWidth: 28, cardWidth: 16, navOrder: NAV_IDS,
};

const KEY = 'turbokeep.settings';
/** A saved navOrder is used only if it still names every page once (pages were added and removed between versions); missing ones are appended. */
export const cleanNavOrder = (v: unknown): NavId[] => {
  const seen = (Array.isArray(v) ? v : []).filter((x, i, a): x is NavId => NAV_IDS.includes(x as NavId) && a.indexOf(x) === i);
  return [...seen, ...NAV_IDS.filter((x) => !seen.includes(x))];
};
export function loadSettings(): DeviceSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const s = { ...DEFAULT_SETTINGS, ...raw } as DeviceSettings;
    if (!['list', 'wall', 'pane'].includes(s.viewStyle)) s.viewStyle = raw.keepView ? 'wall' : 'list'; // the Keep switch from before
    if (!SORT_IDS.includes(s.sort)) s.sort = 'manual'; // 'auto' from before
    s.sorts = Object.fromEntries(Object.entries(s.sorts && typeof s.sorts === 'object' ? s.sorts : {}).filter(([, v]) => SORT_IDS.includes(v as SortId))) as Record<string, SortId>;
    for (const k of ['railWidth', 'listWidth', 'cardWidth', 'paneWidth', 'railEmoji', 'railText', 'cardGap'] as const) { const l = SIZE_LIMITS[k]; s[k] = Number.isFinite(s[k]) ? Math.min(l.max, Math.max(l.min, s[k])) : DEFAULT_SETTINGS[k]; }
    s.navOrder = cleanNavOrder(s.navOrder);
    return s;
  } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(s: DeviceSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: the choice lasts until the tab closes */ }
}
