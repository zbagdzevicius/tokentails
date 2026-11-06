/**
 * Intent look-ahead for the match camera (audit CF-05, render only): on top of the fixed lane lead toward the enemy
 * base, the focus drifts a few metres toward where the player is going: the aimed skill point while a skill is aimed,
 * else the hero's walking direction. It eases in slowly (no swing on every stick wobble) and back to 0 when the hero
 * stands. The down-screen part (+Z) is scaled up because the ground below the hero is the short side of the frame
 * (the ability bar or the touch cluster covers it), so walking south still shows what is ahead.
 */
export const LOOK_AHEAD = Object.freeze({
  /** Metres toward the walking direction at full speed (at the default zoom; it scales with the zoom). */
  move: 2.6,
  /** Metres toward an aimed skill point. */
  aim: 3.4,
  /** Below this ground speed (m/s) the hero counts as standing. */
  minSpeed: 1.2,
  /** Ease rate (1/s) toward the target lead; and the slower rate back to 0 when the hero stops. */
  ease: 2.6,
  easeBack: 1.4,
  /** The down-screen (+Z) part is multiplied by this (the shorter side of the frame). */
  downMul: 1.35,
  /** The whole look-ahead never exceeds this many metres (at the default zoom). */
  max: 3.6,
});

export interface LookAheadIn {
  /** Hero ground velocity (m/s, three.js X / Z). */
  vx: number;
  vz: number;
  /** Aimed point relative to the hero (m), or null when nothing is aimed. */
  aimDx: number | null;
  aimDz: number | null;
  /** gr.zoom / ZOOM_DEFAULT: the lead grows with the view. */
  scale: number;
}

/** The target look-ahead (m) for one frame → `out`. Pure. */
export function lookAheadTarget(i: LookAheadIn, out: { x: number; z: number }): { x: number; z: number } {
  out.x = 0;
  out.z = 0;
  const s = Number.isFinite(i.scale) && i.scale > 0 ? i.scale : 1;
  if (i.aimDx !== null && i.aimDz !== null) {
    const l = Math.hypot(i.aimDx, i.aimDz);
    if (l > 0.5) {
      out.x = (i.aimDx / l) * LOOK_AHEAD.aim;
      out.z = (i.aimDz / l) * LOOK_AHEAD.aim;
    }
  } else {
    const v = Math.hypot(i.vx, i.vz);
    if (v >= LOOK_AHEAD.minSpeed) {
      out.x = (i.vx / v) * LOOK_AHEAD.move;
      out.z = (i.vz / v) * LOOK_AHEAD.move;
    }
  }
  if (out.z > 0) out.z *= LOOK_AHEAD.downMul;
  const l = Math.hypot(out.x, out.z);
  if (l > LOOK_AHEAD.max) {
    out.x *= LOOK_AHEAD.max / l;
    out.z *= LOOK_AHEAD.max / l;
  }
  out.x *= s;
  out.z *= s;
  return out;
}

/** Ease `cur` toward `target` over `dt` s (faster in, slower back to rest). Pure, in place on `cur`. */
export function easeLookAhead(cur: { x: number; z: number }, target: { x: number; z: number }, dt: number): { x: number; z: number } {
  const resting = target.x === 0 && target.z === 0;
  const k = Math.min(1, Math.max(0, dt) * (resting ? LOOK_AHEAD.easeBack : LOOK_AHEAD.ease));
  cur.x += (target.x - cur.x) * k;
  cur.z += (target.z - cur.z) * k;
  return cur;
}
