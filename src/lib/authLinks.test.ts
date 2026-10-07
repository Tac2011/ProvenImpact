import { describe, expect, it } from 'vitest';
import {
  confirmRedirectUrl,
  destinationAfterConfirm,
  homeForRole,
  isAuthPage,
  isPublicPath,
  newPasswordError,
  parseConfirmType,
} from './authLinks';

describe('isPublicPath', () => {
  it('allows the pages a signed-out visitor needs', () => {
    for (const path of ['/', '/login', '/signup', '/forgot-password', '/auth/confirm']) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it('keeps everything else private', () => {
    for (const path of ['/reset-password', '/profile', '/admin', '/experiences', '/auth']) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it("doesn't open paths that only start with a public name", () => {
    for (const path of ['/loginx', '/signup-promo', '/forgot-passwords', '/auth/confirmed']) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});

describe('isAuthPage', () => {
  it('is true for the log in, sign up, and forgot password pages', () => {
    for (const path of ['/login', '/signup', '/forgot-password']) {
      expect(isAuthPage(path), path).toBe(true);
    }
  });

  it('is false for the link route, the reset page, and home', () => {
    for (const path of ['/auth/confirm', '/reset-password', '/']) {
      expect(isAuthPage(path), path).toBe(false);
    }
  });
});

describe('parseConfirmType', () => {
  it('accepts email and recovery', () => {
    expect(parseConfirmType('email')).toBe('email');
    expect(parseConfirmType('recovery')).toBe('recovery');
  });

  it('rejects everything else', () => {
    for (const value of ['signup', 'magiclink', 'invite', '', null]) {
      expect(parseConfirmType(value), String(value)).toBeNull();
    }
  });
});

describe('homeForRole', () => {
  it('sends Platform Admins to the Dashboard and everyone else to their profile', () => {
    expect(homeForRole('platform_admin')).toBe('/admin');
    expect(homeForRole('student_athlete')).toBe('/profile');
    expect(homeForRole('university_admin')).toBe('/profile');
  });
});

describe('destinationAfterConfirm', () => {
  it('sends a password reset to Set a new password, whatever the role', () => {
    expect(destinationAfterConfirm('recovery', 'platform_admin')).toBe('/reset-password');
    expect(destinationAfterConfirm('recovery', 'student_athlete')).toBe('/reset-password');
  });

  it('sends a confirmed sign-up home by role', () => {
    expect(destinationAfterConfirm('email', 'platform_admin')).toBe('/admin');
    expect(destinationAfterConfirm('email', 'student_athlete')).toBe('/profile');
  });
});

describe('confirmRedirectUrl', () => {
  it('points back at the site the request came from, carrying the link type', () => {
    expect(confirmRedirectUrl('http://localhost:3000', 'email')).toBe(
      'http://localhost:3000/auth/confirm?type=email'
    );
    expect(confirmRedirectUrl('https://proven-impact.vercel.app', 'recovery')).toBe(
      'https://proven-impact.vercel.app/auth/confirm?type=recovery'
    );
  });
});

describe('newPasswordError', () => {
  it('rejects a password shorter than 6 characters', () => {
    expect(newPasswordError('12345', '12345')).toBe('Use at least 6 characters.');
  });

  it('rejects passwords that do not match', () => {
    expect(newPasswordError('123456', '123457')).toBe("The passwords don't match.");
  });

  it('accepts exactly 6 matching characters', () => {
    expect(newPasswordError('123456', '123456')).toBeNull();
  });
});
