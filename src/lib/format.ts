/** Shared formatting helpers. All tabular numbers render in JetBrains Mono via .num */

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const AVATAR_HUES = [174, 190, 205, 160, 220, 145, 32, 262];

export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function relativeTime(iso: string): string {
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60_000);
  const suffix = diff >= 0 ? 'ago' : 'from now';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ${suffix}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ${suffix}`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatSessionDateTime(iso: string): { day: string; month: string; weekday: string; time: string; full: string } {
  const d = new Date(iso);
  return {
    day: String(d.getDate()),
    month: d.toLocaleString(undefined, { month: 'short' }),
    weekday: d.toLocaleString(undefined, { weekday: 'short' }),
    time: d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
    full: d.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

export function sessionEndIso(startIso: string, durationMin: number): string {
  return new Date(Date.parse(startIso) + durationMin * 60_000).toISOString();
}

export function isHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 10 characters', test: (p: string) => p.length >= 10 },
  { id: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One digit', test: (p: string) => /[0-9]/.test(p) },
] as const;

export function passwordStrength(p: string): 0 | 1 | 2 | 3 | 4 {
  const passing = PASSWORD_RULES.filter((r) => r.test(p)).length;
  const bonus = /[^A-Za-z0-9]/.test(p) && p.length >= 12 ? 1 : 0;
  return Math.min(4, Math.max(p.length ? 1 : 0, passing - 1 + bonus)) as 0 | 1 | 2 | 3 | 4;
}
