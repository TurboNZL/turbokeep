import { describe, expect, it, vi } from 'vitest';
import { firstLine, renderMarkdown } from './markdown.ts';
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
    expect(fmtDay(new Date(2026, 9, 14, 12, 0).toISOString(), now)).toBe('Tomorrow'); // a date picked without a time is stored at noon
    expect(fmtDay(new Date(2026, 9, 14, 15, 30).toISOString(), now)).toMatch(/^Tomorrow \d/);
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

import { canReorder, compareManual, dueSoon, filterFromSearch, homeLink, matchesFilter, positionBetween, sortKey, sortNotes, viewParams } from './views.ts';
import { cleanNavOrder, DEFAULT_SETTINGS, loadSettings } from './settings.ts';
import { linkedNotes } from './clip.ts';
import { buildQuery, parseQuery, typedFilter } from './searchQuery.ts';
import { tasksInTags } from './views.ts';
import { isCustomEmoji } from './emoji.tsx';
import { railTags } from './tagTree.ts';
import { TITLE_MAX, titleOverflow } from './title.ts';
import { barColorOf, colorOf, looksOf, stripe } from './tagLook.ts';
import type { Note } from './api.ts';
const note = (title: string, o: Partial<Note> = {}): Note => ({ id: title, title, text: '', noteType: 'plain-text', pinned: false, archived: false, trashed: false, onList: true, dueDate: null, percentDone: 0, position: 0, tags: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', autoTitle: false, ...o });

describe('the filter, the address and what belongs in a list', () => {
  it('reads the filter from the address and asks the server for excerpts', () => {
    expect(filterFromSearch(new URLSearchParams(''))).toEqual({ scope: 'list', tag: undefined, q: undefined });
    expect(filterFromSearch(new URLSearchParams('scope=all&tag=home&q=x'))).toEqual({ scope: 'all', tag: 'home', q: 'x' });
    expect(filterFromSearch(new URLSearchParams('scope=bogus')).scope).toBe('list');
    expect(viewParams({ scope: 'list' })).toEqual({ excerpt: '1', list: '1' });
    expect(viewParams({ scope: 'due' })).toEqual({ excerpt: '1', due: 'any' });
    expect(viewParams({ scope: 'list' }, true)).toEqual({ excerpt: '1', view: 'archived', list: '1' });
    expect(viewParams({ scope: 'all' })).toEqual({ excerpt: '1' });
    expect(viewParams({ scope: 'list', tag: 'home' })).toEqual({ excerpt: '1', tag: 'home', list: '0' }); // a tag shows what was sent to tags, not the tasks that carry it
    expect(viewParams({ scope: 'all', tag: 'home' }, true)).toEqual({ excerpt: '1', view: 'archived', tag: 'home', list: '0' });
    expect(viewParams({ scope: 'list', q: 'milk' })).toEqual({ excerpt: '1', q: 'milk' }); // a search looks through the page you are on
    expect(viewParams({ scope: 'list', q: 'milk' }, true)).toEqual({ excerpt: '1', view: 'archived', q: 'milk' });
  });
  it('links keep the open note and drop defaults', () => {
    expect(homeLink(null)).toBe('/home');
    expect(homeLink('abc', { scope: 'all' })).toBe('/home/abc?scope=all');
    expect(homeLink(null, { scope: 'due', tag: 'work' })).toBe('/home?tag=work');
    expect(homeLink('abc', { scope: 'due' }, '/archive')).toBe('/archive/abc?scope=due');
    expect(filterFromSearch(new URLSearchParams('scope=untagged')).scope).toBe('list'); // an old address still opens something
  });
  it('knows what belongs in each list (so a change shows at once, without asking the server)', () => {
    const task = note('t'), filed = note('f', { onList: false, tags: ['work.reports'] }), done = note('d', { archived: true }), gone = note('g', { trashed: true });
    expect(matchesFilter(task, { scope: 'list' })).toBe(true);
    expect(matchesFilter(filed, { scope: 'list' })).toBe(false);
    expect(matchesFilter(filed, { scope: 'all' })).toBe(true);
    expect(matchesFilter(filed, { scope: 'list', tag: 'work' })).toBe(true); // sub-tags count
    expect(matchesFilter(filed, { scope: 'list', tag: 'wor' })).toBe(false);
    const tagged = note('x', { tags: ['work'] }); // a task with a tag: still a task, not under the tag until it is sent there
    expect(matchesFilter(tagged, { scope: 'list' })).toBe(true);
    expect(matchesFilter(tagged, { scope: 'list', tag: 'work' })).toBe(false);
    expect(matchesFilter(note('due', { dueDate: '2026-02-01T12:00:00Z' }), { scope: 'due' })).toBe(true);
    expect(matchesFilter(task, { scope: 'due' })).toBe(false);
    expect(matchesFilter(done, { scope: 'all' }, true)).toBe(true); // the archive shows the archived ones, and only those
    expect(matchesFilter(task, { scope: 'all' }, true)).toBe(false);
    expect(matchesFilter(done, { scope: 'all' })).toBe(false); // finished = archived: out of the live lists
    expect(matchesFilter(done, { scope: 'list', q: 'x' })).toBe(false);
    expect(matchesFilter(done, { scope: 'list', q: 'x' }, true)).toBe(true); // a search keeps what the server found on that page
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

describe('due soon', () => {
  const now = new Date(2026, 9, 16, 9, 0); // Fri 16 Oct 2026, 9:00
  const due = (name: string, days: number, o: Partial<Note> = {}) => note(name, { dueDate: new Date(2026, 9, 16 + days, 12, 0).toISOString(), ...o });
  const names = (l: Note[]) => l.map((n) => n.title);
  it('five things, and more when the fifth falls inside a time frame: the rest of that frame comes with it', () => {
    const l = [due('a', 0), due('b', 1), due('c', 2), due('d', 3), due('e', 4), due('f', 5), due('g', 7), due('h', 8)];
    expect(names(dueSoon(l, now))).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']); // the fifth is in 4 days: the frame is a week, so everything up to 7 days
    expect(names(dueSoon([due('a', 0), due('b', 0), due('c', 1), due('d', 1), due('e', 1), due('f', 2)], now))).toEqual(['a', 'b', 'c', 'd', 'e']); // the fifth is tomorrow: 1 day frame ends there
  });
  it('the next frames are a month and three months', () => {
    expect(names(dueSoon([...'abcde'].map((x, i) => due(x, 10 + i)), now)).length).toBe(5);
    expect(names(dueSoon([...[...'abcde'].map((x, i) => due(x, 10 + i)), due('f', 31), due('g', 32)], now))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']); // 16 Oct + 1 month = 16 Nov = day 31: the 5th (day 14) is in that month, so everything up to 16 Nov
    expect(names(dueSoon([...[...'abcde'].map((x, i) => due(x, 40 + i)), due('f', 80), due('g', 100)], now))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']); // inside 3 months: up to 16 Jan
    expect(names(dueSoon([...[...'abcde'].map((x, i) => due(x, 200 + i)), due('h', 300)], now))).toEqual(['a', 'b', 'c', 'd', 'e']); // beyond 3 months: just the five
    expect(dueSoon([...'abcdef'].map((x) => due(x, 200)), now).length).toBe(6); // ...and whatever else falls on the fifth's own day
  });
  it('overdue ones come first and do not use up the five; fewer than five show all; no date, no entry', () => {
    const l = [due('late', -3), due('later', -1), due('a', 0), due('b', 3), note('none'), due('c', 200)];
    expect(names(dueSoon(l, now))).toEqual(['late', 'later', 'a', 'b', 'c']);
    expect(names(dueSoon([], now))).toEqual([]);
  });
});

describe('sort per page', () => {
  it('each page and tab has its own key', () => {
    expect(sortKey({ scope: 'list' }, false)).toBe('list');
    expect(sortKey({ scope: 'all', tag: 'work.reports' }, false)).toBe('tag:work.reports');
    expect(sortKey({ scope: 'all' }, true)).toBe('archive:all');
    expect(sortKey({ scope: 'all', q: 'x' }, false)).toBe('search');
  });
  it('a saved choice is read back repaired (a stranger in storage or a missing width never breaks the page)', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ sorts: { list: 'title', all: 'bogus' }, railWidth: 99, listWidth: 'x' }), setItem: () => {} });
    const s = loadSettings();
    expect(s.sorts).toEqual({ list: 'title' });
    expect(s.railWidth).toBe(22); expect(s.listWidth).toBe(DEFAULT_SETTINGS.listWidth);
    vi.unstubAllGlobals();
  });
});

describe('the one-line preview', () => {
  it('shows the first line of a description, without Markdown marks when the note is Markdown', () => {
    expect(firstLine('\n\nfirst\nsecond', false)).toBe('first');
    expect(firstLine('## **Plan** the [trip](http://x.y)\n- a', true)).toBe('Plan the trip');
    expect(firstLine('- [ ] buy `milk`', true)).toBe('buy milk');
    expect(firstLine('# not markdown', false)).toBe('# not markdown');
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
    expect(looksOf(tags, ['a', 'b', 'c', 'zzz'])).toEqual({ colors: ['ff0000', '00ff00'], bars: ['ff0000', '00ff00'], emojis: ['🏠'] });
    expect(stripe([])).toBeUndefined();
    expect(stripe(['ff0000'])).toEqual({ background: '#ff0000' });
    expect(String(stripe(['ff0000', '00ff00'])?.background)).toBe('linear-gradient(to bottom, #ff0000 0% 50%, #00ff00 50% 100%)');
  });
});

describe('the search language in the address', () => {
  it('turns the text into chips and back', () => {
    const { chips, text } = parseQuery('milk tag:work -tag:"old stuff" before:2024-06 is:task');
    expect(text).toBe('milk');
    expect(chips).toEqual([{ key: 'tag', neg: false, value: 'work' }, { key: 'tag', neg: true, value: 'old stuff' }, { key: 'before', neg: false, value: '2024-06' }, { key: 'is', neg: false, value: 'task' }]);
    expect(buildQuery(chips, text)).toBe('tag:work -tag:"old stuff" before:2024-06 is:task milk');
    expect(parseQuery('tag:').chips).toEqual([]); // nothing after the colon: not a chip yet
  });
  it('knows which filter is being typed', () => {
    expect(typedFilter('tag:wo')).toEqual({ key: 'tag', neg: false, rest: 'wo' });
    expect(typedFilter('-tag:')).toEqual({ key: 'tag', neg: true, rest: '' });
    expect(typedFilter('tagged')).toBeNull();
    expect(typedFilter('milk')).toBeNull();
  });
});

describe('the tags column', () => {
  const tag = (title: string, count: number) => ({ title, emoji: '', color: '', count });
  it('shows a parent even when no note is directly under it, children after it, and leaves out what is empty', () => {
    const rail = railTags([tag('work.reports', 2), tag('home', 0), tag('work.old.2020', 1), tag('alpha', 3)]);
    expect(rail.map((t) => `${t.title}:${t.total}${t.implied ? '*' : ''}`)).toEqual(['alpha:3', 'work:3*', 'work.old:1*', 'work.old.2020:1', 'work.reports:2']);
  });
});

describe('a title too long to be a title', () => {
  it('moves into the description, the note gets the date as its title, and typing goes on after the moved text', () => {
    expect(titleOverflow('x'.repeat(TITLE_MAX), '')).toBeNull();
    const o = titleOverflow('y'.repeat(TITLE_MAX + 1), 'old text', null, new Date(2026, 9, 16, 9, 5))!;
    expect(o.title).toBe('Friday, 16 Oct 2026 at 09:05');
    expect(o.text).toBe(`${'y'.repeat(TITLE_MAX + 1)}\n\nold text`);
    expect(o.caret).toBe(TITLE_MAX + 1);
    expect(titleOverflow(`${'w'.repeat(TITLE_MAX)} `, '')!.text).toBe(`${'w'.repeat(TITLE_MAX)} `); // a space at the end is kept, or the next word would stick to this one
    expect(titleOverflow('z'.repeat(200), '')!.text).toBe('z'.repeat(200));
    expect(titleOverflow('z'.repeat(200), '', 7)!.caret).toBe(7); // the cursor stays where it was in the title
  });
});

describe('tasks in tags, search words, imported emoji', () => {
  it('a setting says where tasks that carry a tag also count', () => {
    expect([false, true].map((a) => tasksInTags('never', a))).toEqual([false, false]);
    expect([false, true].map((a) => tasksInTags('home', a))).toEqual([true, false]);
    expect([false, true].map((a) => tasksInTags('archive', a))).toEqual([false, true]);
    expect([false, true].map((a) => tasksInTags('both', a))).toEqual([true, true]);
    expect(viewParams({ scope: 'list', tag: 'work' }, false, true)).toEqual({ excerpt: '1', tag: 'work' });
    const tagged = note('x', { tags: ['work'] });
    expect(matchesFilter(tagged, { scope: 'list', tag: 'work' }, false, true)).toBe(true);
    expect(matchesFilter(tagged, { scope: 'list', tag: 'work' }, false, false)).toBe(false);
  });
  it('excludes: and includes: are the same as -tag: and tag:', () => {
    expect(parseQuery('excludes:old includes:work not:x').chips).toEqual([{ key: 'tag', neg: true, value: 'old' }, { key: 'tag', neg: false, value: 'work' }, { key: 'tag', neg: true, value: 'x' }]);
    expect(typedFilter('excludes:wo')).toEqual({ key: 'tag', neg: true, rest: 'wo' });
    expect(buildQuery(parseQuery('excludes:old').chips, '')).toBe('-tag:old');
  });
  it('an imported emoji is told from a character', () => {
    expect(isCustomEmoji(':0123456789ab:')).toBe(true);
    expect(isCustomEmoji('😀')).toBe(false);
    expect(isCustomEmoji(':short:')).toBe(false);
  });
});

describe('tag colours are inherited', () => {
  const t = (title: string, color = '') => ({ title, emoji: '', color, count: 1 });
  it('a tag without a colour takes its parent\'s; one with its own keeps it, and the bar is the parent\'s when they differ', () => {
    const all = [t('work', '0000ff'), t('work.plain'), t('work.own', 'ff6600'), t('work.same', '0000ff'), t('home')];
    expect(colorOf(all, 'work.plain')).toBe('0000ff');
    expect(colorOf(all, 'work.own')).toBe('ff6600');
    expect(barColorOf(all, 'work.own')).toBe('0000ff'); // the bar says "work", the glow and chip say "own"
    expect(barColorOf(all, 'work.same')).toBe('0000ff');
    expect(barColorOf(all, 'work.plain')).toBe('0000ff');
    expect(colorOf(all, 'home')).toBe('');
  });
  it('a parent with a look but no notes of its own in this pile still shows it (the archive column)', () => {
    const rail = railTags([{ title: 'work.old', emoji: '', color: '', count: 2 }], [{ title: 'work', emoji: '💼', color: '0000ff', count: 0 }]);
    expect(rail.map((r) => [r.title, r.color, r.emoji])).toEqual([['work', '0000ff', '💼'], ['work.old', '', '']]);
  });
});
