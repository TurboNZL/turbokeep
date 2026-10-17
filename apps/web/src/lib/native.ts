/** The Android app (apps/android) injects `window.TurboKeepAndroid`; in a browser it is absent and everything here is a no-op. */
export interface AndroidBridge {
  info(): string;
  /** the page tells the app which server it uses and how to sign in there (TurboMusic's bridge does the same): the widget and quick add need them, and AccessProxy needs the address */
  setServer(url: string, token: string): void;
  setAccess(id: string, secret: string): void;
  accessInjected?(): boolean;
  /** a request done by the app itself (no CORS preflight); the answer arrives as the `turbokeep-request` event. Absent in an older app. */
  request?(id: string, method: string, url: string, headersJson: string, bodyBase64: string): void;
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

// ---- requests with a body, done by the app
let nextRequest = 0;
const waiting = new Map<string, { ok: (r: Response) => void; fail: (e: Error) => void }>();
if (typeof window !== 'undefined') {
  window.addEventListener('turbokeep-request', (e) => {
    const d = (e as CustomEvent<{ id: string; status?: number; body?: string; error?: string; type?: string; location?: string }>).detail;
    const w = waiting.get(d.id);
    if (!w) return;
    waiting.delete(d.id);
    if (d.error !== undefined || d.status === undefined) { w.fail(new Error(d.error ?? 'No answer')); return; }
    const bytes = Uint8Array.from(atob(d.body ?? ''), (c) => c.charCodeAt(0));
    w.ok(new Response(d.status === 204 || d.status === 205 || d.status === 304 ? null : bytes, { status: d.status, headers: { ...(d.type ? { 'content-type': d.type } : {}), ...(d.location ? { location: d.location } : {}) } }));
  });
}
const toBase64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
/** Bodies bigger than this go through the web view's own fetch (a base64 string over the bridge is not meant for tens of megabytes). */
const NATIVE_BODY_LIMIT = 8 * 1024 * 1024;

/**
 * fetch for the server. In a browser it is just fetch. Inside the Android app a request with a body (anything but GET and HEAD) is done by the app itself:
 * the web view would send a CORS preflight that Cloudflare Access refuses (it cannot carry the service token), see `TurboKeepBridge.request`.
 * Reads still go through fetch and the app's AccessProxy.
 */
export async function appFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string | FormData } = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const bridge = android();
  if (!bridge?.request || method === 'GET' || method === 'HEAD') return fetch(url, { ...init, credentials: bridge ? 'omit' : 'same-origin' });
  const headers = { ...(init.headers ?? {}) };
  let bytes = new Uint8Array();
  if (typeof init.body === 'string') bytes = new TextEncoder().encode(init.body);
  else if (init.body) { // a form: let the browser make the multipart body and its boundary
    const r = new Request('http://localhost/', { method: 'POST', body: init.body });
    headers['Content-Type'] = r.headers.get('content-type') ?? headers['Content-Type'] ?? '';
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  if (bytes.length > NATIVE_BODY_LIMIT) return fetch(url, { ...init, credentials: 'omit' });
  const id = String(++nextRequest);
  return new Promise<Response>((ok, fail) => {
    waiting.set(id, { ok, fail });
    try { bridge.request!(id, method, url, JSON.stringify(headers), toBase64(bytes)); } catch (e) { waiting.delete(id); fail(e as Error); }
  });
}
