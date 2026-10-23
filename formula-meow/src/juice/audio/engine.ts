/**
 * Engine purr (GDD 10): the player's kart is a purring cat with a motor. A purr (noise through a low-pass,
 * amplitude-modulated at 22–28 Hz rising with rpm) is layered with two detuned saws whose pitch maps rpm to
 * 70–240 Hz, through a low-pass that follows speed (600–3,200 Hz). Drift adds a tyre squeal and a whine that steps
 * up per tier; speed adds wind. The 3 nearest rivals get a cheap saw each, panned left/right with a doppler bend.
 * Persistent nodes only (no per-frame allocation); `engineParams` is the pure mapping (unit-tested).
 */
import { Surface, type KartState } from '../../types';

export interface EngineParams {
  /** saw pitch (Hz) */
  hz: number;
  /** saw low-pass (Hz) */
  cutoff: number;
  /** purr amplitude-modulation rate (Hz) */
  purrHz: number;
  gain: number;
  squeal: number;
  /** whine pitch (Hz), 0 = silent */
  whine: number;
  wind: number;
  /** iteration 3: the wall-lane tyre hum (0 = silent) */
  hum: number;
}

const WHINE = [520, 660, 880, 1320];

/** Pure: kart state → engine voice parameters. `frac` = speed / class top speed. */
export function engineParams(
  frac: number,
  k: Pick<KartState, 'driftDir' | 'driftTier' | 'boostTicks' | 'air' | 'spinTicks'> & Partial<Pick<KartState, 'surface' | 'rail'>>,
  running: boolean,
): EngineParams {
  const f = Math.max(0, Math.min(1.4, frac));
  const f1 = Math.min(1, f);
  // iteration 3 (set pieces): on a wall lane the tyres hum instead of squealing (the squeal is muted, a low hum takes
  // its slot); on a loop's rail the motor revs up a little and the wind rushes (the "g-force" sound)
  const wall = k.surface === Surface.WallRide && !k.air;
  const railed = (k.rail ?? 0) > 0;
  const drifting = k.driftDir !== 0 && !k.air && !wall && !railed;
  // rpm: idle 70 Hz → 240 Hz at top speed; boost revs past the top; air lets the engine scream (no load)
  const hz = 70 + 170 * f1 + (f > 1 ? 30 * (f - 1) : 0) + (drifting ? 14 : 0) + (k.air ? 25 : 0) + (railed ? 20 : 0);
  return {
    hz,
    cutoff: 600 + 2600 * f1 + (k.boostTicks > 0 ? 1400 : 0),
    purrHz: 22 + 6 * f1,
    gain: running ? 0.06 + 0.08 * f1 : 0,
    squeal: running && drifting ? 0.05 + 0.05 * f1 : 0,
    whine: running && drifting ? WHINE[Math.min(3, k.driftTier)] : 0,
    wind: running ? Math.max(0, f - 0.45) * 0.16 + (k.boostTicks > 0 || railed ? 0.05 : 0) : 0,
    hum: running && wall ? 0.05 + 0.04 * f1 : 0,
  };
}

interface Rival {
  osc: OscillatorNode;
  lp: BiquadFilterNode;
  g: GainNode;
  pan: StereoPannerNode | null;
  kart: number;
}

