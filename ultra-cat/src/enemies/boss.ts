// Shared boss plumbing: HP, phases, the boss bar events, hit flashes, hit pops and the cat knock-back.
// Owned by the ENEMIES lane. meta-ui draws the health bar from bossSpawn / bossHp / bossPhase.
import * as THREE from 'three';
import { events } from '../core/events';
import { pop } from '../core/hud';
import { score } from '../core/score';
import { C, game } from '../core/state';
import type { EnemyId, EnemySpec, LevelDef } from '../core/types';
import { addFrameHook } from '../core/loop';
import { applyDamage, phaseOf } from './bossmath';
import { bossFight, frame, sparks } from './common';
import { camFocus } from '../core/camera';
import * as S from './sfx';

const hpEv = { type: 'mechaDog' as EnemyId, hp: 0, maxHp: 0 };

export class BossCore {
  hp = 0;
  maxHp = 1;
  phase = 0;
  up = false; // spawned and not yet dead
  dead = false;
  invuln = 0; // seconds of intro invulnerability
  flashT = 0;
  spawnAt = Infinity;
  spawned = false;
  private laserFrame = -1;
  private popT = 0;
  private popN = 0;
  private lastPop: { el: HTMLElement } | null = null;
  private lastLabel = '';
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private baseEmissive: number[] = [];

  constructor(
    readonly type: EnemyId,
    readonly name: string,
    readonly cuts: readonly number[],
    readonly phaseNames: readonly string[],
  ) {}

  /** Materials that flash white when hit (registered once by the model builder). */
  flashOn(...mats: THREE.MeshStandardMaterial[]): void {
    for (const m of mats) {
      this.mats.push(m);
      this.baseEmissive.push(m.emissiveIntensity);
    }
  }

  /** Level begin: when to spawn (seconds of G.elapsed). The boss reads hp etc. from `spec.params` when listed. */
  begin(spec: EnemySpec | null, level: LevelDef, fallbackAt: number): void {
    this.reset();
    this.spawnAt = level.boss?.type === this.type ? level.boss.at : spec ? spec.delay : fallbackAt;
  }

  reset(): void {
    bossFight.up = bossFight.final = false;
    this.up = false;
    this.dead = false;
    this.spawned = false;
    this.phase = 0;
    this.flashT = 0;
    this.spawnAt = Infinity;
  }

  spawn(maxHp: number, invuln = 2): void {
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.up = true;
    this.dead = false;
    this.spawned = true;
    this.invuln = invuln;
    this.phase = 1;
    bossFight.up = true;
    bossFight.final = !!game.level?.boss?.endsLevel && game.level.boss.type === this.type;
    events.emit('bossSpawn', { type: this.type, name: this.name, maxHp });
    this.emitHp();
    events.emit('bossPhase', { type: this.type, phase: 1, name: this.phaseNames[0] ?? '' });
  }

  private emitHp(): void {
    hpEv.type = this.type;
    hpEv.hp = this.hp;
    hpEv.maxHp = this.maxHp;
    events.emit('bossHp', hpEv);
  }

  /** The laser hits at most once per frame (it calls the hook for every beam sample). */
  laserOnce(): boolean {
    if (this.laserFrame === frame.n) return false;
    this.laserFrame = frame.n;
    return true;
  }

