import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, House, Plus, Settings, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { effectiveUi } from 'turbothemes';
import { cn } from '../lib/cn.ts';
import { useStore } from '../lib/store.ts';
import { homeLink } from '../lib/views.ts';
import { SearchBox } from './SearchBox.tsx';
import { useWide } from '../lib/useWide.ts';
import type { NavId } from '../lib/settings.ts';
import { requestCompose } from './Composer.tsx';
import { Toasts } from './Toasts.tsx';

interface NavItem { key: NavId; label: string; icon: LucideIcon; to: string; active: boolean }

/** The pages, in the order chosen in Settings: Home (the list, tags and the open item), the Archive, the Bin and Settings. Home's link carries the open note, so no tab hides it. */
function useNavItems(): NavItem[] {
  const { pathname } = useLocation();
  const order = useStore((s) => s.settings.navOrder);
  const all: Record<NavId, NavItem> = {
    home: { key: 'home', label: 'Home', icon: House, to: '/home', active: pathname.startsWith('/home') },
    archive: { key: 'archive', label: 'Archive', icon: Archive, to: '/archive', active: pathname.startsWith('/archive') },
    bin: { key: 'bin', label: 'Bin', icon: Trash2, to: '/bin', active: pathname.startsWith('/bin') },
    settings: { key: 'settings', label: 'Settings', icon: Settings, to: '/settings', active: pathname.startsWith('/settings') },
  };
  return order.map((k) => all[k]);
}
/** going to a page (even the one you are on) closes the item that was open */
const linkProps = (i: NavItem) => ({ 'aria-current': i.active ? ('page' as const) : undefined, onClick: () => useStore.getState().setOpenNote(null) });

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

export function Layout() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const items = useNavItems();
  const [sp] = useSearchParams();
  const activeKey = items.find((i) => i.active)?.key ?? '';
  const sideRef = useIndicator<HTMLElement>(activeKey + items.map((i) => i.key).join());
  const tabRef = useIndicator<HTMLElement>(activeKey + items.map((i) => i.key).join());
  const wide = useWide();
  // a search belongs to the page you are on: Home, the Archive or the Bin (Settings searches Home)
  const searchBase = pathname.startsWith('/archive') ? '/archive' : pathname.startsWith('/bin') ? '/bin' : '/home';
  const query = pathname.startsWith('/settings') ? '' : sp.get('q') ?? '';
  const search = (q: string) => nav(`${searchBase}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const ui = useStore((s) => s.settings.ui);
  const layout = useStore((s) => s.settings.layout);
  const topbar = layout === 'topbar', dock = layout === 'dock';
  const noSide = topbar || dock; // these layouts have no side bar at all
  const logo = '/icon.svg';
  const mainRef = useRef<HTMLElement>(null);
  const section = pathname.split('/')[1] ?? '';
  useLayoutEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [section]);

  // a page slides in from the side it sits on in the navigation (right when it is further along, left when it is before)
  const idx = Math.max(0, items.findIndex((i) => i.active));
  const last = useRef({ idx, dir: '' });
  if (last.current.idx !== idx) last.current = { idx, dir: idx > last.current.idx ? 'tk-page-fwd' : 'tk-page-back' };

  // Settings is its own file: fetch it while Home is idle, so the first visit does not show a "Loading" flash between the pages
  useEffect(() => { const t = window.setTimeout(() => void import('../pages/Settings.tsx'), 300); return () => window.clearTimeout(t); }, []);

  // how tall the bar at the bottom is (0 when there is none): menus, toasts and the tag column stop above it
  useLayoutEffect(() => {
    const el = tabRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--dock-h', getComputedStyle(el).display === 'none' ? '0px' : `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(el); window.addEventListener('resize', set);
    return () => { ro.disconnect(); window.removeEventListener('resize', set); };
  }, [layout, tabRef]);

  const add = () => {
    requestCompose();
    if (!pathname.startsWith('/home')) nav('/home');
    else if (!wide && sp.get('q') !== null) nav('/home');
  };

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
          <form className="bt-top bt-shell sticky top-0 z-10 p-3 backdrop-blur" onSubmit={(e) => e.preventDefault()}>
            <div className="bt-topin relative flex items-center gap-3">
              <div className={cn('flex shrink-0 items-center gap-2 font-bold', !noSide && 'md:hidden')}><img src={logo} alt="TurboKeep" width={28} height={28} className="h-7 w-7 shrink-0" draggable={false} />{topbar && <span className="hidden md:inline">TurboKeep</span>}</div>
              {topbar && <nav className="bt-toplinks hidden min-w-0 items-center gap-6 overflow-x-auto md:flex" aria-label="Pages">
                {items.map((i) => <Link key={i.key} to={i.to} {...linkProps(i)} className="bt-toplink whitespace-nowrap">{i.label}</Link>)}
              </nav>}
              <div className="bt-search relative min-w-0 flex-1">
                <SearchBox query={query} onSearch={search} where={searchBase === '/archive' ? 'the Archive' : searchBase === '/bin' ? 'the Bin' : 'Home'} />
              </div>
              <button type="button" className="btn btn-accent bt-add shrink-0" aria-label="New" title="Add something (focuses the box at the top of Home)" onClick={add}><Plus size={16} /><span className="hidden sm:inline">New</span></button>
            </div>
          </form>
          <div className="bt-content p-4 md:p-6"><div key={section} className={cn('tk-page', last.current.dir)}><Outlet /></div></div>
        </main>
      </div>
      <nav ref={tabRef} className={cn('bt-tabbar bt-shell relative flex', !dock && 'md:hidden')} aria-label="Pages">
        <span className="bt-ind" aria-hidden />
        {items.map((i) => (
          <Link key={i.key} to={i.to} {...linkProps(i)} className="bt-tab flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]"><i.icon size={20} />{i.label}</Link>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
