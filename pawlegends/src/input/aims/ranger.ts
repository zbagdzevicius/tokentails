/**
 * How Ranger's abilities are aimed and drawn (sim v31; docs/plans/moba/ROSTER-V31.md §2.4), read by ../abilities.ts
 * heroAims. Tracer Ball is a long line; Warning Bark a short cone; Bush Dive an escape dash along the heading; LONG
 * SHOT targets an enemy hero from up to 13 m.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);
const STEP_TO_RAD = (Math.PI * 2) / 4096;

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'line', range: n(a.q.range, 10000), width: n(a.q.width, 800), smart: 'hero' },
    { kind: 'dir', shape: 'cone', range: n(a.w.range, 3000), arc: n(a.w.arc, 1024) * STEP_TO_RAD, smart: 'hero' },
    { kind: 'dir', shape: 'dash', range: n(a.e.dash, 3500), width: 900, smart: 'none', heading: true },
    { kind: 'unit', shape: 'circle', range: n(a.r.reach, 13000), radius: 1000, smart: 'hero' },
  ];
}