  /**
   * Apply damage. Returns 'dead' when this hit killed it, 'phase' when it crossed into a new phase, 'hit' or 'none'.
   * `at` is where the spark / pop shows; `label` the pop text (rate limited for the laser).
   */
  hit(dmg: number, at: THREE.Vector3, label = 'CLANK!', loud = true): 'none' | 'hit' | 'phase' | 'dead' {
    if (!this.up || this.dead || this.invuln > 0 || game.mode !== 'play' || dmg <= 0) return 'none';
    // a phase never gets skipped: a hit stops at the next cut, then a short invulnerable transition plays
    const cut = this.phase - 1 < this.cuts.length ? this.cuts[this.phase - 1] * this.maxHp : 0;
    this.hp = Math.max(applyDamage(this.hp, dmg), cut > 0 ? cut - 0.001 : 0);
    this.flashT = loud ? 0.14 : Math.max(this.flashT, 0.05);
    this.emitHp();
    if (loud) {
      S.clank(this.type === 'roombaPrime' ? 0.7 : 1);
      sparks(at.x, at.y, at.z, 12);
      score(0.6, at, 'CLANK ');
    } else if (Math.random() < 0.3) sparks(at.x, at.y, at.z, 2);
    if (loud && this.popT > 0 && this.lastPop && this.lastLabel === label) {
      // rapid hits merge into one counter: "CLANK! x4"
      this.popN++;
      this.lastPop.el.textContent = `${label} x${this.popN}`;
      this.popT = 0.5;
    } else if (this.popT <= 0 || loud) {
      this.lastPop = pop(label, at, '#ffe36a', loud ? 30 : 20);
      this.lastLabel = label;
      this.popN = 1;
      this.popT = 0.5;
    }
    if (this.hp <= 0) {
      this.dead = true;
      bossFight.up = bossFight.final = false;
      return 'dead';
    }
    const ph = phaseOf(this.hp, this.maxHp, this.cuts);
    if (ph !== this.phase) {
      this.phase = ph;
      this.invuln = Math.max(this.invuln, PHASE_INVULN);
      events.emit('bossPhase', { type: this.type, phase: ph, name: this.phaseNames[ph - 1] ?? '' });
      return 'phase';
    }
    return 'hit';
  }

  /** A blocked hit (shield): feedback, no damage. */
  blocked(at: THREE.Vector3): void {
    if (this.popT > 0) return;
    this.popT = 0.4;
    S.clank(1.6);
    sparks(at.x, at.y, at.z, 6, SHIELD_SPARKS);
    pop('SHIELD!', at, '#7fe8ff', 24);
  }

  /** Ask the camera to frame the boss too (call every frame while it should). */
  focus(x: number, z: number, w = 1): void {
    camFocus.x = x;
    camFocus.z = z;
    camFocus.want = Math.max(camFocus.want, w);
  }

  /** Per-frame: timers and the hit flash. */
  tick(dt: number): void {
    this.invuln = Math.max(0, this.invuln - dt);
    this.popT -= dt;
    this.flashT = Math.max(0, this.flashT - dt);
    const f = this.flashT > 0 ? 1 : 0;
    for (let i = 0; i < this.mats.length; i++) {
      const m = this.mats[i];
      m.emissive.setHex(f ? 0xffffff : m.userData.emissive ?? 0x000000);
      m.emissiveIntensity = f ? 0.9 : this.baseEmissive[i];
    }
  }

  /** Debug / tests: set HP to a fraction of max (fires the events and phase changes like a hit would). */
  setHpFrac(f: number): void {
    if (!this.up) return;
    this.hp = Math.max(0.01, Math.min(1, f)) * this.maxHp;
    this.emitHp();
    const ph = phaseOf(this.hp, this.maxHp, this.cuts);
    if (ph !== this.phase) {
      this.phase = ph;
      events.emit('bossPhase', { type: this.type, phase: ph, name: this.phaseNames[ph - 1] ?? '' });
    }
  }
}
/** Seconds a boss ignores damage while it changes phase (banner, alarm, new moves). */
const PHASE_INVULN = 1.5;
const SHIELD_SPARKS = [0x7fe8ff, 0xffffff, 0x4cc3ff] as const;

/** Remember a material's resting emissive so the flash can restore it. */
export function emissiveOf(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.userData.emissive = m.emissive.getHex();
  return m;
}

// ---------- knock-back on the cat (charges, spins, barks) ----------
const knock = { x: 0, z: 0, t: 0, T: 1 };
/** Shove the cat with an initial velocity that fades over `T` seconds. */
export function knockCat(vx: number, vz: number, T = 0.45): void {
  knock.x = vx;
  knock.z = vz;
  knock.t = T;
  knock.T = T;
}
addFrameHook((dt) => {
  if (knock.t <= 0 || dt <= 0) return;
  if (game.mode !== 'play') {
    knock.t = 0;
    return;
  }
  knock.t -= dt;
  const k = Math.max(0, knock.t / knock.T);
  C.tugX += knock.x * k;
  C.tugZ += knock.z * k;
});
