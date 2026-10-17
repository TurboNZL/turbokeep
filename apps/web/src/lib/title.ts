import { dateTitle } from './dates.ts';

/** A title longer than this does not fit as a title: it moves into the description and the note gets the date as its title. */
export const TITLE_MAX = 150;

/**
 * Called with what the title box holds after a keystroke. Short enough: nothing changes (null). Too long: the whole text moves to the start of the
 * description, the title becomes the default date title, and `caret` is where typing continues inside the new description: where the cursor was in the title (`at`, the box's selectionStart), else the end of the moved text.
 */
export function titleOverflow(title: string, text: string, at?: number | null, now = new Date()): { title: string; text: string; caret: number } | null {
  if (title.length <= TITLE_MAX) return null;
  const moved = title; // (the last character may be the space between two words: it must reach the description, or the next word would stick to the previous one)
  return { title: dateTitle(now), text: text ? `${moved}\n\n${text}` : moved, caret: at == null ? moved.length : Math.max(0, Math.min(at, moved.length)) };
}
