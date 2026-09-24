import { describe, expect, it } from 'vitest';
import {
  canRequestDeletion,
  displayName,
  isLockedOut,
  pendingCountLabel,
} from './deletionRequests';

describe('canRequestDeletion', () => {
  it('lets a student athlete request deletion', () => {
    expect(canRequestDeletion('student_athlete')).toBe(true);
  });

  it('does not let a platform admin request deletion', () => {
    expect(canRequestDeletion('platform_admin')).toBe(false);
  });
});

describe('isLockedOut', () => {
  it('locks out a pending request', () => {
    expect(isLockedOut('pending')).toBe(true);
  });

  it('locks out an approved request', () => {
    expect(isLockedOut('approved')).toBe(true);
  });

  it('does not lock out a restored request', () => {
    expect(isLockedOut('restored')).toBe(false);
  });

  it('does not lock out when there is no request', () => {
    expect(isLockedOut(null)).toBe(false);
  });
});

describe('pendingCountLabel', () => {
  it('returns null when nothing is pending', () => {
    expect(pendingCountLabel(0)).toBeNull();
  });

  it('uses the singular for one request', () => {
    expect(pendingCountLabel(1)).toBe('1 pending deletion request');
  });

  it('uses the plural for more than one', () => {
    expect(pendingCountLabel(99)).toBe('99 pending deletion requests');
  });
});

describe('displayName', () => {
  it('uses first and last name when a profile exists', () => {
    expect(displayName({ first_name: 'Jordan', last_name: 'Smith' }, 'j@x.com')).toBe(
      'Jordan Smith'
    );
  });

  it('falls back to email when there is no profile', () => {
    expect(displayName(null, 'j@x.com')).toBe('j@x.com');
  });

  it('falls back to email when the name is blank', () => {
    expect(displayName({ first_name: ' ', last_name: '' }, 'j@x.com')).toBe('j@x.com');
  });
});
