/**
 * LayerStack (ANIM-SPEC §4.4): the authored layers on top of the procedural Animator, in order
 *   base (held pose blend) → gait → override (one clip + one fading) → additive (≤ 2) + reaction slot → root → springs
 *   → squash / blink.
 * The Animator owns base, gait, squash and blink (motion.ts) and calls the stack between them. Each hero has one
 * override slot plus a separate reaction slot, so a hit never cancels a cast's follow-through. Lower-priority clips
 * are refused; equal ones cross-fade. Implements the character-side AnimHandle. No allocation per frame.
 */
import * as THREE from 'three';
import { BONE_INDEX as I, type Rig } from '../chars/skeleton';
import { compileClip, type ClipBin } from './compile';
import { sampleClip, sampleScalar } from './sampler';
import { ClipPlayer, type CueFn, type MarkerFn } from './player';
import { Reactions } from './reactions';
import { RootState } from './root';
import { SpringChain, DEFAULT_SPRINGS, type SpringInput } from './springs';
import { TAIL_INDEX } from './masks';
import type { AnimHandle, ClipDef, CueKind, GaitName, PlayOpts, ReactKind, SpringTuning } from './types';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const add = (q: THREE.Quaternion, x: number, y: number, z: number): void => {
  if (x === 0 && y === 0 && z === 0) return;
  q.multiply(_q.setFromEuler(_e.set(x, y, z, 'XYZ')));
};

/** Spring update rate per quality tier (§10). */
export const SPRING_RATE = Object.freeze({ low: { hz: 60, steps: 1 }, med: { hz: 120, steps: 4 }, high: { hz: 120, steps: 4 } });

const NOOP_MARKER = (): void => {};

export class LayerStack implements AnimHandle {
  readonly over: ClipPlayer[] = [new ClipPlayer(), new ClipPlayer()];
  readonly addv: ClipPlayer[] = [new ClipPlayer(), new ClipPlayer()];
  readonly reactions = new Reactions();
  readonly root = new RootState();
  readonly tail = new SpringChain(6);
  readonly ears = new SpringChain(2);
  /** Entity id this stack animates (marker callbacks carry it). */
  heroId = -1;
  /** Render clock (s) of the last update. */
  now = 0;
  /** Object yaw (rad) for world → object directions. */
  yaw = 0;
  reduced = false;
  tier: 'low' | 'med' | 'high' = 'med';
  /** Springs drive the tail and ears (match heroes); off in the lobby, where the idle sine stays. */
  springsOn = false;
  gait: GaitName = 'run';
  onMarker: (heroId: number, clipId: string, marker: string) => void = NOOP_MARKER;
  onCue: (heroId: number, clipId: string, kind: CueKind, arg: string | number | undefined) => void = NOOP_MARKER;
  /** Local freeze left (render s): the legacy layers hold too. */
  freezeLeft = 0;
  private readonly springIn: SpringInput = { ax: 0, az: 0, yawRate: 0, pitchRate: 0, rollRate: 0 };
  private readonly fireMarker: MarkerFn = (clip, marker) => this.onMarker(this.heroId, clip, marker);
  private readonly fireCue: CueFn = (clip, kind, arg) => {
    if (kind === 'freeze') this.freeze(typeof arg === 'number' ? arg : 60);
    else if (kind === 'earsBack') this.earsBackT = 0.35;
    this.onCue(this.heroId, clip, kind, arg);
  };
  private earsBackT = 0;
  private additiveNext = 0;

  constructor(
    readonly rig: Rig,
    /** Pose a null first key / hidden weapon falls back to. */
    readonly idle: string,
  ) {
    this.tune(DEFAULT_SPRINGS);
  }

  tune(s: SpringTuning): void {
    this.tail.tune(s.tail);
    this.ears.tune(s.ears);
  }

  compile(def: ClipDef): ClipBin {
    return compileClip(def, this.rig, this.idle);
  }

  /** The active (not fading) override player, or null. */
  current(): ClipPlayer | null {
    for (const p of this.over) if (p.active && !p.ending) return p;
    return null;
  }

