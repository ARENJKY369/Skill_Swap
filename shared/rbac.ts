export type Role = 'student' | 'admin';

/** Server- and client-side gate for the admin panel. The server always re-checks. */
export function canAccessAdminPanel(role: Role | null | undefined): boolean {
  return role === 'admin';
}

/** Ownership-or-admin check for user-scoped resources (IDOR prevention). */
export function isOwnerOrAdmin(
  actorId: string | null | undefined,
  ownerId: string,
  role: Role | null | undefined,
): boolean {
  if (!actorId) return false;
  if (role === 'admin') return true;
  return actorId === ownerId;
}

export function canModerate(role: Role | null | undefined): boolean {
  return role === 'admin';
}
