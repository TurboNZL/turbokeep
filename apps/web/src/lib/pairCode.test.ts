import { describe, expect, it } from 'vitest';
import { createPairCodec, decodePairCode, encodePairCode, pairFromSearch, pairLink } from './pairCode.ts';

describe('pairing code', () => {
  it('round-trips, also with non-ASCII', () => {
    const p = { url: 'https://music.example.com', token: 'tok/+=é' };
    expect(decodePairCode(encodePairCode(p))).toEqual(p);
    expect(decodePairCode(encodePairCode({ url: '', token: 'x' }))).toEqual({ url: '', token: 'x' });
  });
  it('carries a Cloudflare Access service token when there is one', () => {
    const p = { url: 'https://m.example.com', token: 't', access: { id: 'abc.access', secret: 'shh' } };
    expect(decodePairCode(encodePairCode(p))).toEqual(p);
    expect(decodePairCode(encodePairCode({ url: '', token: 't', access: { id: '', secret: 'x' } }))).toEqual({ url: '', token: 't' });
  });
  it('survives line breaks and spaces added by a messenger, and a trailing slash', () => {
    const c = encodePairCode({ url: 'http://pi:47813/', token: 'abc' });
    expect(decodePairCode(` ${c.slice(0, 12)}\n${c.slice(12)} `)).toEqual({ url: 'http://pi:47813', token: 'abc' });
  });
  it('rejects anything else', () => {
    for (const bad of ['', 'hello', 'CUR1-', 'CUR1-###', 'CUR1-' + btoa('{"u":"ftp://x","t":"a"}'), 'CUR1-' + btoa('{"u":"http://x"}'), 'CUR1-' + btoa('{"u":"javascript:1","t":"a"}')]) expect(decodePairCode(bad)).toBeNull();
  });
  it('a link carries the code and is read back from the query', () => {
    const c = encodePairCode({ url: 'https://m.example.com', token: 't' });
    const link = pairLink('https://m.example.com/', c);
    expect(link.startsWith('https://m.example.com/?pair=')).toBe(true);
    expect(pairFromSearch(new URL(link).search)).toEqual({ url: 'https://m.example.com', token: 't' });
    expect(pairFromSearch('?x=1')).toBeNull();
  });
  it('each app has its own prefix: one app\'s code is never taken for another\'s', () => {
    const keep = createPairCodec('KEEP1-');
    const code = keep.encode({ url: 'https://k.example.com', token: 't', access: { id: 'i', secret: 's' } });
    expect(code.startsWith('KEEP1-')).toBe(true);
    expect(keep.decode(code)).toEqual({ url: 'https://k.example.com', token: 't', access: { id: 'i', secret: 's' } });
    expect(decodePairCode(code)).toBeNull();
    expect(keep.decode(encodePairCode({ url: '', token: 'x' }))).toBeNull();
  });
});
