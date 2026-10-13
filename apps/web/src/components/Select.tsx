import type { SelectHTMLAttributes } from 'react';

/** A native <select> in the themes' `.input` look (native, so it works with every keyboard and screen reader). */
export function Select({ value, onChange, options, ...rest }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  return <select className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
