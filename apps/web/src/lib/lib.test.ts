import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';
import { fmtDay, fromLocalInput, isOverdue, toLocalInput } from './dates.ts';

describe('markdown preview (notes are untrusted text)', () => {
  it('escapes HTML and refuses script links', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> [click](javascript:alert(1)) **ok**');
    expect(html).not.toMatch(/<img/);
    expect(html).not.toMatch(/href="javascript/i);
    expect(html).toContain('<strong>ok</strong>');
  });
  it('renders the basics', () => {
    expect(renderMarkdown('# Title\n\n- a\n- b')).toMatch(/<h1[^>]*>Title<\/h1>[\s\S]*<ul>[\s\S]*<li>a<\/li>/);
  });
});

describe('dates', () => {
  const now = new Date(2026, 9, 13, 12, 0);
  it('names near days', () => {
    expect(fmtDay(new Date(2026, 9, 13).toISOString(), now)).toBe('Today');
    expect(fmtDay(new Date(2026, 9, 14).toISOString(), now)).toBe('Tomorrow');
    expect(fmtDay(new Date(2026, 9, 12).toISOString(), now)).toBe('Yesterday');
    expect(fmtDay(null, now)).toBe('');
  });
  it('overdue only while open', () => {
    expect(isOverdue('2000-01-01T00:00:00Z', false)).toBe(true);
    expect(isOverdue('2000-01-01T00:00:00Z', true)).toBe(false);
    expect(isOverdue(null, false)).toBe(false);
  });
  it('round-trips the datetime-local input', () => {
    const iso = new Date(2031, 2, 4, 9, 5).toISOString();
    expect(toLocalInput(iso)).toBe('2031-03-04T09:05');
    expect(fromLocalInput('2031-03-04T09:05')).toBe(iso);
    expect(fromLocalInput('')).toBeNull();
  });
});

