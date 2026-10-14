import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckSquare, FileText, MoreHorizontal, Plus, Search, Settings, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { effectiveUi } from 'turbothemes';
import { cn } from '../lib/cn.ts';
import { useStore } from '../lib/store.ts';
import { VIEWS, homeLink, isView, type ViewId } from '../lib/views.ts';
import { useWide } from '../lib/useWide.ts';

interface NavItem { key: string; label: string; icon: LucideIcon; to: string; active: boolean; dock: boolean }

/** The navigation: one button per way of looking at Home (Inbox, Today, Tasks…) and Settings. Home links carry the open note, so no tab hides it. */
function useNavItems(): NavItem[] {
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const openNote = useStore((s) => s.openNote);
  const wide = useWide();
  const onHome = pathname.startsWith('/home');
  const cur: ViewId = isView(sp.get('view')) ? (sp.get('view') as ViewId) : 'inbox';
  return [
    ...VIEWS.map((v) => ({ key: v.id, label: v.label, icon: v.icon, to: homeLink(wide ? openNote : null, { view: v.id }), active: onHome && cur === v.id, dock: v.dock })),
    { key: 'settings', label: 'Settings', icon: Settings, to: '/settings', active: pathname.startsWith('/settings'), dock: true },
  ];
}
const linkProps = (i: NavItem) => ({ 'aria-current': i.active ? ('page' as const) : undefined });

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
          <button role="menuitem" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm" onClick={() => go('/home?new=1')}><FileText size={16} />New note</button>
          <button role="menuitem" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm" onClick={() => go('/home?newtask=1')}><CheckSquare size={16} />New task</button>
        </div></>}
    </div>
  );
}

export function Layout() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const items = useNavItems();
  const [sp] = useSearchParams();
  const activeKey = items.find((i) => i.active)?.key ?? '';
  const sideRef = useIndicator<HTMLElement>(activeKey);
  const tabRef = useIndicator<HTMLElement>(activeKey);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [more, setMore] = useState(false);
  const openNote = useStore((s) => s.openNote);
  const wide = useWide();
  useEffect(() => setQ(pathname.startsWith('/home') ? sp.get('q') ?? '' : ''), [sp, pathname]);
  const ui = useStore((s) => s.settings.ui);
  const layout = useStore((s) => s.settings.layout);
  const topbar = layout === 'topbar', dock = layout === 'dock';
  const noSide = topbar || dock; // these layouts have no side bar at all
  const logo = '/icon.svg';
  const mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [pathname.split('/')[1]]);

  return (
    <div className="flex h-full flex-col">
      {effectiveUi(ui) === 'lgux' && <CandyDefs />}
      <div className="bt-scrim" aria-hidden />
      <div className="flex min-h-0 flex-1">
        {!noSide && <aside ref={sideRef} className="bt-side bt-shell relative hidden w-56 shrink-0 flex-col gap-1 p-3 md:flex">
          <span className="bt-ind" aria-hidden />
          <div className="bt-brand mb-3 flex items-center gap-2.5 px-3 pt-1 text-lg font-bold tracking-tight"><img src={logo} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0" draggable={false} /><span className="bt-label-text">TurboKeep</span></div>
          {items.map((i) => (
            <Link key={i.key} to={i.to} title={i.label} {...linkProps(i)} className="bt-nav flex items-center gap-3 px-3 py-2 text-sm font-medium">
              <i.icon size={18} className="shrink-0" /><span className="bt-label-text">{i.label}</span>
            </Link>
          ))}
        </aside>}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <form className="bt-top bt-shell sticky top-0 z-10 p-3 backdrop-blur" role="search" onSubmit={(e) => { e.preventDefault(); nav(homeLink(wide ? openNote : null, { view: isView(sp.get('view')) ? (sp.get('view') as ViewId) : 'inbox', tag: sp.get('tag') ?? undefined, project: sp.get('project') ?? undefined, q: q.trim() || undefined })); }}>
            <div className="bt-topin relative mx-auto flex max-w-5xl items-center gap-3">
              <div className={cn('flex shrink-0 items-center gap-2 font-bold', !noSide && 'md:hidden')}><img src={logo} alt="TurboKeep" width={28} height={28} className="h-7 w-7 shrink-0" draggable={false} />{topbar && <span className="hidden md:inline">TurboKeep</span>}</div>
              {topbar && <nav className="bt-toplinks hidden min-w-0 items-center gap-6 overflow-x-auto md:flex" aria-label="Pages">
                {items.map((i) => <Link key={i.key} to={i.to} {...linkProps(i)} className="bt-toplink whitespace-nowrap">{i.label}</Link>)}
              </nav>}
              <div className="bt-search relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" />
                <input className="input pl-9" type="search" aria-label="Search notes and tasks" placeholder="Search notes and tasks" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <AddMenu />
            </div>
          </form>
          <div className="bt-content p-4 md:p-6"><div key={pathname.split('/')[1]} className="bt-page"><Outlet /></div></div>
        </main>
      </div>
      <nav ref={tabRef} className={cn('bt-tabbar bt-shell relative flex', !dock && 'md:hidden')}>
        <span className="bt-ind" aria-hidden />
        {items.filter((i) => i.dock).map((i) => (
          <Link key={i.key} to={i.to} {...linkProps(i)} className="bt-tab flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]"><i.icon size={20} />{i.label}</Link>
        ))}
        <div className="relative flex flex-1">
          <button type="button" className="bt-tab flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore(!more)}><MoreHorizontal size={20} />More</button>
          {more && <><div className="fixed inset-0 z-20" onClick={() => setMore(false)} />
            <div role="menu" className="bt-menu absolute bottom-full right-0 z-30 mb-2 w-48 overflow-hidden py-1">
              {items.filter((i) => !i.dock).map((i) => <Link key={i.key} role="menuitem" to={i.to} onClick={() => setMore(false)} {...linkProps(i)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm"><i.icon size={16} />{i.label}</Link>)}
            </div></>}
        </div>
      </nav>
    </div>
  );
}

