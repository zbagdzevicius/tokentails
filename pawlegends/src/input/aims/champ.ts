/**
 * How Champ's abilities are aimed and drawn (sim v29; docs/plans/moba/ROSTER-V29.md §2.4), read by ../abilities.ts
 * heroAims. Haymaker is a cone toward the nearest target; Bob and Weave a dash that smart-aims the nearest enemy hero;
 * KNOCKOUT! targets an enemy hero (he walks in to 2.5 m).
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);
const STEP_TO_RAD = (Math.PI * 2) / 4096;

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'cone', range: n(a.q.range, 3000), arc: n(a.q.arc, 853) * STEP_TO_RAD, smart: 'any' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
    { kind: 'dir', shape: 'dash', range: n(a.e.dash, 3500), width: 1000, smart: 'hero' },
    { kind: 'unit', shape: 'circle', range: n(a.r.reach, 2500), radius: 1200, smart: 'hero' },
  ];
}
