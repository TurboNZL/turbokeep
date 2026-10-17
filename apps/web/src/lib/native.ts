/** The Android app (apps/android) injects `window.TurboKeepAndroid`; in a browser it is absent and everything here is a no-op. */
export interface AndroidBridge {
  info(): string;
  saveToken(token: string): void;
  hasToken(): boolean;
  /** the server's address and this phone's API token: inside the app the page is bundled (http://localhost) and talks to the server across origins with them */
  serverUrl(): string;
  token(): string;
  accessInjected?(): boolean;
  accessHeaders(): string;
  refreshWidgets(): void;
  changeServer(): void;
  openWidgetSettings(): void;
  checkUpdate(): void;
  installUpdate(): void;
  setUpdateToken(token: string): void;
  saveFile(name: string, mime: string, base64: string): boolean;
}
export interface UpdateState { status: 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error'; version?: string; percent?: number; message?: string }
export interface AndroidInfo { version: string; serverUrl: string; hasToken: boolean; hasUpdateToken: boolean; update: UpdateState }

export const android = (): AndroidBridge | null => (window as unknown as { TurboKeepAndroid?: AndroidBridge }).TurboKeepAndroid ?? null;
/** the Cloudflare Access service token's headers when the Android app holds one (every request of the page must carry them behind Access); {} elsewhere */
let access: Record<string, string> | null = null;
export const accessHeaders = (): Record<string, string> => {
  if (access) return access;
  try { const b = android(); access = b?.accessHeaders ? (JSON.parse(b.accessHeaders()) as Record<string, string>) : {}; } catch { access = {}; }
  return access;
};
/** Inside the Android app: the server's address ('' in a browser, where the page is the server's own and relative addresses work). */
export const serverBase = (): string => { try { return android()?.serverUrl().replace(/\/+$/, '') ?? ''; } catch { return ''; } };
/** Inside the Android app: the bearer token for the server ('' when not signed in yet, or in a browser, where the session cookie does it). */
export const appToken = (): string => { try { return android()?.token() ?? ''; } catch { return ''; } };
/** The address of something on the server: a browser-relative path as it is, inside the app the server's own address in front. */
export const serverUrl = (path: string): string => serverBase() + path;
/** The headers every request to the server carries inside the app (bearer token, Cloudflare Access service token); none in a browser. */
export const appHeaders = (): Record<string, string> => {
  if (!android()) return {};
  const t = appToken();
  return { ...accessHeaders(), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};
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
