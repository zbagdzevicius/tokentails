/**
 * L-WORLD: the light show as pure math (no three.js, no DOM), so it is unit-tested.
 * Laser modes from the music, laser aim per beam, spotlight paths, flash rate limiting.
 */
import type { BeatInfo, LaserMode } from '../types';

/** Laser mode the music asks for when nobody overrides it. */
export function autoLaserMode(beat: BeatInfo, reducedMotion = false): LaserMode {
  let mode: LaserMode;
  if (beat.held) mode = 'fan';
  else
    switch (beat.section) {
      case 'intro':
        mode = 'idle';
        break;
      case 'groove':
        mode = 'sweep';
        break;
      case 'build':
        mode = 'fan';
        break;
      case 'drop': {
        // First 2 bars of a drop strobe, then alternate sweep / fan every 4 bars.
        const barInSection = Math.floor(beat.sectionProgress * 16 + 1e-6);
        mode = barInSection < 2 ? 'strobe' : Math.floor(barInSection / 4) % 2 === 0 ? 'sweep' : 'fan';
        break;
      }
      default:
        mode = 'idle';
    }
  if (reducedMotion && mode === 'strobe') mode = 'sweep';
  return mode;
}

/** Deterministic 0..1 hash of an integer (for per-beat random strobe aims). */
export function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Horizon laser rigs (x, y, z), left and right of the moon: each fans its beams from one emitter. */
export const LASER_RIGS = Object.freeze({ left: [-40, 1, -120] as const, right: [40, 1, -120] as const });
/** Half spread of a rig's fan (±25°). */
export const FAN_SPREAD = (25 * Math.PI) / 180;
/** Side beams tilt outwards between 15° and 80° off vertical (never across the centre line). */
export const SIDE_TILT_MIN = (15 * Math.PI) / 180;
export const SIDE_TILT_MAX = (80 * Math.PI) / 180;
/** Side beams lean this much (rad) from the pure sideways plane towards the hero camera (+Z). */
export const SIDE_TOWARD_CAMERA = 0.3;

/**
 * Violet or green for side beam `k` of `n` (rig -1 / +1): one violet beam per rig of 4 (1:3); with
 * 3 per rig the violet beam alternates between the rigs every 4 bars (and both rigs in a drop).
 */
export function beamViolet(side: -1 | 1, k: number, n: number, bar: number, drop: boolean): boolean {
  if (k !== n - 1) return false;
  if (n >= 4) return true;
  return drop || ((side > 0 ? 1 : 0) + Math.floor(bar / 4)) % 2 === 0;
}

export interface LaserAim {
  /** Rotation around +Y; 0 points to +Z (towards the hero camera), positive turns to +X. */
  yaw: number;
  /** Elevation above the horizon, radians. */
  pitch: number;
  /** 0..~1.6, multiplies the beam colour (0 = off). */
  intensity: number;
}

/**
 * Aim of one beam.
 * @param mode   current laser mode
 * @param side   -1 left rig, +1 right rig, 0 centre rig (behind the booth, points up)
 * @param k      beam index inside its rig
 * @param n      beams in the rig
 * @param beat   the beat clock sample
 * @param speed  1 normally, ~0.4 with prefers-reduced-motion
 */
