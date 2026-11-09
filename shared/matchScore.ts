/**
 * Matchmaker scoring.
 * score = (my Teach ∩ their Want) + (my Want ∩ their Teach),
 * weighted by teacher skill level, with a bidirectional bonus and an
 * online-availability tie-breaker. Clamped to 0–100.
 */
export type SkillLevel = 'low' | 'med' | 'high';

export const LEVEL_WEIGHT: Record<SkillLevel, number> = {
  low: 0.55,
  med: 0.78,
  high: 1,
};

export const POINTS_PER_SKILL = 16;
export const BIDIRECTIONAL_BONUS = 18;
export const ONLINE_BONUS = 4;

export interface MatchScoreInput {
  myTeaches: string[];
  myWants: string[];
  theirTeaches: string[];
  theirWants: string[];
  myLevels?: Record<string, SkillLevel>;
  theirLevels?: Record<string, SkillLevel>;
  theirOnline?: boolean;
}

export interface MatchScoreResult {
  score: number;
  iCanTeachThem: string[];
  theyCanTeachMe: string[];
  bidirectional: boolean;
  breakdown: {
    teachPoints: number;
    learnPoints: number;
    bidirectionalBonus: number;
    onlineBonus: number;
  };
}

const normalize = (xs: string[]): string[] => [
  ...new Set(xs.map((s) => s.trim()).filter(Boolean)),
];

const levelFactor = (
  levels: Record<string, SkillLevel> | undefined,
  skill: string,
): number => LEVEL_WEIGHT[levels?.[skill] ?? 'med'];

export function scoreMatch(input: MatchScoreInput): MatchScoreResult {
  const myT = normalize(input.myTeaches);
  const myW = normalize(input.myWants);
  const theirT = normalize(input.theirTeaches);
  const theirW = normalize(input.theirWants);

  const iCanTeachThem = myT.filter((s) => theirW.includes(s));
  const theyCanTeachMe = myW.filter((s) => theirT.includes(s));

  const teachPoints = Math.round(
    iCanTeachThem.reduce((acc, s) => acc + POINTS_PER_SKILL * levelFactor(input.myLevels, s), 0),
  );
  const learnPoints = Math.round(
    theyCanTeachMe.reduce((acc, s) => acc + POINTS_PER_SKILL * levelFactor(input.theirLevels, s), 0),
  );

  const bidirectional = iCanTeachThem.length > 0 && theyCanTeachMe.length > 0;
  const bidirectionalBonus = bidirectional ? BIDIRECTIONAL_BONUS : 0;
  const onlineBonus = input.theirOnline ? ONLINE_BONUS : 0;

  const score = Math.max(
    0,
    Math.min(100, Math.round(teachPoints + learnPoints + bidirectionalBonus + onlineBonus)),
  );

  return {
    score,
    iCanTeachThem,
    theyCanTeachMe,
    bidirectional,
    breakdown: { teachPoints, learnPoints, bidirectionalBonus, onlineBonus },
  };
}

export type MatchChip = 'strong' | 'fair' | 'weak';

export function matchChip(score: number): MatchChip {
  if (score >= 80) return 'strong';
  if (score >= 50) return 'fair';
  return 'weak';
}
