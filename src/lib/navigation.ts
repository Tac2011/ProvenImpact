import type { UserRole } from './roles';

export interface NavItem {
  label: string;
  href: string;
}

export const ADMIN_MANAGE_HREF = '/admin/manage';

const ADMIN_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Athletes', href: '/admin/athletes' },
  { label: 'Reports', href: '/admin/reports' },
  { label: 'Admin', href: ADMIN_MANAGE_HREF },
];

// Corporate and University roles have no screens yet, so they share the athlete menu.
const ATHLETE_ITEMS: NavItem[] = [
  { label: 'My Profile', href: '/profile' },
  { label: 'Self-Assessment', href: '/assessment' },
];

export function navItemsFor(role: UserRole | null): NavItem[] {
  if (role === null) {
    return [];
  }
  return role === 'platform_admin' ? ADMIN_ITEMS : ATHLETE_ITEMS;
}

export function homeHrefFor(role: UserRole | null): string {
  if (role === null) {
    return '/';
  }
  return role === 'platform_admin' ? '/admin' : '/profile';
}

// The item whose address matches exactly, or the longest address the path sits under,
// so /admin/manage underlines Admin rather than Dashboard.
export function activeHref(pathname: string, items: NavItem[]): string | null {
  const matches = items.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).href;
}

// On the locked page every menu link would bounce back, so hide them.
export function showNavItems(pathname: string): boolean {
  return !pathname.startsWith('/account-locked');
}

export function headerDisplayName(input: {
  adminName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const adminName = input.adminName?.trim();
  if (adminName) {
    return adminName;
  }
  const fullName = `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim();
  return fullName || input.email;
}

export function formatStat(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : String(value);
}