export function laserAim(mode: LaserMode, side: -1 | 0 | 1, k: number, n: number, beat: BeatInfo, speed = 1, out: LaserAim = { yaw: 0, pitch: 0, intensity: 0 }): LaserAim {
  const b = beat.beat * speed;
  const u = n > 1 ? k / (n - 1) - 0.5 : 0; // -0.5..0.5 across the fan
  const pump = 0.75 + 0.5 * beat.kick * Math.max(0.35, beat.energy);

  if (side === 0) {
    // Centre spike: the column of light behind the DJ (reference: green / violet beam straight up).
    const wob = Math.sin(b * 0.25 + k * 2.1) * 0.12;
    out.yaw = b * 0.3 + k * Math.PI;
    out.pitch = Math.PI / 2 - 0.08 - Math.abs(wob) - (mode === 'fan' ? 0.25 * Math.abs(u * 2) + 0.12 : 0);
    // The vertical booth beam belongs to builds (and the drop that follows); off otherwise.
    const lit = beat.held || beat.section === 'build' || beat.section === 'drop';
    out.intensity = !lit ? 0 : mode === 'strobe' ? (strobeOn(beat) ? 1.6 : 0.05) : 1.1 * pump;
    return out;
  }

  // Side rigs: each fans its beams up and OUTWARDS from one bright emitter low on the horizon,
  // left and right of the moon (reference): the tilt off vertical stays inside
  // [SIDE_TILT_MIN, SIDE_TILT_MAX] on the rig's own side, so no beam ever crosses the centre line
  // or the moon disc. The right rig mirrors the left.
  const w = u * 2; // -1..1 across the fan
  let tilt = 0.5; // 0 = straight up, 1 = SIDE_TILT_MAX (lowest)
  switch (mode) {
    case 'idle': {
      tilt = 0.55 + 0.12 * Math.sin(b * 0.125 + side) + w * 0.18;
      out.intensity = 0.45 + 0.15 * beat.kick;
      break;
    }
    case 'sweep': {
      // The whole fan sweeps slowly (period 4 bars), rigs in counter-phase.
      const sw = Math.sin((b / 16) * Math.PI * 2 + (side > 0 ? Math.PI : 0));
      tilt = 0.5 + 0.3 * sw + w * 0.2;
      out.intensity = 1.0 * pump;
      break;
    }
    case 'fan': {
      // Opens to the full spread as a build progresses.
      const open = beat.section === 'build' ? 0.5 + 0.5 * beat.sectionProgress : 1;
      tilt = 0.5 + w * 0.48 * open + Math.sin(b * 0.25) * 0.04;
      // 8th-note chase across the fan.
      const chase = Math.floor(b * 2) % Math.max(1, n);
      out.intensity = (chase === k ? 1.5 : 0.85) * pump;
      break;
    }
    case 'strobe': {
      const bi = Math.floor(b);
      tilt = 0.5 + w * 0.35 + (hash1(bi * 7 + k + (side > 0 ? 50 : 0)) - 0.5) * 0.3;
      out.intensity = strobeOn(beat) ? 1.6 : 0.0;
      break;
    }
  }
  const t = Math.max(0, Math.min(1, tilt));
  const offVertical = SIDE_TILT_MIN + (SIDE_TILT_MAX - SIDE_TILT_MIN) * t;
  out.pitch = Math.PI / 2 - offVertical;
  // Outwards (left rig to -X, right rig to +X), leaning a little towards the camera (+Z).
  out.yaw = side * (Math.PI / 2 - SIDE_TOWARD_CAMERA);
  return out;
}

/** On/off at 8th notes (≈4.5 Hz at 136 BPM), never faster: photosensitivity. */
export function strobeOn(beat: BeatInfo): boolean {
  return ((beat.beat * 2) % 1) < 0.5;
}

/** Unit direction from yaw/pitch (see LaserAim). */
export function aimToDir(yaw: number, pitch: number, out: { x: number; y: number; z: number }) {
  const c = Math.cos(pitch);
  out.x = c * Math.sin(yaw);
  out.y = Math.sin(pitch);
  out.z = c * Math.cos(yaw);
  return out;
}

/** Floor target of show spotlight `i` (of `n`) at this beat: slow lissajous loops over the crowd. */
export function spotPath(i: number, n: number, beat: BeatInfo, crowdRadius: number, speed = 1, out = { x: 0, z: 0 }) {
  const b = beat.beat * speed;
  const ph = (i / Math.max(1, n)) * Math.PI * 2;
  const r = Math.max(3.6, Math.min(crowdRadius, 40)) * (0.55 + 0.35 * Math.sin(b * 0.09 + ph * 1.3));
  const a = b * (beat.section === 'drop' ? 0.18 : 0.07) * (i % 2 ? -1 : 1) + ph;
  out.x = Math.cos(a) * r;
  out.z = Math.sin(a) * r * 0.8 + 1.5;
  return out;
}

/**
 * Flash envelope with a rate limit: at most one new flash every `minGap` seconds (3 per second
 * by default, SPEC "flash never exceeds 3 per second"). Stronger flashes inside the gap only raise
 * the current level, they never start a new peak.
 */
export class FlashEnvelope {
  level = 0;
  r = 0;
  g = 0;
  b = 0;
  private lastStart = -Infinity;
  constructor(
    private readonly minGap = 1 / 3,
    private readonly decay = 5.5,
  ) {}

  trigger(now: number, rgb: readonly [number, number, number], strength: number): boolean {
    const s = Math.max(0, Math.min(1.5, strength));
    if (now - this.lastStart < this.minGap) return false;
    this.lastStart = now;
    this.level = s;
    [this.r, this.g, this.b] = rgb;
    return true;
  }

  step(dt: number) {
    this.level *= Math.exp(-this.decay * dt);
    if (this.level < 0.002) this.level = 0;
    return this.level;
  }
}

/** Linear RGB used by flash(); hot pink, moon green, laser violet, white. */
export const FLASH_RGB: Record<'green' | 'pink' | 'violet' | 'white', readonly [number, number, number]> = {
  green: [0.25, 1.0, 0.35],
  pink: [1.0, 0.25, 0.55],
  violet: [0.6, 0.3, 1.0],
  white: [1, 1, 1],
};

/**
 * How many beams each rig gets for a tier's `lasers` budget: [left, centre, right]. A fan of 3–4
 * fat volumetric beams per horizon emitter (reference), plus one centre beam
 * straight up from the booth that only lights in builds and drops.
 */
export function beamSplit(lasers: number): [number, number, number] {
  const side = Math.max(3, Math.min(4, Math.floor(lasers / 2)));
  return [side, 1, side];
}
