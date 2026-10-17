import { appFetch } from './native.ts';

export interface SpeedLine { label: string; ms: number | null; note: string }

/** Time until the first bytes of a response arrive (headers plus the first chunk), the figure a person feels as "it hangs before it starts". */
async function firstByte(f: typeof fetch, url: string, init: RequestInit): Promise<{ ms: number; status: number }> {
  const t0 = performance.now();
  const res = await f(url, init);
  const reader = res.body?.getReader();
  if (reader) { await reader.read(); void reader.cancel().catch(() => {}); } else await res.arrayBuffer();
  return { ms: Math.round(performance.now() - t0), status: res.status };
}

/**
 * Where the delay is: the server's own answer, a second one on a warm connection, and whether the Cloudflare Access token is accepted. TurboMusic's speed
 * test without the song and cover lines. Runs from the page, so inside the Android app it measures the path the page's own requests take (through the app's proxy).
 */
export async function speedTest(base: string, headers: Record<string, string>, token: string, f: typeof fetch = fetch): Promise<SpeedLine[]> {
  const out: SpeedLine[] = [];
  const guard = async (label: string, init: RequestInit, path: string, note: (status: number) => string) => {
    try { const r = await firstByte(f, base + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, cache: 'no-store' }); out.push({ label, ms: r.ms, note: note(r.status) }); }
    catch (e) { out.push({ label, ms: null, note: (e as Error).message === 'Failed to fetch' ? 'could not connect' : (e as Error).message }); }
  };
  await guard('Server answers', {}, '/api/health', (s) => (s === 200 ? 'ok' : s === 302 || s === 401 || s === 403 ? `HTTP ${s}: Cloudflare Access is refusing the request, check the service token` : `HTTP ${s}`));
  await guard('Server answers again (connection reused)', {}, '/api/health', () => 'a second request on a warm connection; far smaller than the first means the first was mostly the connection set-up');
  if (token) await guard('Signed-in request', { headers: { Authorization: `Bearer ${token}` } }, '/api/auth/me', (s) => (s === 200 ? 'the token is accepted' : s === 401 ? 'the server does not know this token' : `HTTP ${s}`));
  // A request with a body (sign-in, saving) is not a GET: the page sends it itself, so the server's answer has to allow this page (CORS) and Cloudflare Access has to let the preflight and the POST through. The GET lines above cannot show that.
  // Harmless: it is refused (not signed in, or a wrong body) and changes nothing; any answer at all means the page may talk to the server.
  try {
    const t0 = performance.now();
    const res = await appFetch(base + '/api/auth/password', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: '{}' });
    const r = { ms: Math.round(performance.now() - t0), status: res.status };
    const sample = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 60);
    const json = (() => { try { JSON.parse(sample.length < 60 ? sample : '{}'); return true; } catch { return false; } })();
    out.push({ label: 'Write request (POST)', ms: r.ms, note: r.status === 401 || r.status === 400 || r.status === 403 || r.status === 404 || r.status === 405 ? `answered HTTP ${r.status}: the page may send requests with a body (it was refused on purpose)` : r.status >= 300 && r.status < 400 ? `HTTP ${r.status}: redirected (to ${res.headers.get('location')?.slice(0, 60) ?? '?'}): Cloudflare Access did not accept the service token for this request` : r.status === 200 && !json ? `HTTP 200 but not TurboKeep data (${res.headers.get('content-type') ?? 'no type'}: "${sample}"): usually Cloudflare Access's sign-in page` : `HTTP ${r.status}` });
  } catch (e) {
    out.push({ label: 'Write request (POST)', ms: null, note: 'did not get an answer. GET works, so look at the Access application (it must let POST through for the service token). ' + ((e as Error).message ?? '') });
  }
  // Where exactly does a write fail? Three plain browser requests, from the page, each narrower than the last (the app's own write above skips all of them).
  const probe = async (label: string, init: RequestInit, ok: (r: Response) => string, bad: string) => {
    const t0 = performance.now();
    try { const r = await f(base + '/api/auth/password', { ...init, cache: 'no-store' }); out.push({ label, ms: Math.round(performance.now() - t0), note: ok(r) }); }
    catch (e) { out.push({ label, ms: null, note: `${bad} (${(e as Error).message})` }); }
  };
  await probe('Browser POST, no extra headers (no preflight)', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }, (r) => `HTTP ${r.status}: the server's answer is readable by the page`, 'no readable answer: the connection failed, or the answer has no Access-Control-Allow-Origin for this page');
  await probe('Browser POST, reachable at all? (no-cors)', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: '{}' }, () => 'the request reached something (the answer is hidden on purpose)', 'it did not even reach the server: network, address or Cloudflare');
  await probe('Browser POST with the headers the app uses (needs a preflight)', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: '{}' }, (r) => `HTTP ${r.status}: preflight and write both fine`, 'the preflight was refused or its answer was wrong: Access or the server did not allow these headers from this page');
  return out;
}
