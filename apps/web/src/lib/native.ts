/** The Android app (apps/android) injects `window.TurboKeepAndroid`; in a browser it is absent and everything here is a no-op. */
export interface AndroidBridge {
  info(): string;
  saveToken(token: string): void;
  hasToken(): boolean;
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
