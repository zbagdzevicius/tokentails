/**
 * How Howler's abilities are aimed and drawn (sim v14; docs/plans/moba/DOGS-V13.md §1.5 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm, 1/4096 turn); this file only adds the aiming shape.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);
const STEP_TO_RAD = (Math.PI * 2) / 4096;

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'cone', range: n(a.q.range, 4000), arc: n(a.q.arc, 853) * STEP_TO_RAD, smart: 'any' },
    { kind: 'dir', shape: 'dash', range: n(a.w.dash, 4500), width: n(a.w.width, 1100), smart: 'none' },
    { kind: 'self', shape: 'none', range: 0, smart: 'none' },
    { kind: 'dir', shape: 'cone', range: n(a.r.range, 6000), arc: n(a.r.arc, 853) * STEP_TO_RAD, smart: 'hero' },
  ];
}