export class EngineVoice {
  private readonly a: OscillatorNode;
  private readonly b: OscillatorNode;
  private readonly lp: BiquadFilterNode;
  private readonly lfo: OscillatorNode;
  private readonly g: GainNode;
  private readonly squealG: GainNode;
  private readonly squealF: BiquadFilterNode;
  private readonly whine: OscillatorNode;
  private readonly whineG: GainNode;
  private readonly windG: GainNode;
  private readonly rivals: Rival[] = [];
  private readonly nodes: AudioScheduledSourceNode[] = [];

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    noiseBuf: AudioBuffer,
  ) {
    const loopNoise = () => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      this.nodes.push(s);
      return s;
    };
    // motor: two detuned saws → low-pass → purr AM → gain
    this.a = ctx.createOscillator();
    this.b = ctx.createOscillator();
    this.a.type = this.b.type = 'sawtooth';
    this.b.detune.value = 14;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 2;
    const am = ctx.createGain();
    am.gain.value = 0.6;
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 24;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    this.lfo.connect(depth).connect(am.gain);
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    this.a.connect(this.lp);
    this.b.connect(this.lp);
    // the purr itself: low noise rumble through the same AM
    const purrSrc = loopNoise();
    const purrLp = ctx.createBiquadFilter();
    purrLp.type = 'lowpass';
    purrLp.frequency.value = 260;
    const purrG = ctx.createGain();
    purrG.gain.value = 1.4;
    purrSrc.connect(purrLp).connect(purrG).connect(am);
    this.lp.connect(am).connect(this.g).connect(out);

    // drift: tyre squeal (narrow band noise) + tier whine
    const sq = loopNoise();
    this.squealF = ctx.createBiquadFilter();
    this.squealF.type = 'bandpass';
    this.squealF.frequency.value = 2300;
    this.squealF.Q.value = 7;
    this.squealG = ctx.createGain();
    this.squealG.gain.value = 0;
    sq.connect(this.squealF).connect(this.squealG).connect(out);
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whine.frequency.value = 520;
    this.whineG = ctx.createGain();
    this.whineG.gain.value = 0;
    this.whine.connect(this.whineG).connect(out);

    // wind
    const wind = loopNoise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    wind.connect(hp).connect(this.windG).connect(out);

    // rivals: 3 nearest
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      osc.connect(lp).connect(g);
      if (pan) g.connect(pan).connect(out);
      else g.connect(out);
      this.rivals.push({ osc, lp, g, pan, kart: -1 });
      this.nodes.push(osc);
    }
    this.nodes.push(this.a, this.b, this.lfo, this.whine);
    for (const n of this.nodes) n.start();
  }

  update(karts: readonly KartState[], me: number, top: number, running: boolean): void {
    const t = this.ctx.currentTime;
    const k = karts[me];
    const v = Math.hypot(k.vx, k.vz);
    const p = engineParams(v / top, k, running);
    this.a.frequency.setTargetAtTime(p.hz, t, 0.05);
    this.b.frequency.setTargetAtTime(p.hz * 1.005, t, 0.05);
    this.lp.frequency.setTargetAtTime(p.cutoff, t, 0.05);
    this.lfo.frequency.setTargetAtTime(p.purrHz, t, 0.1);
    this.g.gain.setTargetAtTime(p.gain, t, 0.08);
    // the squeal's noise band doubles as the wall lane's tyre hum (pulled down to a low, wide rumble): no extra nodes
    const hum = p.hum > 0;
    this.squealG.gain.setTargetAtTime(hum ? p.hum : p.squeal, t, 0.04);
    this.squealF.frequency.setTargetAtTime(hum ? 150 + 110 * Math.min(1, v / top) : 2100 + 500 * Math.min(1, v / top), t, hum ? 0.06 : 0.1);
    this.squealF.Q.setTargetAtTime(hum ? 1.2 : 7, t, 0.06);
    if (p.whine > 0) this.whine.frequency.setTargetAtTime(p.whine, t, 0.03);
    this.whineG.gain.setTargetAtTime(p.whine > 0 ? 0.025 : 0, t, 0.05);
    this.windG.gain.setTargetAtTime(p.wind, t, 0.15);

    // 3 nearest rivals within 45 m
    const near: Array<{ i: number; d: number }> = [];
    for (let i = 0; i < karts.length; i++) {
      if (i === me) continue;
      const o = karts[i];
      const d = Math.hypot(o.x - k.x, o.z - k.z);
      if (d < 45 && o.respawnTicks === 0) near.push({ i, d });
    }
    near.sort((x, y) => x.d - y.d);
    // listener right vector for a kart facing (sin h, cos h): (-cos h, sin h)
    const rx = -Math.cos(k.heading);
    const rz = Math.sin(k.heading);
    for (let s = 0; s < this.rivals.length; s++) {
      const r = this.rivals[s];
      const n = near[s];
      if (!n || !running) {
        r.g.gain.setTargetAtTime(0, t, 0.1);
        r.kart = -1;
        continue;
      }
      const o = karts[n.i];
      const dx = o.x - k.x;
      const dz = o.z - k.z;
      const d = Math.max(1, n.d);
      // doppler: closing speed along the line of sight
      const closing = -((o.vx - k.vx) * dx + (o.vz - k.vz) * dz) / d;
      const dop = Math.max(0.85, Math.min(1.18, 1 + closing / 90));
      const ov = Math.hypot(o.vx, o.vz) / top;
      const hz = (75 + 150 * Math.min(1, ov)) * dop * (0.94 + (n.i % 4) * 0.04);
      if (r.kart !== n.i) {
        r.osc.frequency.setValueAtTime(hz, t);
        r.kart = n.i;
      } else r.osc.frequency.setTargetAtTime(hz, t, 0.06);
      r.lp.frequency.setTargetAtTime(500 + 1500 * Math.min(1, ov), t, 0.1);
      r.g.gain.setTargetAtTime(0.045 * Math.max(0, 1 - d / 45) ** 1.5, t, 0.08);
      if (r.pan) r.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, (dx * rx + dz * rz) / d)), t, 0.05);
    }
  }

  silence(): void {
    const t = this.ctx.currentTime;
    for (const g of [this.g, this.squealG, this.whineG, this.windG, ...this.rivals.map((r) => r.g)]) g.gain.setTargetAtTime(0, t, 0.05);
  }

  dispose(): void {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}
