import type { CSSProperties } from 'react';
import type { TagInfo } from './api.ts';

/** The colours (and first emoji) of the tags a note carries, in tag order. Colour is what makes a tag readable at a glance, so it is used loudly. */
export function looksOf(all: TagInfo[], titles: string[]): { colors: string[]; emojis: string[] } {
  const colors: string[] = [], emojis: string[] = [];
  for (const t of titles) {
    const i = all.find((x) => x.title === t);
    if (i?.color && !colors.includes(i.color)) colors.push(i.color);
    if (i?.emoji) emojis.push(i.emoji);
  }
  return { colors: colors.slice(0, 4), emojis };
}

/** A bar down the left edge: one colour, or the colours stacked when there are several. */
export function stripe(colors: string[]): CSSProperties | undefined {
  if (!colors.length) return undefined;
  const step = 100 / colors.length;
  return { background: colors.length === 1 ? `#${colors[0]}` : `linear-gradient(to bottom, ${colors.map((c, i) => `#${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})` };
}
/** A soft wash across the row in the tag's colour (the first colour leads, the others follow). */
export function wash(colors: string[]): CSSProperties | undefined {
  if (!colors.length) return undefined;
  const c = colors.map((x) => `color-mix(in srgb, #${x} 20%, transparent)`);
  return { background: `linear-gradient(100deg, ${c.join(', ')}${c.length === 1 ? ', ' : ', '}transparent 78%)` };
}
