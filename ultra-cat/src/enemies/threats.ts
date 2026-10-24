// Where the danger is, for the HUD's off-screen threat arrow (src/ui/threat-arrow.ts). Pure lookups, no allocation.
import type * as THREE from 'three';
import { nearestTruck } from './cannon-truck';
import { dogTarget } from './mecha-dog';
import { roombaTarget } from './roomba-prime';
import { nearestVacuum } from './vacuum';

/** Label of the threat to point at ('' = none); its position goes to `out`. Bosses first, then the nearest truck or vacuum within `range`. */
export function mainThreat(x: number, z: number, range: number, out: THREE.Vector3, tmp: THREE.Vector3): string {
  if (roombaTarget(out)) return 'ROOMBA PRIME';
  if (dogTarget(out)) return 'MECHA-DOG';
  const r2 = range * range;
  const dt = nearestTruck(x, z, out);
  const dv = nearestVacuum(x, z, tmp);
  if (dv >= 0 && dv < r2 && (dt < 0 || dv < dt)) {
    out.copy(tmp);
    return 'VACUUM';
  }
  if (dt >= 0 && dt < r2) return 'FIRE TRUCK';
  return '';
}
