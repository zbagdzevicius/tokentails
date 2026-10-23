// Street-grid navigation for ground vehicles (pure: node-importable for tests).
// Streets are the lines streetAt(k) = -half + k*block, k = 0..n. A mover drives along one axis in a lane offset
// from the centre line and may turn at intersections. axis 0 = moving along z (x fixed), axis 1 = moving along x.

export interface Grid {
  n: number;
  block: number;
  half: number;
}

export interface Mover {
  x: number;
  z: number;
  axis: 0 | 1;
  dir: 1 | -1;
  lane: number; // lane offset magnitude from the centre line
}

export const streetAt = (g: Grid, k: number) => -g.half + k * g.block;

/** Index of the nearest street line to coordinate v. */
export function nearestStreet(g: Grid, v: number): number {
  return Math.max(0, Math.min(g.n, Math.round((v + g.half) / g.block)));
}

/** Put the mover in its lane on the nearest street of its axis. */
export function snapToLane(g: Grid, m: Mover): void {
  if (m.axis === 0) m.x = streetAt(g, nearestStreet(g, m.x)) + m.dir * m.lane;
  else m.z = streetAt(g, nearestStreet(g, m.z)) + m.dir * m.lane;
}

/**
 * Drive `dist` along the current axis toward (tx, tz) (or away from it when flee). At each crossed intersection the
 * mover picks the axis and direction that best closes (or opens) the gap. Returns true if it turned.
 */
export function drive(g: Grid, m: Mover, dist: number, tx: number, tz: number, flee: boolean): boolean {
  const lim = g.half - 6;
  const a = m.axis === 0 ? m.z : m.x;
  const b = a + dist * m.dir;
  let turned = false;
  let crossed = Number.NaN;
  for (let k = 0; k <= g.n; k++) {
    const s = streetAt(g, k);
    // the cross street's centre line (offset so both lanes turn inside the intersection)
    if ((a - s) * (b - s) <= 0 && a !== s) {
      crossed = s;
      break;
    }
  }
  if (m.axis === 0) m.z = b;
  else m.x = b;
  if (!Number.isNaN(crossed)) {
    const sg = flee ? -1 : 1;
    const dx = (tx - m.x) * sg;
    const dz = (tz - m.z) * sg;
    // along the current axis vs across it
    const along = m.axis === 0 ? dz : dx;
    const across = m.axis === 0 ? dx : dz;
    const wantAxis: 0 | 1 = Math.abs(across) > Math.abs(along) + 8 ? (m.axis === 0 ? 1 : 0) : m.axis;
    if (wantAxis !== m.axis) {
      const fixed = crossed;
      m.axis = wantAxis;
      m.dir = across >= 0 ? 1 : -1;
      // the old moving coordinate becomes fixed, in the new direction's lane of the street we just crossed
      if (m.axis === 0) m.x = fixed + m.dir * m.lane;
      else m.z = fixed + m.dir * m.lane;
      turned = true;
    } else if (Math.abs(along) > 4 && Math.sign(along) !== m.dir) {
      // U-turn at the intersection
      m.dir = m.dir === 1 ? -1 : 1;
      if (m.axis === 0) m.x = streetAt(g, nearestStreet(g, m.x)) + m.dir * m.lane;
      else m.z = streetAt(g, nearestStreet(g, m.z)) + m.dir * m.lane;
      turned = true;
    }
  }
  // turn around at the city edge
  const p = m.axis === 0 ? m.z : m.x;
  if (Math.abs(p) > lim) {
    const c = Math.sign(p) * lim;
    if (m.axis === 0) m.z = c;
    else m.x = c;
    m.dir = p > 0 ? -1 : 1;
    if (m.axis === 0) m.x = streetAt(g, nearestStreet(g, m.x)) + m.dir * m.lane;
    else m.z = streetAt(g, nearestStreet(g, m.z)) + m.dir * m.lane;
    turned = true;
  }
  return turned;
}

/** Yaw (rotation.y) of a mover facing its travel direction (model faces +z). */
export function moverYaw(m: Mover): number {
  return m.axis === 0 ? (m.dir > 0 ? 0 : Math.PI) : m.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}
