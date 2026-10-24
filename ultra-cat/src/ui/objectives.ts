// Objective text and progress for the intro card, the in-play tracker, the pause menu and the results.
import { money, type EnemyId, type LevelDef, type Objective, type RunResult } from '../core/api';
import { objectiveValue } from '../campaign/stars';

export const ENEMY_NAMES: Record<EnemyId, [string, string]> = {
  heli: ['Spray-bottle heli', 'Helis'],
  cannonTruck: ['Water-cannon truck', 'Fire trucks'],
  cucumberTower: ['Cucumber tower', 'Cucumber towers'],
  cucumberJet: ['Cucumber jet', 'Jets'],
  vacuum: ['Robot vacuum', 'Vacuums'],
  mechaDog: ['Mecha-Dog', 'Mecha-Dog'],
  roombaPrime: ['Roomba Prime', 'Roomba Prime'],
};

/** "Watch out for" line on the intro card. */
export function threatList(level: LevelDef): string[] {
  const out: string[] = [];
  for (const e of level.enemies) {
    const n = ENEMY_NAMES[e.type]?.[1];
    if (n && !out.includes(n)) out.push(n);
  }
  if (level.boss) out.push(`BOSS: ${ENEMY_NAMES[level.boss.type]?.[0] ?? level.boss.type}`);
  return out;
}

/** Round targets read better without decimals: $500M, $1.5B. */
const moneyShort = (m: number): string => (m >= 1000 ? `$${+(m / 1000).toFixed(2)}B` : Number.isInteger(m) ? `$${m}M` : money(m));
const fmt = (o: Objective, v: number, target = false): string =>
  o.kind === 'damage' ? (target ? moneyShort(v) : money(v)) : o.kind === 'destroyedPct' ? `${Math.floor(v)}%` : String(Math.floor(v));

/** Live progress as text, e.g. "$212M / $500M", "1 / 2", "72 ≥ 50". */
export function progressText(o: Objective, r: RunResult, clamp = true): string {
  const raw = objectiveValue(o, r);
  const v = clamp ? Math.min(raw, o.target) : raw;
  if (o.kind === 'boss') return raw >= 1 ? 'DOWN' : 'not yet';
  if (o.kind === 'patience') return `${Math.floor(raw)} / ${o.target}`;
  return `${fmt(o, v)} / ${fmt(o, o.target, true)}`;
}

/** Short tracker label (fits the phone HUD). */
export function shortLabel(o: Objective): string {
  switch (o.kind) {
    case 'damage':
      return 'Damage';
    case 'landmarks':
      return 'Landmarks';
    case 'kills':
      return o.enemy ? ENEMY_NAMES[o.enemy][1] : 'Kills';
    case 'patience':
      return 'Keep patience';
    case 'destroyedPct':
      return 'City wrecked';
    case 'combo':
      return 'Best combo';
    case 'fish':
      return 'Fish trucks';
    case 'buildings':
      return 'Buildings';
    case 'boss':
      return o.enemy ? ENEMY_NAMES[o.enemy][0] : 'Boss';
  }
}

/** 0..1 fill for a progress bar. */
export function progressFrac(o: Objective, r: RunResult): number {
  const v = objectiveValue(o, r);
  return o.target > 0 ? Math.max(0, Math.min(1, v / o.target)) : v > 0 ? 1 : 0;
}

/** Met right now (live): patience counts as "holding", not banked. */
export const liveMet = (o: Objective, r: RunResult) => objectiveValue(o, r) >= o.target;
