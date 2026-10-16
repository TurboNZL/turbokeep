import type { ReactNode } from 'react';
import { Emoji } from '../lib/emoji.tsx';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { colorOf } from '../lib/tagLook.ts';

/** The look a tag has been given (emoji, colour), found by name; plain when it has none. */
export function useTagLook(title: string) {
  const t = useStore((s) => s.tags.find((x) => x.title === title));
  const color = useStore((s) => colorOf(s.tags, title));
  return { emoji: t?.emoji ?? '', color };
}

/** A tag as a small pill: its emoji, and its colour as the tint and the border. `children` goes after the name (a remove button, a count). */
export function TagChip({ title, className, children, short }: { title: string; className?: string; children?: ReactNode; short?: boolean }) {
  const { emoji, color } = useTagLook(title);
  return (
    <span className={cn('chip inline-flex items-center gap-1', className)} style={color ? { backgroundColor: `#${color}26`, borderColor: `#${color}99` } : undefined}>
      {emoji && <Emoji value={emoji} />}{short ? title.split('.').pop() : title}{children}
    </span>
  );
}
