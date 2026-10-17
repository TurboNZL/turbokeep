/** The Android app (apps/android) injects `window.TurboKeepAndroid`; in a browser it is absent and everything here is a no-op. */
export interface AndroidBridge {
  info(): string;
  /** the page tells the app which server it uses and how to sign in there (TurboMusic's bridge does the same): the widget and quick add need them, and AccessProxy needs the address */
  setServer(url: string, token: string): void;
  setAccess(id: string, secret: string): void;
  accessInjected?(): boolean;
  refreshWidgets(): void;
  openWidgetSettings(): void;
  checkUpdate(): void;
  installUpdate(): void;
  setUpdateToken(token: string): void;
  saveFile(name: string, mime: string, base64: string): boolean;
}
export interface UpdateState { status: 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error'; version?: string; percent?: number; message?: string }
export interface AndroidInfo { version: string; serverUrl: string; hasToken: boolean; hasUpdateToken: boolean; update: UpdateState }

export const android = (): AndroidBridge | null => (window as unknown as { TurboKeepAndroid?: AndroidBridge }).TurboKeepAndroid ?? null;
/**
 * The connection inside the Android app, kept here so api.ts can read it without importing the store (which imports api.ts). The store feeds it from the
 * saved settings (`setConnection`) at start and whenever they change, and hands it to the app (`syncNativeServer`). In a browser nothing is set.
 */
interface Connection { serverUrl: string; token: string; cfAccessId: string; cfAccessSecret: string }
let conn: Connection = { serverUrl: '', token: '', cfAccessId: '', cfAccessSecret: '' };
export const setConnection = (s: Connection) => { conn = { serverUrl: s.serverUrl.trim().replace(/\/+$/, ''), token: s.token.trim(), cfAccessId: s.cfAccessId.trim(), cfAccessSecret: s.cfAccessSecret.trim() }; };
/** Called by the store: when the page itself learns a token (sign-in inside the app) it must be saved with the other settings. */
let tokenSink: (token: string) => void = () => {};
export const onNewToken = (f: (token: string) => void) => { tokenSink = f; };
export const giveToken = (token: string) => tokenSink(token);

/** The two headers a server behind Cloudflare Access wants (blank when no service token is set). */
export const accessHeaders = (): Record<string, string> =>
  conn.cfAccessId && conn.cfAccessSecret ? { 'CF-Access-Client-Id': conn.cfAccessId, 'CF-Access-Client-Secret': conn.cfAccessSecret } : {};
/** Inside the Android app: the server's address ('' in a browser, where the page is the server's own and relative addresses work). */
export const serverBase = (): string => (android() ? conn.serverUrl : '');
/** The address of something on the server: a browser-relative path as it is, inside the app the server's own address in front. */
export const serverUrl = (path: string): string => serverBase() + path;
/** The headers every request to the server carries inside the app (bearer token, Cloudflare Access service token); none in a browser. */
export const appHeaders = (): Record<string, string> => (android() ? { ...accessHeaders(), ...(conn.token ? { Authorization: `Bearer ${conn.token}` } : {}) } : {});

/** Tells the Android app which server this device uses (the widget and AccessProxy read it). No effect elsewhere. */
export function syncNativeServer(s: Connection): void {
  setConnection(s);
  const b = android();
  if (!b) return;
  try { b.setServer(conn.serverUrl, conn.token); b.setAccess(conn.cfAccessId, conn.cfAccessSecret); } catch { /* an old app without these calls */ }
}
export const androidInfo = (): AndroidInfo | null => { try { const b = android(); return b ? (JSON.parse(b.info()) as AndroidInfo) : null; } catch { return null; } };

/** Hands a file to the app, which saves it into Downloads (a blob link cannot be downloaded in a web view). */
export function saveWithApp(blob: Blob, name: string): Promise<boolean> {
  const b = android();
  if (!b) return Promise.resolve(false);
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(b.saveFile(name, blob.type, String(r.result).split(',')[1] ?? ''));
    r.onerror = () => resolve(false);
    r.readAsDataURL(blob);
  });
}
