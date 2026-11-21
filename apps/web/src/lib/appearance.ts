import { githubSource, start, type Appearance, type TurboThemes } from 'turbothemes';
import type { DeviceSettings } from './settings.ts';
import { isLayout } from './layout.ts';
import layoutsCss from '../layouts.css?inline';
import { syncWidgetLook, android } from './native.ts';

/**
 * Colours, UI styles, wallpaper and the scripted extras live in the turbothemes package (turboengine/themes); layouts are this app's own
 * (lib/layout.ts, layouts.css). This file only starts the engine with what is specific to this app and hands the device settings to it.
 */
let engine: TurboThemes | null = null;

const sourceFor = (s: Pick<DeviceSettings, 'themesToken'>) => githubSource({ token: s.themesToken || undefined });

function ensure(s: DeviceSettings): TurboThemes {
  if (engine) return engine;
  engine = start({
    storagePrefix: 'turbokeep',
    fonts: 'none', // the fonts are bundled (src/fonts.css): a self-hosted copy works on a LAN with no internet
    autoUpdate: s.themeUpdates,
    source: sourceFor(s),
  });
  // the layouts' CSS goes after the themes' stylesheet (the engine appended it to <head>), so it wins ties with a style
  const el = document.createElement('style');
  el.id = 'turbokeep-layouts';
  el.textContent = layoutsCss;
  document.head.appendChild(el);
  return engine;
}

/** "h s% l%" (the engine's colour tokens) -> #rrggbb */
const tripletHex = (t: string): string => {
  const m = t.match(/(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return '';
  const h = +m[1], s = +m[2] / 100, l = +m[3] / 100, a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/** Inside the Android app: hands the colours the page is wearing (whatever the engine made of the chosen theme, light/dark and device matching included) to the app for the widgets. */
function shareLookWithWidgets() {
  if (!android()?.setWidgetLook) return;
  requestAnimationFrame(() => {
    const cs = getComputedStyle(document.documentElement);
    const c = (n: string) => tripletHex(cs.getPropertyValue(`--${n}`));
    const look = { ui: document.documentElement.dataset.ui ?? 'default', bg: c('bg'), surface: c('surface'), line: c('line'), fg: c('fg'), muted: c('muted'), accent: c('accent'), bad: c('bad') };
    if (look.bg && look.fg && look.accent) syncWidgetLook(look);
  });
}

/** Applies the whole look from the device settings. */
export function applyAppearance(s: DeviceSettings) {
  ensure(s).apply(s as Appearance);
  shareLookWithWidgets();
  document.documentElement.dataset.layout = isLayout(s.layout) ? s.layout : 'side'; // layouts are this app's, not the themes'
  const st = document.documentElement.style; // the sizes of Home's divisions (Settings > Appearance), read by Home's grid and the Keep wall
  st.setProperty('--rail-w', `${s.railWidth}rem`); st.setProperty('--list-w', `${s.listWidth}rem`); st.setProperty('--card-w', `${s.cardWidth}rem`); st.setProperty('--pane-w', `${s.paneWidth}rem`); st.setProperty('--rail-emoji', `${s.railEmoji}rem`); st.setProperty('--rail-text', `${s.railText}rem`); st.setProperty('--card-gap', `${s.cardGap}rem`);
  st.setProperty('--tk-btn', s.buttonSize === 'large' ? '3.25rem' : s.buttonSize === 'small' ? '2.25rem' : '2.75rem'); // the check box and the pencil on an item
}

/** The running engine (start-up, update checks). Only valid after applyAppearance ran once. */
export function themeEngine(s: DeviceSettings): TurboThemes {
  const e = ensure(s);
  e.setSource(s.themeUpdates ? sourceFor(s) : false);
  return e;
}

export { watchSystemTheme } from 'turbothemes';