import { canReorder, compareManual, filterFromSearch, homeLink, matchesFilter, positionBetween, sortNotes, viewParams } from './views.ts';
import { cleanNavOrder } from './settings.ts';
import { linkedNotes } from './clip.ts';
import { looksOf, stripe } from './tagLook.ts';
import type { Note } from './api.ts';
const note = (title: string, o: Partial<Note> = {}): Note => ({ id: title, title, text: '', noteType: 'plain-text', pinned: false, archived: false, trashed: false, onList: true, dueDate: null, percentDone: 0, position: 0, tags: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', ...o });

describe('the filter, the address and what belongs in a list', () => {
  it('reads the filter from the address and asks the server for excerpts', () => {
    expect(filterFromSearch(new URLSearchParams(''))).toEqual({ scope: 'list', tag: undefined, q: undefined });
    expect(filterFromSearch(new URLSearchParams('scope=all&tag=home&q=x'))).toEqual({ scope: 'all', tag: 'home', q: 'x' });
    expect(filterFromSearch(new URLSearchParams('scope=bogus')).scope).toBe('list');
    expect(viewParams({ scope: 'list' })).toEqual({ excerpt: '1', list: '1' });
    expect(viewParams({ scope: 'untagged' })).toEqual({ excerpt: '1', untagged: '1' });
    expect(viewParams({ scope: 'all' })).toEqual({ excerpt: '1' });
    expect(viewParams({ scope: 'list', tag: 'home' })).toEqual({ excerpt: '1', tag: 'home' }); // a tag shows its notes whether or not they are on the list
    expect(viewParams({ scope: 'list', q: 'milk' })).toEqual({ excerpt: '1', view: 'kept', q: 'milk' }); // a search also looks through the archive
  });
  it('links keep the open note and drop defaults', () => {
    expect(homeLink(null)).toBe('/home');
    expect(homeLink('abc', { scope: 'all' })).toBe('/home/abc?scope=all');
    expect(homeLink(null, { scope: 'untagged', tag: 'work' })).toBe('/home?tag=work');
  });
  it('knows what belongs in each list (so a change shows at once, without asking the server)', () => {
    const task = note('t'), filed = note('f', { onList: false, tags: ['work.reports'] }), done = note('d', { archived: true }), gone = note('g', { trashed: true });
    expect(matchesFilter(task, { scope: 'list' })).toBe(true);
    expect(matchesFilter(filed, { scope: 'list' })).toBe(false);
    expect(matchesFilter(filed, { scope: 'all' })).toBe(true);
    expect(matchesFilter(filed, { scope: 'list', tag: 'work' })).toBe(true); // sub-tags count
    expect(matchesFilter(filed, { scope: 'list', tag: 'wor' })).toBe(false);
    expect(matchesFilter(task, { scope: 'untagged' })).toBe(true);
    expect(matchesFilter(filed, { scope: 'untagged' })).toBe(false);
    expect(matchesFilter(done, { scope: 'all' })).toBe(false); // finished = archived: out of the live lists
    expect(matchesFilter(done, { scope: 'list', q: 'x' })).toBe(true); // but a search keeps what the server found
    expect(matchesFilter(gone, { scope: 'all', q: 'x' })).toBe(false);
  });
});

describe('ordering', () => {
  const list = [note('b', { position: 2, createdAt: '2026-01-02', updatedAt: '2026-03-01', dueDate: '2026-05-01' }), note('a', { position: 1, createdAt: '2026-01-03', updatedAt: '2026-02-01' }), note('c', { position: 3, createdAt: '2026-01-01', updatedAt: '2026-04-01', pinned: true, dueDate: '2026-04-01' })];
  it('my order is the server\'s: pinned first, then position', () => {
    expect(sortNotes(list, 'manual').map((n) => n.title)).toEqual(['c', 'a', 'b']);
    expect([...list].sort(compareManual).map((n) => n.title)).toEqual(['c', 'a', 'b']);
  });
  it('the automatic orders, pinned still on top', () => {
    expect(sortNotes(list, 'newest').map((n) => n.title)).toEqual(['c', 'a', 'b']);
    expect(sortNotes(list, 'oldest').map((n) => n.title)).toEqual(['c', 'b', 'a']);
    expect(sortNotes(list, 'edited').map((n) => n.title)).toEqual(['c', 'b', 'a']);
    expect(sortNotes(list, 'title').map((n) => n.title)).toEqual(['c', 'a', 'b']);
    expect(sortNotes(list, 'due').map((n) => n.title)).toEqual(['c', 'b', 'a']); // no date goes last
  });
  it('only your own order can be dragged, and not inside search results', () => {
    expect(canReorder('manual', { scope: 'list' })).toBe(true);
    expect(canReorder('newest', { scope: 'list' })).toBe(false);
    expect(canReorder('manual', { scope: 'list', q: 'x' })).toBe(false);
  });
  it('a dropped item gets the middle of its neighbours (the server does the same sum)', () => {
    expect(positionBetween(1, 3)).toBe(2);
    expect(positionBetween(undefined, 5)).toBe(4);
    expect(positionBetween(5, undefined)).toBe(6);
    expect(positionBetween(1, 1 + 1e-9)).toBeNull(); // too close: the server renumbers
  });
});

describe('settings, links and colours', () => {
  it('a saved page order is repaired when pages were added or removed', () => {
    expect(cleanNavOrder(['settings', 'home'])).toEqual(['settings', 'home', 'archive', 'bin']);
    expect(cleanNavOrder(['home', 'home', 'nope', 'bin'])).toEqual(['home', 'bin', 'archive', 'settings']);
    expect(cleanNavOrder(undefined)).toEqual(['home', 'archive', 'bin', 'settings']);
  });
  it('finds the notes a text links to, once each', () => {
    const a = '5b3f2c1e-9a4d-4d0e-8f6b-2a1c3d4e5f60', b = '6b3f2c1e-9a4d-4d0e-8f6b-2a1c3d4e5f61';
    expect(linkedNotes(`see http://nas:47901/home/${a} and https://keep.example.com/home/${b}, again /home/${a.toUpperCase()}`)).toEqual([a, b]);
    expect(linkedNotes('no links /home/not-an-id')).toEqual([]);
  });
  it('colours: up to four, in tag order, stacked into one stripe', () => {
    const tags = [{ title: 'a', emoji: '🏠', color: 'ff0000', count: 1 }, { title: 'b', emoji: '', color: '00ff00', count: 1 }, { title: 'c', emoji: '', color: 'ff0000', count: 1 }];
    expect(looksOf(tags, ['a', 'b', 'c', 'zzz'])).toEqual({ colors: ['ff0000', '00ff00'], emojis: ['🏠'] });
    expect(stripe([])).toBeUndefined();
    expect(stripe(['ff0000'])).toEqual({ background: '#ff0000' });
    expect(String(stripe(['ff0000', '00ff00'])?.background)).toBe('linear-gradient(to bottom, #ff0000 0% 50%, #00ff00 50% 100%)');
  });
});
