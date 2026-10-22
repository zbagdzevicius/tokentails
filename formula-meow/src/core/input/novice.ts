/**
 * Headless "novice on a phone" probe (iteration 4, F2 acceptance). A scripted thumb follows the road's centre line the
 * way a beginner does: it looks a short way ahead, reacts 0.15 s late, moves the thumb in jerky steps (every 5 ticks)
 * with some jitter, and never brakes, drifts on purpose or uses items. Its thumb offset in pixels goes through the real
 * touch stick curve and the real `InputMux` (one-thumb drift, auto-gas, Smart Steer when on) into the sim, with the
 * `MuxContext` filled the way `core/app/shell.ts` fills it (edge look-ahead included).
 *
 * Test support only (not imported by the game). `smart-steer.test.ts` runs it; `e2e/feel.spec.ts` drives the same
 * novice through real pointer events in the browser.
 */
import { DT, type TrackDef } from '../../types';
import { GO_TICK } from '../sim/world';
import { speedOf } from '../sim/kart';
import { curvatureAhead } from '../sim/autopilot';
import { classTuning } from '../../tuning';
import { buildTrack, type BuiltTrack } from '../track/build';
import { edgeLook, type EdgeLook } from '../app/edge-look';
import { raceConfig, world } from '../../test/fixtures';
import { InputMux, type MuxContext } from './mux';
import { mergeSteer, type InputSource, type RawInput } from './raw';
import { stickSteer } from './smart-steer';

export interface NoviceOpts {
  smartSteer: boolean;
  /** stick dead zone px / curve exponent (SIM_VERSION 10: 6 / 1.4) */
  dead: number;
  curve: number;
  seed?: number;
}

export interface NoviceRun {
  /** sim ticks the player's kart touched a wall (GO to finish) */
  wallTicks: number;
  /** player's race time, s (null: did not finish) */
  time: number | null;
  /** mean finish time of the AI cats, s */
  aiMean: number;
  place: number;
  /** ticks the assist moved the stick */
  assistTicks: number;
}

class Thumb implements InputSource {
  px = 0;
  constructor(private readonly o: NoviceOpts) {}
  poll(out: RawInput): void {
    out.touch = true;
    mergeSteer(out, stickSteer(this.px, this.o.dead, this.o.curve), false, true);
  }
  dispose(): void {}
}

/** The novice's thumb target in px (−70..70) from the kart's state. */
export function noviceThumb(t: BuiltTrack, k: { x: number; z: number; vx: number; vz: number; si: number; branch: number }, jitter: number): number {
  const v = Math.hypot(k.vx, k.vz);
  const look = 5 + v * 0.35;
  let tx: number;
  let tz: number;
  const br = k.branch >= 0 ? t.branches[k.branch] : null;
  if (br) {
    // on an alternative route: follow its centre line (then the main line past the merge)
    let near = 0;
    let best = Infinity;
    for (let j = 0; j < br.m; j++) {
      const d = (br.px[j] - k.x) ** 2 + (br.pz[j] - k.z) ** 2;
      if (d < best) {
        best = d;
        near = j;
      }
    }
    const j = near + Math.round(look / br.step);
    if (j < br.m) {
      tx = br.px[j];
      tz = br.pz[j];
    } else {
      const mi = (br.to + Math.round(((j - br.m + 1) * br.step) / t.step)) % t.n;
      tx = t.px[mi];
      tz = t.pz[mi];
    }
  } else {
    const j = (k.si + Math.round(look / t.step)) % t.n;
    tx = t.px[j];
    tz = t.pz[j];
  }
  const dx = tx - k.x;
  const dz = tz - k.z;
  let err = Math.atan2(dx, dz) - (v > 1 ? Math.atan2(k.vx, k.vz) : Math.atan2(t.tx[k.si], t.tz[k.si]));
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  // err + = the target is to the left; steer + = right. A beginner pushes the thumb well past what the bend needs.
  const want = Math.max(-1, Math.min(1, -err * 3.2));
  return Math.max(-70, Math.min(70, want * 70 + jitter));
}

const tracks = new Map<string, BuiltTrack>();

