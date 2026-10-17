import { serverBase } from './native.ts';

/** Copies text. navigator.clipboard needs https or localhost, and a TurboKeep on a home network is often plain http, so there is a fallback. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* not allowed here: try the old way */ }
  try {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

/** The link to a note: paste it into another note and it opens this one. Inside the Android app the page is http://localhost, so the link uses the server's address (the same link a browser makes). */
export const noteLink = (id: string) => `${serverBase() || location.origin}/home/${id}`;
const LINK = /\/home\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
/** The ids of the notes a text links to (once each, in order). */
export function linkedNotes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(LINK)) { const id = m[1]!.toLowerCase(); if (!out.includes(id)) out.push(id); }
  return out;
}
