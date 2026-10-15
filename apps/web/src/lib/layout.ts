/**
 * Layouts decide where the app's pages are listed, independent of the colour theme and the UI style: any layout works with any look.
 * The layout is applied as <html data-layout> by lib/appearance.ts; the CSS is src/layouts.css and components/Layout.tsx reads it. Layouts belong to the app, not to turbothemes.
 */
export type LayoutId = 'side' | 'rail' | 'topbar' | 'dock';

export const LAYOUTS: { id: LayoutId; label: string; description: string }[] = [
  { id: 'side', label: 'Side bar', description: 'Home, Archive, Bin and Settings in a side bar, the search and New in the bar above the page.' },
  { id: 'rail', label: 'Icon rail', description: 'A narrow side bar of icons only (names show on hover) that leaves the page more width.' },
  { id: 'topbar', label: 'Top tabs', description: 'No side bar: every page is a tab along the top, next to the search. The page gets the full width.' },
  { id: 'dock', label: 'Bottom dock', description: 'No side bar: the pages sit in a dock at the bottom of the window, like on a phone.' },
];

export const isLayout = (id: unknown): id is LayoutId => LAYOUTS.some((l) => l.id === id);
