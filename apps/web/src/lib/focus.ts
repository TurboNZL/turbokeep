/** "Open this item and put the cursor at the end of its title" (the Keep views open an item as soon as its first letter is typed): the editor asks once it is on screen. */
let want: string | null = null;
export const wantEditorFocus = (id: string) => { want = id; };
export const takeEditorFocus = (id: string) => { const yes = want === id; if (yes) want = null; return yes; };

/**
 * Letters typed into the add box in the moment between the first letter making the item and its editor taking the cursor: they are kept here and the editor adds them to the
 * end of the title (the box itself must not turn them into a second item).
 */
let ahead: { id: string; s: string } | null = null;
export const typeAhead = (id: string, s: string) => { ahead = { id, s: ahead?.id === id ? ahead.s + s : s }; window.dispatchEvent(new Event('tk:typeahead')); };
export const takeTypeAhead = (id: string) => { if (ahead?.id !== id) return ''; const s = ahead.s; ahead = null; return s; };
export const peekTypeAhead = (id: string) => (ahead?.id === id ? ahead.s : '');
