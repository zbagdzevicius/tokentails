// Authoring helpers for stage scripts and the endless generator. SETPIECES lane. Pure (node-importable).
// Path-laying helpers (gapJump, vaultGap, cloudRide, wallRun, riverRun) lay track with the builder AND place the
// matching set pieces, so a script reads like the GDD beat sheet.
import type { PathBuilder } from '../core/path';
import type { PieceSpec, RunOpts } from '../core/types';
import { CLOUD_H, VAULT, vaultArc } from '../setpieces/layout';

const CP_LEAD = 12; // core puts a checkpoint 12 u before every checkpoint piece

export class Script {
  readonly pieces: PieceSpec[] = [];
  constructor(readonly b: PathBuilder) {}
  /** current end of the path */
  get s(): number {
    return this.b.s;
  }
  add(type: string, s: number, o: Omit<PieceSpec, 'type' | 's'> = {}): this {
    this.pieces.push({ type, s, ...o });
    return this;
  }
  /** a lay-and-return wrapper: run(len, opts) and get s0 back */
  run(len: number, o: RunOpts = {}): number {
    return this.b.run(len, o).s0;
  }

  // ---- pickups
  fish(s: number, x = 0, n = 5, gap = 3, shape: 'line' | 'arc' | 'wave' | 'curve' = 'line', o: { y?: number; h?: number; amp?: number } = {}): this {
    const params: Record<string, number | string> = { n, gap, shape };
    if (o.h !== undefined) params.h = o.h;
    if (o.amp !== undefined) params.amp = o.amp;
    return this.add('fish', s, { x, y: o.y, len: n * gap, params });
  }
  bell(index: number, s: number, x = 0, y = 1): this {
    return this.add('bell', s, { x, y, params: { index } });
  }
  yarn(s: number, x = 0, y?: number): this {
    return this.add('yarn', s, { x, y });
  }
  treat(s: number, x = 0, y?: number): this {
    return this.add('treat', s, { x, y });
  }
  /** a big heart cookie: one heart back if Mochi lost any */
  heartTreat(s: number, x = 0): this {
    return this.add('treat', s, { x, params: { heart: 1 } });
  }
  ring(s: number, x = 0, y = CLOUD_H + 1.2): this {
    return this.add('ring', s, { x, y });
  }

  // ---- hazards
  log(s: number, x = 0, w?: number): this {
    return this.add('log', s, { x, params: w ? { w } : undefined });
  }
  rock(s: number, x = 0, r = 0.8): this {
    return this.add('rock', s, { x, params: { r } });
  }
  branch(s: number): this {
    return this.add('branch', s);
  }
  puddle(s: number, x = 0, r = 1.4): this {
    return this.add('puddle', s, { x, len: r * 2, params: { r } });
  }
  bamboo(s: number, x: number, n = 3, spread = 1.2): this {
    return this.add('bamboo', s, { x, params: { n, spread } });
  }
  driftlog(s: number, x = 0, w = 4): this {
    return this.add('driftlog', s, { x, params: { w } });
  }
  riverrock(s: number, x = 0, r = 1): this {
    return this.add('riverrock', s, { x, params: { r } });
  }
  rapid(s: number): this {
    return this.add('rapid', s, { len: 3 });
  }

  // ---- furniture
  hint(s: number, action: 'jump' | 'slide' | 'ability', text: string, len = 16): this {
    return this.add('hint', s, { len, params: { action, text } });
  }
  sign(s: number, icon: string, side = 1): this {
    return this.add('sign', s, { params: { icon, side } });
  }
  flag(s: number, side = -1): this {
    return this.add('cpflag', s, { params: { side } });
  }
  finish(s: number, text = 'FINISH!'): this {
    return this.add('finish', s, { params: { text } });
  }

  // ---- path + set piece in one
  /** lead of ground, a jumpable chasm, ground after. Returns the gap's s0. */
  gapJump(lead: number, len: number, after: number, o: { hint?: string; turn?: number } = {}): number {
    this.run(lead, { turn: o.turn });
    const g = this.b.gap(len).s0;
    this.run(after);
    this.add('edge', g - 0.5);
    this.sign(g - 26, 'warn', g % 2 ? 1 : -1);
    if (o.hint !== '') this.hint(g - 24, 'jump', o.hint ?? 'JUMP!', 20);
    return g;
  }
  /** lead (>= 36) of ground, a chasm vaulted with the tail, ground after. Returns the gap's s0. */
  vaultGap(lead: number, len: number, after: number, o: { turn?: number } = {}): number {
    this.run(lead, { turn: o.turn });
    const g = this.b.gap(len).s0;
    this.run(after);
    const s = g - VAULT.window;
    this.add('vault', s, { len: vaultArc(g, len).land - s, params: { gap: VAULT.window, len } });
    this.flag(s - CP_LEAD);
    this.sign(s - 6, 'vault', 1);
    return g;
  }
  /** lead of ground, a canyon crossed on the puff cloud, ground after. Returns the canyon's s0. */
  cloudRide(lead: number, len: number, after: number, o: { turn?: number; rise?: number } = {}): number {
    this.run(lead);
    const c = this.run(len, { kind: 'cloud', turn: o.turn, rise: o.rise });
    this.run(after);
    const s = c - Math.min(30, lead - 2);
    this.add('cloud', s, { len: len + (c - s) + 4, params: { gap: c - s, len } });
    this.flag(s - CP_LEAD);
    return c;
  }
  /** a claw wall-run segment (steep climb and/or banked face). Returns its s0. */
  wallRun(len: number, o: RunOpts = {}): number {
    // the face tilts up over the first ~30 u, so most of the run is on the steep cliff, not a ramp
    const s0 = this.run(len, { bankIn: Math.min(0.3, 30 / len), ...o, kind: 'wall' });
    this.add('wallrun', s0, { len });
    this.flag(s0 - CP_LEAD);
    return s0;
  }
  /** a leaf-surf river stretch. Returns its s0. */
  riverRun(len: number, o: RunOpts = {}): number {
    const s0 = this.run(len, { width: 13, ...o, kind: 'river' });
    this.add('river', s0, { len });
    this.flag(s0 - CP_LEAD);
    return s0;
  }
  dogChase(s: number, len: number, side = -1): this {
    this.flag(s - CP_LEAD);
    this.sign(s - 20, 'dog', side);
    return this.add('dog', s, { len, params: { side } });
  }
  yarnChase(s: number, len: number): this {
    this.flag(s - CP_LEAD);
    this.sign(s - 20, 'yarn', 1);
    return this.add('yarnchase', s, { len });
  }
}
