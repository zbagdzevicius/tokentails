/**
 * The FxCtx a hero's SkillFxSet draws with (ANIM-SPEC §3, §7): the pooled mesh FX, ribbons, lingering glyphs, the
 * existing CombatVfx particles and shockwaves, the fight camera, juice and the move-cue sounds, plus lookups
 * (relation, rim colour, talent- and branch-resolved ability numbers, hero and bone positions). Nothing allocates per
 * call except the first abil() of a talent combination (cached).
 */
import * as THREE from 'three';
import { sfx, type SfxName } from '../../audio/sfx';
import type { HeroId } from '../../data/heroes/types';
import type { BoneName } from '../chars/skeleton';
import { BONE_INDEX } from '../chars/skeleton';
import { abilNumbers } from './timing';
import { RIM } from './fxkit/readability';
import type { CombatVfxLike, FightCamLike, FxCtx, HeroStatus, JuiceLike, LingerLike, MeshFxLike, Relation3, RibbonsLike, SfxLike, ShockwavesLike, Slot, V3Out } from './types';

/** Move cue sounds (§8) as variants of the synth set: [sound, rate, volume]. */
export const CUE_SFX: Readonly<Record<string, readonly [SfxName, number, number]>> = Object.freeze({
  whooshS: ['dash', 1.45, 0.35],
  whooshM: ['dash', 1.1, 0.45],
  whooshL: ['dash', 0.8, 0.55],
  flip: ['dash', 1.25, 0.45],
  land: ['slam', 1.5, 0.35],
  bodyThud: ['slam', 0.9, 0.55],
  clang: ['hit', 1.7, 0.6],
  tingParry: ['coin', 1.6, 0.6],
  crackle: ['magic', 1.7, 0.45],
  zap: ['towerShot', 0.8, 0.5],
  sizzle: ['magic', 0.7, 0.45],
  fwoomp: ['ult', 1.4, 0.45],
  pop: ['poof', 1.1, 0.55],
  balloon: ['pickup', 0.8, 0.45],
  chain: ['hit', 2.1, 0.4],
  lightsJingle: ['coin', 1.2, 0.5],
  flutter: ['swipe', 1.6, 0.35],
  kiss: ['pickup', 1.6, 0.45],
  drum: ['slam', 1.2, 0.5],
  curtain: ['swipe', 0.6, 0.45],
  gong: ['horn', 1.6, 0.5],
});
/** At most this many move cues per 100 ms (§8). */
export const CUE_CAP = 3;

export class CueSfx implements SfxLike {
  private win = -1;
  private n = 0;
  private time = 0;
  tick(dt: number): void {
    this.time += dt;
  }
  cue(name: string, at?: { x: number; z: number }, vol = 1): void {
    const d = CUE_SFX[name] ?? CUE_SFX[`whoosh${name}`];
    if (!d) return;
    const w = Math.floor(this.time * 10);
    if (w !== this.win) (this.win = w), (this.n = 0);
    if (this.n >= CUE_CAP) return;
    this.n++;
    sfx.play(d[0], { rate: d[1], vol: d[2] * vol, at });
  }
}

/** What the runtime needs to know about the heroes (HeroView + snapshots). */
export interface HeroLookup {
  readonly mySlot: number;
  readonly myTeam: number;
  teamOf(id: number): number;
  heroOf(id: number): HeroId | null;
  posOf(id: number, out: V3Out): boolean;
  bone(id: number, bone: BoneName): THREE.Object3D | null;
  talentsOf(id: number): readonly string[] | null;
  branchOf(id: number): boolean;
  /** Drawn object yaw (rad; forward = (cos, −sin) on x / z), NaN when not drawn. Optional. */
  yawOf?(id: number): number;
}

const _v = new THREE.Vector3();
const NONE: Readonly<Record<string, number>> = Object.freeze({});

export class FxRuntime implements FxCtx {
  tier: 'low' | 'med' | 'high' = 'med';
  reduced = false;

  constructor(
    readonly mesh: MeshFxLike,
    readonly ribbons: RibbonsLike,
    readonly linger: LingerLike,
    readonly particles: CombatVfxLike,
    readonly shock: ShockwavesLike,
    readonly cam: FightCamLike,
    readonly juice: JuiceLike,
    readonly sfx: CueSfx,
    readonly lookup: HeroLookup,
  ) {}

  relation(id: number): Relation3 {
    if (id === this.lookup.mySlot) return 'own';
    return this.lookup.teamOf(id) === this.lookup.myTeam ? 'ally' : 'enemy';
  }

  rim(id: number): number {
    return RIM[this.relation(id)];
  }

  abil(id: number, slot: Slot): Readonly<Record<string, number>> {
    const h = this.lookup.heroOf(id);
    if (!h) return NONE;
    return abilNumbers(h, slot, this.lookup.talentsOf(id), this.lookup.branchOf(id));
  }

  heroPos(id: number, out: V3Out): boolean {
    return this.lookup.posOf(id, out);
  }

  /** The current frame's entities (set by the director each frame), for status(). */
  ents: ReadonlyMap<number, { buffs: number; shield: number; hp?: number; maxHp?: number }> | null = null;
  /** The current frame's drawn projectiles (set by the director each frame), for projPos(). */
  projs: readonly { index: number; fx: number; fy: number }[] | null = null;

  status(id: number, out: HeroStatus): boolean {
    const e = this.ents?.get(id);
    if (!e) return false;
    out.buffs = e.buffs;
    out.shield = e.shield;
    out.hp = e.hp ?? 0;
    out.maxHp = e.maxHp ?? 0;
    return true;
  }

  facing(id: number, out: V3Out): boolean {
    const y = this.lookup.yawOf?.(id) ?? NaN;
    if (y !== y) return false;
    out.x = Math.cos(y);
    out.y = 0;
    out.z = -Math.sin(y);
    return true;
  }

  projPos(index: number, out: V3Out): boolean {
    const l = this.projs;
    if (!l) return false;
    for (let i = 0; i < l.length; i++)
      if (l[i].index === index) {
        out.x = l[i].fx / 1000;
        out.y = 0.6;
        out.z = -l[i].fy / 1000;
        return true;
      }
    return false;
  }

  bonePos(id: number, bone: BoneName | 'weaponTip', out: V3Out): boolean {
    const b = this.lookup.bone(id, bone === 'weaponTip' ? 'weapon' : bone);
    if (!b) return false;
    b.updateWorldMatrix(true, false);
    if (bone === 'weaponTip') _v.set(0, WEAPON_TIP, 0).applyMatrix4(b.matrixWorld);
    else _v.setFromMatrixPosition(b.matrixWorld);
    out.x = _v.x;
    out.y = _v.y;
    out.z = _v.z;
    return true;
  }
}

/** Blade tip along the weapon socket's +Y (rig units, H). */
export const WEAPON_TIP = 0.5;
export { BONE_INDEX };
