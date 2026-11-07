/**
 * How Frankie's abilities are aimed and drawn (sim v15; docs/plans/moba/DOGS-V15.md §1.2 "Sim kit" aim), read by
 * ../abilities.ts heroAims. Numbers come from the hero data (mm); this file only adds the aiming shape.
 *
 * Zero friction on touch (founder rule): one tap does the whole thing. Weenie Roll, Dig and FOOTLONG! smart-aim the
 * nearest enemy hero in reach (else full range ahead); Bun Hop is an escape dash that goes the full distance where he
 * is heading (heading.ts). Dig is one tap: no recast, no hold.
 */
import type { HeroData } from '../../data/heroes/types';
import type { AimSpec } from '../abilities';

const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

export function aims(a: HeroData['abilities']): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  return [
    { kind: 'dir', shape: 'dash', range: n(a.q.dash, 4500), width: n(a.q.width, 1000), smart: 'hero' },
    { kind: 'point', shape: 'circle', range: n(a.w.range, 6500), radius: n(a.w.radius, 1800), smart: 'hero' },
    { kind: 'dir', shape: 'dash', range: n(a.e.dash, 3500), width: 900, smart: 'none', heading: true },
    { kind: 'dir', shape: 'line', range: n(a.r.range, 9000), width: n(a.r.width, 1200), smart: 'hero' },
  ];
}
