'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_MANAGE_HREF, activeHref, showNavItems, type NavItem } from '@/lib/navigation';
import { LogoutButton } from './LogoutButton';

export function HeaderNav({
  homeHref,
  items,
  displayName,
  pendingCount,
}: {
  homeHref: string;
  items: NavItem[];
  displayName: string | null;
  pendingCount: number;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const visibleItems = showNavItems(pathname) ? items : [];
  const current = activeHref(pathname, visibleItems);

  function navLink(item: NavItem, mobile: boolean) {
    const active = item.href === current;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMenuOpen(false)}
        className={
          mobile
            ? `block px-4 py-3 text-sm font-semibold tracking-wide uppercase ${
                active ? 'bg-white/10 text-white' : 'text-slate-300'
              }`
            : `border-b-[3px] pb-1 text-sm font-semibold tracking-wide uppercase ${
                active
                  ? 'border-brand-red text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`
        }
      >
        {item.label}
        {item.href === ADMIN_MANAGE_HREF && pendingCount > 0 && (
          <span className="ml-1.5 rounded-full bg-brand-red px-1.5 py-0.5 text-[10px] text-white">
            {pendingCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <header className="relative bg-brand-slate text-white">
      <div className="flex items-center gap-8 px-4 py-3 md:px-6">
        <Link href={homeHref} className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-white p-1">
            <Image src="/proven-mark.png" alt="" width={26} height={28} priority />
          </span>
          <span className="text-sm leading-tight font-extrabold tracking-[0.2em]">
            PROVEN
            <span className="block text-[#ff5a6e]">IMPACT</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {visibleItems.map((item) => navLink(item, false))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {visibleItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-sm font-semibold tracking-wide text-slate-300 uppercase md:hidden"
            >
              Menu
            </button>
          )}

          {displayName ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen(!userOpen)}
                className="max-w-[10rem] truncate text-sm text-slate-300 hover:text-white md:max-w-[16rem]"
              >
                {displayName} &#9662;
              </button>
              {userOpen && (
                <div className="absolute right-0 z-20 mt-2 w-36 rounded border bg-white py-1 text-gray-800 shadow">
                  <LogoutButton className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100" />
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm font-semibold tracking-wide text-slate-300 uppercase hover:text-white"
            >
              Log in
            </Link>
          )}
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-white/10 md:hidden">
          {visibleItems.map((item) => navLink(item, true))}
        </nav>
      )}
    </header>
  );
}