  /** Is clip `id` playing on the override slot (not fading)? */
  playing(id: string): ClipPlayer | null {
    for (const p of this.over) if (p.active && !p.ending && p.bin?.id === id) return p;
    for (const p of this.addv) if (p.active && !p.ending && p.bin?.id === id) return p;
    return null;
  }

  /** Weight of the playing clips that pin the feet (ClipDef.lockFeet), 0 when none. */
  lockWeight(): number {
    let w = 0;
    for (const p of this.over) if (p.active && p.bin?.def.lockFeet && p.w > w) w = p.w;
    return w;
  }

  /** Total override weight this frame (motion.ts skips the legacy swing / cast layers under a clip). */
  overrideWeight(): number {
    let w = 0;
    for (const p of this.over) if (p.active && p.w > w) w = p.w;
    return w;
  }

  play(clip: ClipDef, o: PlayOpts): boolean {
    const bin = this.compile(clip);
    if (bin.additive) {
      const p = this.addv[this.additiveNext];
      this.additiveNext = (this.additiveNext + 1) % this.addv.length;
      p.start(bin, o.anchors, this.now, o);
      return true;
    }
    const cur = this.current();
    if (cur && cur.bin) {
      // higher interrupts lower, lower is refused; an equal one follows the current clip's cancel rule
      if (cur.bin.prio > bin.prio) return false;
      const cancel = cur.bin.def.cancel ?? 'any';
      if (cur.bin.prio === bin.prio && (cancel === 'none' || (cancel === 'afterContact' && !cur.contacted))) return false;
    }
    // cross-fade: the current clip fades over the new one's blend-in
    let slot = this.over[0];
    if (cur) {
      cur.stop(this.now, Math.max(0.04, bin.blendIn));
      slot = cur === this.over[0] ? this.over[1] : this.over[0];
    } else if (this.over[0].active && !this.over[1].active) slot = this.over[1];
    slot.start(bin, o.anchors, this.now, o);
    return true;
  }

  stop(clipId: string, blendOut?: number): void {
    for (const p of this.over) if (p.active && p.bin?.id === clipId) p.stop(this.now, blendOut);
    for (const p of this.addv) if (p.active && p.bin?.id === clipId) p.stop(this.now, blendOut);
  }

  /** Hard CC / death: cut every override clip with a short blend (the sim cancelled the cast). */
  cut(blendOut = 0.06): void {
    for (const p of this.over) if (p.active) p.stop(this.now, blendOut);
  }

  /** Drop every clip, reaction and freeze at once (a new match, the gallery's next scenario). */
  reset(): void {
    for (const p of this.over) p.kill();
    for (const p of this.addv) p.kill();
    this.reactions.clear();
    this.root.reset();
    this.freezeLeft = 0;
  }

  /** (dirX, dirZ): the push direction in WORLD space (from the attacker toward the victim). */
  react(kind: ReactKind, dirX: number, dirZ: number, ticks?: number): void {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    // world → object: object.rotation.y = yaw
    const lx = dirX * c - dirZ * s;
    const lz = dirX * s + dirZ * c;
    this.reactions.start(kind, lx, lz, ticks);
    if (kind === 'light' || kind === 'heavy') this.root.hitKick(lx, lz, kind === 'heavy' ? 1.2 : 0.8);
  }

  freeze(ms: number): void {
    const s = (this.reduced ? ms * 0.5 : ms) / 1000;
    if (s > this.freezeLeft) this.freezeLeft = s;
    for (const p of this.over) if (p.active) p.warp.freeze(s);
  }

  shake(ms: number, amp: number): void {
    this.reactions.shake(ms, amp);
  }

  setGait(variant: GaitName): void {
    this.gait = variant;
  }

  /** Advance the players to render time `now` (dr render seconds since the last frame). */
  update(now: number, dr: number): void {
    this.now = now;
    this.reactions.reduced = this.reduced;
    if (this.freezeLeft > 0) this.freezeLeft = Math.max(0, this.freezeLeft - dr);
    for (const p of this.over) p.update(now, dr, this.fireMarker, this.fireCue);
    for (const p of this.addv) p.update(now, dr, this.fireMarker, this.fireCue);
  }

