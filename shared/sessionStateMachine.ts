/**
 * Learning-session lifecycle:
 *   Pending → Accepted → Completed
 *   Pending → Declined
 *   Pending → Rescheduled → Accepted / Declined / Rescheduled
 * Terminal states (Completed, Declined) have no outbound transitions.
 */
export type SessionStatus =
  | 'Pending'
  | 'Accepted'
  | 'Declined'
  | 'Rescheduled'
  | 'Completed';

export const SESSION_STATUSES: readonly SessionStatus[] = [
  'Pending',
  'Accepted',
  'Declined',
  'Rescheduled',
  'Completed',
];

const TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  Pending: ['Accepted', 'Declined', 'Rescheduled'],
  Accepted: ['Completed', 'Rescheduled', 'Declined'],
  Rescheduled: ['Accepted', 'Declined', 'Rescheduled'],
  Completed: [],
  Declined: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid session transition: ${from} -> ${to}`);
  }
}

/** Both parties may mark an Accepted session completed once its end time has passed. */
export function canMarkCompleted(
  status: SessionStatus,
  sessionEndIso: string,
  nowIso: string = new Date().toISOString(),
): boolean {
  if (status !== 'Accepted') return false;
  const end = Date.parse(sessionEndIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(end) || Number.isNaN(now)) return false;
  return now >= end;
}

/** Meeting URLs must be https. Anything else is rejected. */
export function isSafeMeetingUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
