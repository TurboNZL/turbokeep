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
  return out;
}