  /** Override layer into the base + gait buffers. Returns the override weight. */
  applyOverride(q: THREE.Quaternion[], p: THREE.Vector3[]): number {
    let w = 0;
    // the fading clip first, the new one on top
    for (let pass = 0; pass < 2; pass++)
      for (const pl of this.over) {
        if (!pl.active || pl.w <= 0 || pl.ending !== (pass === 0)) continue;
        const bin = pl.bin as ClipBin;
        sampleClip(bin, pl.t, q, p, bin.mask, pl.w, 0, pl.cur);
        if (pl.w > w) w = pl.w;
      }
    return w;
  }

  /** Additive clips and the reaction slot. */
  applyAdditive(q: THREE.Quaternion[], p: THREE.Vector3[], dt: number): void {
    for (const pl of this.addv) {
      if (!pl.active || pl.w <= 0) continue;
      const bin = pl.bin as ClipBin;
      sampleClip(bin, pl.t, q, p, bin.mask, pl.w, 1, pl.cur);
    }
    this.reactions.apply(q, this.root, this.freezeLeft > 0 ? 0 : dt);
  }

  /** Sum the root channels of every playing clip (+ the reaction slot, which adds in applyAdditive). */
  sumRoot(): void {
    const r = this.root;
    r.reset();
    this.addRoot(this.over);
    this.addRoot(this.addv);
  }

  private addRoot(list: ClipPlayer[]): void {
    const r = this.root;
    for (const pl of list) {
      if (!pl.active || pl.w <= 0) continue;
      const bin = pl.bin as ClipBin;
      const w = pl.w;
      const t = pl.t;
      const m = pl.mirror ? -1 : 1;
      const red = this.reduced;
      for (let c = 0; c < 8; c++) {
        const arr = bin.root[c];
        if (!arr) continue;
        let v = sampleScalar(arr, t);
        // a fading (or fading-in) rotation blends from its nearest whole turn: a held −1 turn (a finished flip) is the
        // rest pose, so it must not unwind back through −0.5 (upside down) as the weight drops
        if (w < 1 && c >= 3 && c <= 5) v -= Math.round(v);
        const k = red ? bin.calm[c] : 1;
        switch (c) {
          case 0:
            r.fwd += v * w * k;
            break;
          case 1:
            r.side += v * w * k * m;
            break;
          case 2:
            r.up += v * w * k;
            break;
          case 3:
            r.yaw += v * w * k * m;
            break;
          case 4:
            r.pitch += v * w * k;
            break;
          case 5:
            r.roll += v * w * k * m;
            break;
          case 6:
            r.sx *= 1 + (v - 1) * w * (red ? Math.min(1, k) : 1);
            break;
          default:
            r.sy *= 1 + (v - 1) * w * (red ? Math.min(1, k) : 1);
        }
      }
      if (pl.dir !== 0) r.dirYaw += pl.dir * w;
    }
  }

  /** Tail and ear springs (§5) on top of the layers; `ax`, `az` object-space acceleration (m/s²). */
  applySprings(q: THREE.Quaternion[], dt: number, ax: number, az: number, yawRate: number): void {
    if (!this.springsOn) return;
    const si = this.springIn;
    // a freeze holds the springs' target too
    const hold = this.freezeLeft > 0;
    si.ax = hold ? 0 : ax;
    si.az = hold ? 0 : az;
    si.yawRate = hold ? 0 : yawRate;
    si.pitchRate = hold ? 0 : this.root.pitchRate;
    si.rollRate = hold ? 0 : this.root.rollRate;
    const rate = SPRING_RATE[this.tier];
    this.tail.step(dt, si, rate.hz, rate.steps);
    if (this.earsBackT > 0) this.earsBackT -= dt;
    this.ears.biasX = this.earsBackT > 0 ? -0.7 : 0;
    this.ears.step(dt, si, rate.hz, rate.steps);
    const th = this.tail.theta;
    for (let i = 0; i < 6; i++) add(q[TAIL_INDEX[i]], th[i * 2], th[i * 2 + 1], 0);
    const eh = this.ears.theta;
    add(q[I.earL], eh[0], 0, -eh[1] * 0.6);
    add(q[I.earR], eh[2], 0, eh[3] * 0.6);
  }
}
