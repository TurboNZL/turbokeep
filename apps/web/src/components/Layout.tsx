import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CheckSquare, FileText, Plus, Search, Settings } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { effectiveUi } from 'turbothemes';
import { cn } from '../lib/cn.ts';
import { useStore } from '../lib/store.ts';

const NAV = [
  { to: '/notes', label: 'Notes', icon: FileText },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Keeps the CSS variables --ind-x/-y/-w/-h at the active link's box, for the `.bt-ind` element that some UI styles slide
 * across (Liquid Glass: the lit pill; Windows 11: the accent bar). The first placement does not animate.
 */
function useIndicator<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const place = () => {
      const a = box.querySelector<HTMLElement>('[aria-current="page"]');
      box.style.setProperty('--ind-o', a ? '1' : '0');
      if (!a) return;
      box.style.setProperty('--ind-x', `${a.offsetLeft}px`); box.style.setProperty('--ind-y', `${a.offsetTop}px`);
      box.style.setProperty('--ind-w', `${a.offsetWidth}px`); box.style.setProperty('--ind-h', `${a.offsetHeight}px`);
    };
    place();
    const raf = requestAnimationFrame(() => box.setAttribute('data-ind-ready', ''));
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [key]);
  return ref;
}

/** The gradients the Marshmallow style strokes its navigation icons with (a glossy candy look). Only drawn for that style. */
const CANDY = ['#ff7aa8', '#ffa24d', '#ffd23f', '#5fd08b', '#4cc9e8', '#6f8cff', '#b67cff'];
const shade = (hex: string, to: number) => { const n = parseInt(hex.slice(1), 16), m = (c: number) => Math.round(c + (to < 0 ? c * to : (255 - c) * to)); return `rgb(${m((n >> 16) & 255)} ${m((n >> 8) & 255)} ${m(n & 255)})`; };
function CandyDefs() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" style={{ position: 'absolute' }}>
      <defs>{CANDY.map((c, i) => (
        <linearGradient key={c} id={`mm-g${i + 1}`} gradientUnits="userSpaceOnUse" x1="0" y1="1" x2="0" y2="23">
          <stop offset="0" stopColor={shade(c, 0.7)} /><stop offset="0.34" stopColor={shade(c, 0.25)} /><stop offset="0.52" stopColor={c} /><stop offset="1" stopColor={shade(c, -0.28)} />
        </linearGradient>))}
      </defs>
    </svg>
  );
}

/** One place to add anything, reachable on every page and on a phone. */
function AddMenu() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);
  const go = (to: string) => { setOpen(false); nav(to); };
  return (
    <div className="relative">
      <button type="button" className="btn btn-accent bt-add" aria-label="Add" title="Add" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Plus size={16} /><span className="hidden sm:inline">Add</span></button>
      {open && <>
        <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
        <div role="menu" className="bt-menu absolute right-0 z-30 mt-2 w-48 origin-top-right overflow-hidden py-1">
          <button role="menuitem" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm" onClick={() => go('/notes?new=1')}><FileText size={16} />New note</button>
          <button role="menuitem" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm" onClick={() => go('/tasks?new=1')}><CheckSquare size={16} />New task</button>
        </div></>}
    </div>
  );
}

export function Layout() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const sideRef = useIndicator<HTMLElement>(pathname);
  const tabRef = useIndicator<HTMLElement>(pathname);
  const [q, setQ] = useState('');
  const ui = useStore((s) => s.settings.ui);
  const layout = useStore((s) => s.settings.layout);
  const topbar = layout === 'topbar', dock = layout === 'dock';
  const noSide = topbar || dock; // these layouts have no side bar at all
  const logo = '/icon.svg';
  const mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [pathname]);

  return (
    <div className="flex h-full flex-col">
      {effectiveUi(ui) === 'lgux' && <CandyDefs />}
      <div className="bt-scrim" aria-hidden />
      <div className="flex min-h-0 flex-1">
        {!noSide && <aside ref={sideRef} className="bt-side bt-shell relative hidden w-56 shrink-0 flex-col gap-1 p-3 md:flex">
          <span className="bt-ind" aria-hidden />
          <div className="bt-brand mb-3 flex items-center gap-2.5 px-3 pt-1 text-lg font-bold tracking-tight"><img src={logo} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0" draggable={false} /><span className="bt-label-text">TurboKeep</span></div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} title={label} className="bt-nav flex items-center gap-3 px-3 py-2 text-sm font-medium">
              <Icon size={18} className="shrink-0" /><span className="bt-label-text">{label}</span>
            </NavLink>
          ))}
        </aside>}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <form className="bt-top bt-shell sticky top-0 z-10 p-3 backdrop-blur" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <div className="bt-topin relative mx-auto flex max-w-3xl items-center gap-3">
              <div className={cn('flex shrink-0 items-center gap-2 font-bold', !noSide && 'md:hidden')}><img src={logo} alt="TurboKeep" width={28} height={28} className="h-7 w-7 shrink-0" draggable={false} />{topbar && <span className="hidden md:inline">TurboKeep</span>}</div>
              {topbar && <nav className="bt-toplinks hidden min-w-0 items-center gap-6 overflow-x-auto md:flex" aria-label="Pages">
                {NAV.map(({ to, label }) => <NavLink key={to} to={to} className="bt-toplink whitespace-nowrap">{label}</NavLink>)}
              </nav>}
              <div className="bt-search relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" />
                <input className="input pl-9" type="search" aria-label="Search notes and tasks" placeholder="Search notes and tasks" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <AddMenu />
            </div>
          </form>
          <div className="bt-content mx-auto max-w-6xl p-4 md:p-6"><div key={pathname.split('/')[1]} className="bt-page"><Outlet /></div></div>
        </main>
      </div>
      <nav ref={tabRef} className={cn('bt-tabbar bt-shell relative flex', !dock && 'md:hidden')}>
        <span className="bt-ind" aria-hidden />
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="bt-tab flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]"><Icon size={20} />{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}