export function runNovice(def: TrackDef, o: NoviceOpts): NoviceRun {
  const seed = o.seed ?? 1;
  const cfg = raceConfig(def, { seed, cls: 0, humans: [5] });
  let built = tracks.get(def.id);
  if (!built) tracks.set(def.id, (built = buildTrack(def, 0)));
  const w = world(cfg);
  const thumb = new Thumb(o);
  const mux = new InputMux([thumb], { autoGas: false, oneThumb: true, smartSteer: o.smartSteer });
  const mc: Required<MuxContext> = { racing: false, speedFrac: 0, drifting: false, curve: 0, wall: false, edgeL: 99, edgeR: 99, edgeHeading: 0, onRail: false, air: false, driftDir: 0 };
  const edge: EdgeLook = { edgeL: 99, edgeR: 99, edgeHeading: 0 };
  const yaw = { th: 0, rate: 0, has: false };
  const top = classTuning(0).topSpeed;
  const hist: number[] = [];
  let rng = (seed * 2654435761) >>> 0;
  const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  let wallTicks = 0;
  let assistTicks = 0;
  const limit = 60 * 60 * 6;
  while (!w.done && w.st.tick < limit) {
    const me = w.st.karts[5];
    // the shell's MuxContext (core/app/shell.ts frame + fillEdgeLook)
    mc.racing = w.st.tick >= GO_TICK;
    mc.speedFrac = speedOf(me) / top;
    mc.drifting = me.driftDir !== 0;
    mc.curve = curvatureAhead(w.ctx, me.si, 4, 24);
    mc.wall = !!me.wall;
    mc.onRail = me.rail > 0;
    mc.air = !!me.air;
    mc.driftDir = me.driftDir;
    const th = Math.atan2(me.vx, me.vz);
    if (yaw.has && Math.hypot(me.vx, me.vz) > 1) {
      let d = th - yaw.th;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      yaw.rate += (Math.max(-3, Math.min(3, d / DT)) - yaw.rate) * 0.5;
    } else yaw.rate = 0;
    yaw.th = th;
    yaw.has = true;
    if (!mc.racing || mc.onRail || w.track.arena) {
      mc.edgeL = mc.edgeR = 99;
      mc.edgeHeading = 0;
    } else {
      edgeLook(w.track, me, yaw.rate, 0.5, edge);
      mc.edgeL = edge.edgeL;
      mc.edgeR = edge.edgeR;
      mc.edgeHeading = edge.edgeHeading;
    }
    // the novice: sees the kart 9 ticks late, moves the thumb every 5 ticks
    hist.push(noviceThumb(built, me, 0));
    if (hist.length > 9) hist.shift();
    if (w.st.tick % 5 === 0) thumb.px = Math.max(-70, Math.min(70, hist[0] + rand() * 10));
    mux.frame(DT, mc);
    const input = mux.sample(w.st.tick, mc);
    if (mux.assist !== 0) assistTicks++;
    w.step([input]);
    if (process.env.FM_T0 && w.st.tick >= Number(process.env.FM_T0) && w.st.tick <= Number(process.env.FM_T1))
      process.stderr.write(`T t${w.st.tick} si${me.si} d${me.d.toFixed(1)} hw${built.halfW[me.si].toFixed(1)} eL${mc.edgeL.toFixed(1)} eR${mc.edgeR.toFixed(1)} eh${mc.edgeHeading.toFixed(2)} yr${yaw.rate.toFixed(2)} raw${mux.raw.steer.toFixed(2)} as${mux.assist.toFixed(2)} st${input.steer} v${speedOf(me).toFixed(1)} wall${me.wall} air${me.air} dd${me.driftDir} rail${me.rail} rac${mc.racing}\n`);
    if (w.st.tick >= GO_TICK && !w.st.karts[5].finished && w.st.karts[5].wall) {
      wallTicks++;
      if (process.env.FM_TRACE) process.stderr.write(`W t${w.st.tick} si${me.si} d${me.d.toFixed(1)} eL${mc.edgeL.toFixed(1)} eR${mc.edgeR.toFixed(1)} eh${mc.edgeHeading.toFixed(2)} raw${mux.raw.steer.toFixed(2)} as${mux.assist.toFixed(2)} dd${me.driftDir} v${speedOf(me).toFixed(1)} surf${me.surface} br${me.branch}\n`);
    }
  }
  const res = w.result();
  const ai = res.places.filter((p) => p.kart !== 5 && p.time != null).map((p) => p.time as number);
  return { wallTicks, time: res.player.time, aiMean: ai.reduce((a, b) => a + b, 0) / Math.max(1, ai.length), place: res.player.place, assistTicks };
}

