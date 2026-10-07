import type { UserRole } from './roles';

// Email links (sign-up confirmation, password reset) land here. See /auth/confirm.
const CONFIRM_PATH = '/auth/confirm';
const AUTH_PAGES = ['/login', '/signup', '/forgot-password'];

export type ConfirmType = 'email' | 'recovery';

export const MIN_PASSWORD_LENGTH = 6;

// "/login" and "/login/anything", but not "/loginx".
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

// Pages a signed-in user is sent away from.
export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((base) => isUnder(pathname, base));
}

// Pages a signed-out visitor may open.
export function isPublicPath(pathname: string): boolean {
  return pathname === '/' || isAuthPage(pathname) || pathname === CONFIRM_PATH;
}

export function parseConfirmType(value: string | null): ConfirmType | null {
  return value === 'email' || value === 'recovery' ? value : null;
}

export function homeForRole(role: UserRole): string {
  return role === 'platform_admin' ? '/admin' : '/profile';
}

export function destinationAfterConfirm(type: ConfirmType, role: UserRole): string {
  return type === 'recovery' ? '/reset-password' : homeForRole(role);
}

// The type rides in the return address, because Supabase's default email link
// brings back only a code and doesn't say whether it was a sign-up or a reset.
export function confirmRedirectUrl(origin: string, type: ConfirmType): string {
  return `${origin}${CONFIRM_PATH}?type=${type}`;
}

export function newPasswordError(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return "The passwords don't match.";
  }
  return null;
}
