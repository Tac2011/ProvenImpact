import { describe, expect, it } from 'vitest';
import {
  activeHref,
  formatStat,
  headerDisplayName,
  homeHrefFor,
  navItemsFor,
  showNavItems,
} from './navigation';

const hrefs = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((i) => i.href);

describe('navItemsFor', () => {
  it('gives a platform admin the four admin items in order', () => {
    expect(hrefs('platform_admin')).toEqual([
      '/admin',
      '/admin/athletes',
      '/admin/reports',
      '/admin/manage',
    ]);
  });

  it('gives a student athlete the athlete items', () => {
    expect(hrefs('student_athlete')).toEqual(['/profile', '/assessment']);
  });

  it('gives corporate and university roles the athlete items for now', () => {
    expect(hrefs('corporate_admin')).toEqual(['/profile', '/assessment']);
    expect(hrefs('university_user')).toEqual(['/profile', '/assessment']);
  });

  it('gives a signed-out visitor no items', () => {
    expect(navItemsFor(null)).toEqual([]);
  });
});

describe('homeHrefFor', () => {
  it('sends admins to the dashboard', () => {
    expect(homeHrefFor('platform_admin')).toBe('/admin');
  });

  it('sends athletes to their profile', () => {
    expect(homeHrefFor('student_athlete')).toBe('/profile');
  });

  it('sends signed-out visitors to the landing page', () => {
    expect(homeHrefFor(null)).toBe('/');
  });
});

describe('activeHref', () => {
  const admin = navItemsFor('platform_admin');

  it('underlines only Dashboard on /admin', () => {
    expect(activeHref('/admin', admin)).toBe('/admin');
  });

  it('underlines Admin, not Dashboard, on /admin/manage', () => {
    expect(activeHref('/admin/manage', admin)).toBe('/admin/manage');
  });

  it('underlines Athletes on a deeper athletes page', () => {
    expect(activeHref('/admin/athletes/123', admin)).toBe('/admin/athletes');
  });

  it('does not treat /admin-other as part of /admin', () => {
    expect(activeHref('/admin-other', admin)).toBeNull();
  });

  it('underlines My Profile on /profile', () => {
    expect(activeHref('/profile', navItemsFor('student_athlete'))).toBe('/profile');
  });

  it('underlines nothing on an unknown page', () => {
    expect(activeHref('/signup', admin)).toBeNull();
  });
});

describe('showNavItems', () => {
  it('hides menu items on the locked page', () => {
    expect(showNavItems('/account-locked')).toBe(false);
  });

  it('shows menu items everywhere else', () => {
    expect(showNavItems('/profile')).toBe(true);
  });
});

describe('headerDisplayName', () => {
  const base = { adminName: null, firstName: null, lastName: null, email: 'j@x.com' };

  it('prefers the admin name', () => {
    expect(
      headerDisplayName({ ...base, adminName: 'Todd Campbell', firstName: 'T', lastName: 'C' })
    ).toBe('Todd Campbell');
  });

  it('uses the athlete first and last name next', () => {
    expect(headerDisplayName({ ...base, firstName: 'Jordan', lastName: 'Smith' })).toBe(
      'Jordan Smith'
    );
  });

  it('falls back to email when names are blank', () => {
    expect(headerDisplayName({ ...base, adminName: '  ', firstName: ' ', lastName: '' })).toBe(
      'j@x.com'
    );
  });
});

describe('formatStat', () => {
  it('shows a number', () => {
    expect(formatStat(248)).toBe('248');
  });

  it('shows zero as 0, not a dash', () => {
    expect(formatStat(0)).toBe('0');
  });

  it('shows a dash when the value is missing', () => {
    expect(formatStat(null)).toBe('-');
    expect(formatStat(undefined)).toBe('-');
  });
});
