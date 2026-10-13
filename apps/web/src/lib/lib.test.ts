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
