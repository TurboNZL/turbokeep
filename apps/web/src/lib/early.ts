/**
 * index.html starts the plain Home requests (who am I, the list, the tags) before the page code has even downloaded and keeps their promises in `window.__early`.
 * They are used once, and only when they are the requests the page would have made itself.
 */
export interface Early { notes?: Promise<unknown[]>; tags?: Promise<unknown[]>; me?: Promise<unknown> }
export const early = (): Early | undefined => (window as unknown as { __early?: Early }).__early;
export const earlyMe = <T>(): Promise<T> | undefined => { const e = early(); const m = e?.me as Promise<T> | undefined; if (e) delete e.me; return m; };
