import { useEffect, useState } from 'react';
import { cn } from './cn.ts';
import { android, appHeaders, serverUrl } from './native.ts';

/** An emoji you imported is kept by the tag as `:<12 hex>:`; anything else is a normal emoji character. */
export const isCustomEmoji = (e: string) => /^:[0-9a-f]{12}:$/.test(e);
export const emojiUrl = (e: string) => `/api/emoji/${e.slice(1, -1)}`;

/**
 * Inside the Android app an `<img>` cannot carry the bearer token (and the page is not the server's origin), so the picture is fetched with it once and kept as a blob
 * address for as long as the page lives. A browser just uses the address (it keeps the picture for a year: the address never changes).
 */
const fetched = new Map<string, Promise<string>>();
function appPicture(id: string): Promise<string> {
  let p = fetched.get(id);
  if (!p) {
    p = fetch(serverUrl(`/api/emoji/${id}`), { credentials: 'omit', headers: appHeaders() }).then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return URL.createObjectURL(await r.blob()); });
    p.catch(() => fetched.delete(id)); // try again the next time it is drawn
    fetched.set(id, p);
  }
  return p;
}
function useEmojiSrc(value: string): string | undefined {
  const inApp = !!android() && isCustomEmoji(value);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (!inApp) return;
    let live = true;
    appPicture(value.slice(1, -1)).then((u) => { if (live) setSrc(u); }, () => {});
    return () => { live = false; };
  }, [inApp, value]);
  return inApp ? src : isCustomEmoji(value) ? emojiUrl(value) : undefined;
}

/** An emoji, either the character or the picture you imported. */
export function Emoji({ value, className }: { value: string; className?: string }) {
  const src = useEmojiSrc(value);
  if (isCustomEmoji(value)) return <img src={src} alt="" width={20} height={20} className={cn('inline-block h-[1.15em] w-[1.15em] shrink-0 object-contain align-[-0.2em]', className)} draggable={false} />;
  return <span aria-hidden className={className}>{value}</span>;
}

/** Every imported emoji is made this many pixels square (an emoji is shown at 20 to 40, so this stays sharp on a phone and loads at once). */
export const EMOJI_PX = 96;

/**
 * Shrinks any picture (a 4k photo included) to an EMOJI_PX square PNG and returns it as base64. The edges of the longer side are cropped away so the result is a full square (no empty bands).
 * The browser scales it while decoding when it can, so a big image never has to be held at full size.
 */
export async function resizeToEmoji(file: Blob): Promise<string> {
  let bmp: ImageBitmap | HTMLImageElement;
  try { bmp = await createImageBitmap(file); }
  catch { // a picture createImageBitmap cannot read (an SVG): an image element can
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); bmp = img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width, h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  if (!w || !h) throw new Error('That picture has no size');
  const side = Math.min(w, h), sx = (w - side) / 2, sy = (h - side) / 2; // the centre square: the longer sides are cut off
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = EMOJI_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, EMOJI_PX, EMOJI_PX);
  if ('close' in bmp) bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Could not make the picture');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
