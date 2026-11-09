import { describe, expect, it } from 'vitest';
import { canAccessAdminPanel, isOwnerOrAdmin, canModerate } from '@shared/rbac';

describe('rbac', () => {
  it('only admins reach the admin panel', () => {
    expect(canAccessAdminPanel('admin')).toBe(true);
    expect(canAccessAdminPanel('student')).toBe(false);
    expect(canAccessAdminPanel(null)).toBe(false);
    expect(canAccessAdminPanel(undefined)).toBe(false);
  });

  it('owners and admins pass ownership checks, others do not', () => {
    expect(isOwnerOrAdmin('u1', 'u1', 'student')).toBe(true);
    expect(isOwnerOrAdmin('u1', 'u2', 'student')).toBe(false);
    expect(isOwnerOrAdmin('u1', 'u2', 'admin')).toBe(true);
    expect(isOwnerOrAdmin(null, 'u2', 'admin')).toBe(false);
  });

  it('only admins moderate', () => {
    expect(canModerate('admin')).toBe(true);
    expect(canModerate('student')).toBe(false);
  });
});
