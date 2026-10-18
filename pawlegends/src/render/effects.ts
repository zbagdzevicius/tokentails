/**
 * The FX director: turns sim events (hit, cast, windup, death, levelup, tower, pudding, sunset, suddenDeath) into
 * particles, shockwaves, damage numbers, hitstop, shake, banners, sounds and animation cues on the views. Events
 * reach it when the render clock passes their tick, so a hit spark lands with the swing you see. Render only.
 */
import * as THREE from 'three';
import { HEROES } from '../data/heroes';
import { MAP } from '../data/map';
import { PUDDING } from '../data/pudding';
import type { CastSlot, HeroId, SimEvent, TrickId } from '../sim/api';
import { sfx } from '../audio/sfx';
import { aimFor, trickAim, type AimSpec } from '../input/abilities';
import { CONFETTI_COLORS } from './ppk/fx/palette.js';
import { DamageNumbers } from './fx/DamageNumbers.js';
import { FADE, GROW, SHAPE, type Particles } from './fx/Particles.js';
import type { Shockwaves } from './fx/Shockwaves.js';
import type { Juice } from './juice';
import { RELATION, TEAM } from './palette';
import { HERO_TOP } from './chars/specs';
import { isFun, isNineLives, type AnyEvent, type FunEvent, type PickupKind } from './feelEvents';

/** "Press R" on a keyboard; touch buttons carry icons, not letters, so name the button there. */
export function ultHint(): string {
  try {
    return document.documentElement.dataset.touch === '1' ? 'Tap the big gold button' : 'Press R';
  } catch {
    return 'Press R';
  }
}

export interface Who {
  id: number;
  kind: string;
  team: number;
  hero?: HeroId;
  x: number;
  z: number;
  /** Facing (rad, sim convention). */
  yaw: number;
}

export interface ActiveWindup {
  src: number;
  slot: CastSlot | 4;
  x: number;
  y: number;
  start: number;
  ticks: number;
}

/** Map middle (sim mm, north–south). */
const MAP_MID_Y = MAP.height / 2;

export interface EffectsHooks {
  /** Entity lookup by id (last drawn place, also for units that just vanished). */
  who(id: number): Who | null;
  mySlot: number;
  myTeam: number;
  /** Paw Trick per slot (welcome). */
  trickOf(slot: number): TrickId;
  onSwing(id: number): void;
  onCast(id: number): void;
  onHit(id: number, kind: string, heavy: boolean): void;
  onKill?(e: Extract<SimEvent, { type: 'death' }>, victim: Who | null, killer: Who | null): void;
  /** Returns true when the session shows its own ultimate prompt (goal chip or tip): no ULTIMATE READY banner then. */
  onLevel?(level: number): boolean | void;
  onTalentOffer?(tier: number): void;
  onWindupAtMe?(): void;
  onTowerDown?(destroyedByMyTeam: boolean): void;
  /** An enemy tower or core locked on to the player (fun plan S5 lock-on; the `windup` with slot 4). */
  onTowerAim?(src: number, ticks: number): void;
  /** Pickups (fun plan S9): a new one on the ground, or one taken by `who`. */
  onPickupSpawn?(index: number, kind: PickupKind, x: number, y: number): void;
  onPickupTaken?(kind: PickupKind, who: Who | null): void;
  /** A core fell (the match is ending): the session pushes the camera in. */
  onCoreDown?(who: Who): void;
}

const _p = new THREE.Vector3();
const _np = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Effects {
  readonly numbers: DamageNumbers;
  readonly windups: ActiveWindup[] = [];
  /** Render clock (s) and the last CLANK per target. */
  private time = 0;
  private readonly clankAt = new Map<number, number>();

  constructor(
    private readonly particles: Particles,
    private readonly shock: Shockwaves,
    private readonly juice: Juice,
    private readonly hooks: EffectsHooks,
    numbersCtx: unknown,
  ) {
    this.numbers = new DamageNumbers(numbersCtx);
    this.numbers.init();
  }

  private rel(team: number, id: number): number {
    if (id === this.hooks.mySlot) return RELATION.self;
    if (team === 2) return RELATION.neutral;
    return team === this.hooks.myTeam ? RELATION.ally : RELATION.enemy;
  }

  /** Drop finished wind-ups (call per frame with the render tick). */
  pruneWindups(tick: number): void {
    for (let i = this.windups.length - 1; i >= 0; i--) {
      const w = this.windups[i];
      if (tick > w.start + w.ticks + 2) this.windups.splice(i, 1);
    }
  }

  aimOf(who: Who | null, slot: CastSlot | 4): AimSpec | null {
    if (!who) return null;
    if (who.kind === 'pudding') return { kind: 'self', shape: 'ring', range: PUDDING.hopRadius, radius: PUDDING.hopRadius, smart: 'none' };
    if (who.kind !== 'hero' || !who.hero) return null;
    return slot === 4 ? trickAim(this.hooks.trickOf(who.id)) : aimFor(who.hero, slot);
  }

  handle(ev: AnyEvent): void {
    if (isFun(ev)) return this.fun(ev);
    const e = ev as SimEvent;
    switch (e.type) {
      case 'hit':
        return this.hit(e);
      case 'cast':
        return this.cast(e);
      case 'windup':
        return this.windup(e);
      case 'death':
        return this.death(e);
      case 'levelup':
        return this.levelup(e);
      case 'talentOffer':
        if (e.slot === this.hooks.mySlot) this.hooks.onTalentOffer?.(e.tier);
        return;
      case 'tower':
        return this.tower(e);
      case 'pudding':
        return this.pudding(e);
      case 'sunset':
        sfx.play('horn');
        this.juice.banner({ title: 'Sunset', sub: 'Towers and cores take more damage. Respawns get longer.', tone: 'gold' });
        return;
      case 'suddenDeath':
        sfx.play('horn', { rate: 0.8 });
        this.juice.banner({ title: 'Sudden Death', sub: 'Cores crumble. Every takedown hits the core.', tone: 'bad' });
        this.juice.kick(0.3);
        return;
      default:
        return;
    }
  }

  /** The fun-plan events (pickups, Nine Lives): visuals and sounds only; the announcer does the words. */
  private fun(e: FunEvent): void {
    switch (e.type) {
      case 'pickupSpawn': {
        this.hooks.onPickupSpawn?.(e.index, e.kind, e.x, e.y);
        _p.set(e.x / 1000, 0.4, -e.y / 1000);
        const c = e.kind === 'frenzy' ? 0x7dff8a : 0xffa64d;
        this.particles.burst(_p, { additive: true, n: 14, shape: SHAPE.STAR4, color: c, intensity: 1.8, size: [0.18, 0.3], life: [0.5, 0.8], speed: [1, 3], up: 3 });
        this.shock.start(_p.setY(0), { r1: 2.5, dur: 0.35, color: e.kind === 'frenzy' ? '#7DFF8A' : '#FFA64D', height: 0.3 });
        if (e.kind === 'frenzy') sfx.play('pickup', { at: { x: e.x / 1000, z: -e.y / 1000 }, rate: 0.7 });
        return;
      }
      case 'pickup': {
        const who = this.hooks.who(e.id);
        this.hooks.onPickupTaken?.(e.kind, who);
        if (!who) return;
        const c = e.kind === 'frenzy' ? 0x7dff8a : 0xffa64d;
        this.particles.ring(this.at(who, 0.2), { n: 16, r0: 0.4, speed: [2, 3.5], up: 2, color: c, alpha: 0.95, additive: true, size: [0.2, 0.32], shape: SHAPE.STAR4, intensity: 1.8 });
        if (e.kind === 'snack') this.particles.burst(this.at(who, 1.2), { n: 8, shape: SHAPE.HEART, color: 0xff8fb1, size: [0.22, 0.32], life: [0.6, 0.9], speed: [0.5, 1.2], up: 1.6, gravity: -0.5 });
        sfx.play('pickup', { at: who, rate: e.kind === 'frenzy' ? 1 : 1.3 });
        if (e.id === this.hooks.mySlot) this.juice.kick(0.12);
        return;
      }
      case 'buff': {
        if (!isNineLives(e)) return;
        const who = this.hooks.who(e.id);
        if (who) {
          this.particles.ring(this.at(who, 0.9), { n: 18, r0: 0.7, speed: [1.5, 2.5], up: 0.6, color: 0xffffff, alpha: 1, additive: true, size: [0.2, 0.3], shape: SHAPE.STAR4, intensity: 2.2 });
          this.hooks.onHit(e.id, 'hero', true);
        }
        if (e.id === this.hooks.mySlot) {
          this.juice.flash('white');
          sfx.play('ooh', { vol: 0.8 });
        }
        return;
      }
      default:
        return;
    }
  }

  private at(w: Who, y = 0.9): THREE.Vector3 {
    return _p.set(w.x, y, w.z);
  }

  private hit(e: Extract<SimEvent, { type: 'hit' }>): void {
    const dst = this.hooks.who(e.dst);
    const src = this.hooks.who(e.src);
    const me = this.hooks.mySlot;
    if (src && e.kind === 'basic') this.hooks.onSwing(e.src);
    if (!dst) return;
    const heroDst = dst.kind === 'hero';
    const heavy = e.kind === 'ability' || e.amount >= 120;
    this.hooks.onHit(e.dst, dst.kind, heavy);
    const pos = this.at(dst, heroDst ? 0.9 : dst.kind === 'tower' || dst.kind === 'core' ? 2.4 : 0.6);
    const color = src ? (src.team === 0 ? 0xffd27a : 0xc9a8ff) : 0xffffff;
    // sparks + a flash
    this.particles.burst(pos, {
      additive: true,
      n: heavy ? 12 : 6,
      shape: SHAPE.SPARK,
      color,
      intensity: 1.8,
      size: [0.08, 0.16],
      life: [0.18, 0.32],
      speed: [3, 6.5],
      stretch: 2.4,
      drag: 4,
      gravity: 6,
    });
    this.particles.single(pos, { shape: SHAPE.STAR4, color: 0xfff6da, intensity: 2, size0: heavy ? 0.9 : 0.55, size1: 0.1, life: 0.14, rot: Math.random() * 3 });
    // at most one CLANK per target per 0.5 s (a shielded tank in a teamfight stacked ten of them)
    if (e.shielded > 0 && this.time - (this.clankAt.get(e.dst) ?? -9) >= 0.5) {
      this.clankAt.set(e.dst, this.time);
      this.numbers.pop('clank', pos);
    }
    // numbers: what I deal and what I take. On a hero they spawn ABOVE the nameplate with a little sideways jitter
    // (on the body they hid the model in teamfights); repeat hits merge into one counter per target (DamageNumbers).
    const npos = heroDst && dst.hero ? _np.set(dst.x + (Math.random() - 0.5) * 0.7, HERO_TOP[dst.hero] + 1.0, dst.z + (Math.random() - 0.5) * 0.7) : pos;
    if (e.src === me) {
      this.numbers.show(npos, String(e.amount), heavy ? 'heavy' : 'normal', e.dst, e.amount);
      if (heroDst) {
        this.juice.hitstop(e.kind === 'ability' ? 55 : 28);
        this.juice.kick(e.kind === 'ability' ? 0.16 : 0.08);
      }
      sfx.play(heroDst ? 'heroHit' : 'hit', { at: dst });
    } else if (e.dst === me) {
      this.numbers.show(npos, String(e.amount), 'hurt', e.dst, e.amount);
      this.juice.kick(Math.max(e.kind === 'tower' ? 0.18 : 0, Math.min(0.35, 0.1 + e.amount / 600)));
      sfx.play('hurt');
    } else {
      if (heroDst && src?.kind === 'hero') this.numbers.show(npos, String(e.amount), 'info', e.dst, e.amount);
      sfx.play(e.kind === 'tower' ? 'towerShot' : 'hit', { at: dst, vol: 0.45 });
    }
  }

  private cast(e: Extract<SimEvent, { type: 'cast' }>): void {
    const src = this.hooks.who(e.src);
    if (!src) return;
    this.hooks.onCast(e.src);
    const aim = this.aimOf(src, e.slot);
    const tx = e.x / 1000;
    const tz = -e.y / 1000;
    let yaw = Math.atan2(-(tz - src.z), tx - src.x);
    if (!Number.isFinite(yaw) || (Math.abs(tx - src.x) < 0.01 && Math.abs(tz - src.z) < 0.01)) yaw = src.yaw;
    const team = src.team === 1 ? TEAM[1] : TEAM[0];
    const accent = src.hero ? heroAccent(src.hero) : team.main;
    const mine = e.src === this.hooks.mySlot;
    const ult = e.slot === 3;
    // First-match dodge tip (POC.md §12): an enemy hero's ability aimed at the player (at them, or landing within
    // 4 m). Only Moonshot has a wind-up in the POC kits, so instant casts count too, or the tip would almost never come.
    if (src.team !== this.hooks.myTeam && src.kind === 'hero' && e.slot !== 4) {
      const me = this.hooks.who(this.hooks.mySlot);
      if (me && (e.target === this.hooks.mySlot || Math.hypot(me.x - tx, me.z - tz) < 4)) this.hooks.onWindupAtMe?.();
    }
    if (ult) {
      this.particles.ring(this.at(src, 0.1), { n: 22, r0: 0.5, speed: [4, 6], up: 1.2, color: accent, alpha: 0.9, additive: true, size: [0.3, 0.45], shape: SHAPE.STAR4, intensity: 1.6 });
      if (mine) {
        this.juice.kick(0.2);
        this.juice.callout(src.hero ? ultName(src.hero) : 'Ultimate!', 'gold');
      }
    }
    if (e.slot === 4) return this.trick(src, e.x, e.y, mine);
    const shape = aim?.shape ?? 'none';
    const range = (aim?.range ?? 2000) / 1000;
    switch (shape) {
      case 'cone': {
        const arc = aim?.arc ?? 1.2;
        for (let i = 0; i < 14; i++) {
          const a = yaw - arc / 2 + (arc * i) / 13;
          _d.set(Math.cos(a), 0.15, -Math.sin(a));
          this.particles.burst(this.at(src, 0.8), { additive: true, n: 2, exact: true, dir: _d, spread: 0.08, shape: SHAPE.SPARK, color: accent, intensity: 1.6, size: [0.12, 0.2], life: [0.2, 0.3], speed: [range * 3.2, range * 4], stretch: 3, drag: 3 });
        }
        sfx.play(src.hero === 'sage' ? 'arrow' : 'swipe', { at: src });
        break;
      }
      case 'ring':
        this.shock.start(this.at(src, 0), { r1: Math.min(8, (aim?.radius ?? 3000) / 1000), dur: 0.3, color: '#' + accent.toString(16).padStart(6, '0'), height: 0.4 });
        this.shock.thud(this.at(src, 0), 1);
        sfx.play('slam', { at: src });
        if (mine || src.kind === 'hero') this.juice.kick(mine ? 0.2 : 0.08);
        break;
      case 'dash': {
        const away = aim?.away ? -1 : 1;
        for (let i = 0; i < 10; i++) {
          const t = i / 9;
          _p.set(src.x + Math.cos(yaw) * range * t * away, 0.3, src.z - Math.sin(yaw) * range * t * away);
          this.particles.burst(_p, { n: 2, exact: true, shape: SHAPE.PUFF, color: 0xfff4e0, alpha: 0.7, size: [0.3, 0.5], sizeEnd: 1.8, life: [0.35, 0.5], speed: [0.2, 0.8], up: 0.5, drag: 2 });
        }
        sfx.play('dash', { at: src });
        break;
      }
      case 'line': {
        const len = Math.min(40, range);
        for (let i = 0; i < 40; i++) {
          const t = i / 39;
          _p.set(src.x + Math.cos(yaw) * len * t, 1.0, src.z - Math.sin(yaw) * len * t);
          this.particles.single(_p, { shape: SHAPE.SOFT, color: accent, intensity: 2.2, size0: 1.3, size1: 0.2, life: 0.35 + t * 0.15 });
        }
        sfx.play('ult', { at: src });
        this.juice.kick(mine ? 0.25 : 0.12);
        break;
      }
      case 'circle': {
        _p.set(tx, 0.2, tz);
        this.particles.burst(_p, { additive: true, n: 10, shape: SHAPE.STAR4, color: accent, intensity: 1.5, size: [0.15, 0.3], life: [0.3, 0.5], speed: [1, 2.5], up: 1 });
        sfx.play('magic', { at: { x: tx, z: tz } });
        break;
      }
      default:
        this.particles.burst(this.at(src, 0.9), { additive: true, n: 14, shape: SHAPE.STAR4, color: accent, intensity: 1.5, size: [0.15, 0.28], life: [0.35, 0.6], speed: [1, 3], up: 1.5 });
        sfx.play(e.slot === 1 && (src.hero === 'clem' || src.hero === 'brutus') ? 'shieldUp' : 'magic', { at: src });
    }
  }

  private trick(src: Who, x: number, y: number, mine: boolean): void {
    const trick = this.hooks.trickOf(src.id);
    if (trick === 'pounce') {
      this.particles.burst(this.at(src, 0.5), { n: 12, shape: SHAPE.PUFF, color: 0xfff4e0, size: [0.4, 0.6], sizeEnd: 1.6, life: [0.3, 0.5], speed: [1, 3] });
      _p.set(x / 1000, 0.5, -y / 1000);
      this.particles.burst(_p, { additive: true, n: 12, shape: SHAPE.STAR4, color: 0xffd34d, intensity: 1.8, size: [0.15, 0.3], life: [0.3, 0.5], speed: [1.5, 3.5] });
      sfx.play('dash', { at: src, rate: 1.3 });
    } else if (trick === 'snack') {
      this.particles.burst(this.at(src, 1.2), { n: 10, shape: SHAPE.HEART, color: 0xff8fb1, size: [0.25, 0.35], life: [0.7, 1], speed: [0.5, 1.4], up: 1.8, gravity: -0.5 });
      sfx.play('coin', { at: src, rate: 0.8 });
    } else {
      this.shock.start(this.at(src, 0), { r1: 3, dur: 0.25, color: '#B07CFF', height: 0.5 });
      sfx.play('hyenaLaugh', { at: src, rate: 0.7 });
    }
    if (mine) this.juice.kick(0.1);
  }

  private windup(e: Extract<SimEvent, { type: 'windup' }>): void {
    if (e.ticks <= 0) return;
    this.windups.push({ src: e.src, slot: e.slot, x: e.x, y: e.y, start: e.tick, ticks: e.ticks });
    const src = this.hooks.who(e.src);
    if (!src) return;
    if ((src.kind === 'tower' || src.kind === 'core') && src.team !== this.hooks.myTeam) {
      // tower lock-on (fun plan S5): the red line and ring are drawn by the session's overlay
      const me = this.hooks.who(this.hooks.mySlot);
      if (me && Math.hypot(me.x - e.x / 1000, me.z + e.y / 1000) < 3) {
        this.hooks.onTowerAim?.(e.src, e.ticks);
        sfx.play('windup', { at: src, vol: 0.8, rate: 0.6 });
      }
      return;
    }
    sfx.play('windup', { at: src, vol: 0.6 });
    if (src.team !== this.hooks.myTeam) {
      const me = this.hooks.who(this.hooks.mySlot);
      // "Aimed at you" (first-match dodge tip, POC.md §12): it lands within 5 m of the player, or an enemy hero
      // winds up within 7 m of them (a cone or a dash points at whoever is that close).
      const lands = me ? Math.hypot(me.x - e.x / 1000, me.z + e.y / 1000) : Infinity;
      const near = me ? Math.hypot(me.x - src.x, me.z - src.z) : Infinity;
      if (me && (lands < 5 || (src.kind === 'hero' && near < 7))) this.hooks.onWindupAtMe?.();
    }
  }

  private death(e: Extract<SimEvent, { type: 'death' }>): void {
    const v = this.hooks.who(e.id);
    const k = this.hooks.who(e.killer);
    this.hooks.onKill?.(e, v, k);
    if (!v) return;
    const pos = this.at(v, 0.6);
    if (v.kind === 'hero') {
      this.particles.burst(pos, { n: 26, shape: SHAPE.PUFF, color: 0xfff4e0, alpha: 0.9, size: [0.45, 0.8], sizeEnd: 1.8, life: [0.5, 0.8], speed: [2, 4.5], up: 1, drag: 2.5 });
      this.particles.burst(pos, { additive: true, n: 18, shape: SHAPE.STAR5, color: this.rel(v.team, v.id), intensity: 1.8, size: [0.2, 0.36], life: [0.5, 0.9], speed: [3, 6], up: 3, gravity: 7 });
      this.shock.start(this.at(v, 0), { r1: 3, dur: 0.35, color: '#FFE0C8', height: 0.3 });
      sfx.play('death', { at: v });
      // the words ("Takedown!", First Blood, multikills) come from the announcer (render/announcer.ts)
      if (e.killer === this.hooks.mySlot) {
        this.juice.hitstop(120, 0.08);
        this.juice.kick(0.3);
      }
      if (e.id === this.hooks.mySlot) this.juice.kick(0.35);
    } else {
      this.particles.burst(pos, { n: v.kind === 'minion' ? 9 : 16, shape: SHAPE.PUFF, color: 0xfff4e0, alpha: 0.8, size: [0.3, 0.5], sizeEnd: 1.6, life: [0.35, 0.55], speed: [1.2, 2.8], up: 0.6, drag: 3 });
      if (e.killer === this.hooks.mySlot) {
        this.particles.burst(this.at(v, 1), { additive: true, n: 6, shape: SHAPE.STAR4, color: 0xffd34d, intensity: 2, size: [0.15, 0.25], life: [0.4, 0.6], speed: [1, 2], up: 2.5, gravity: 3 });
        sfx.play('coin', { at: v, vol: 0.6 });
      } else sfx.play('poof', { at: v, vol: 0.5 });
    }
  }

  private levelup(e: Extract<SimEvent, { type: 'levelup' }>): void {
    const v = this.hooks.who(e.id);
    if (v) {
      this.particles.ring(this.at(v, 0.1), { n: 18, r0: 0.6, speed: [1.5, 2.5], up: 2.4, color: 0xffd34d, alpha: 0.95, additive: true, size: [0.2, 0.3], shape: SHAPE.STAR4, intensity: 1.8, drag: 1.5 });
      this.particles.single(this.at(v, 0.05), { shape: SHAPE.RING, color: 0xffd34d, intensity: 1.6, size0: 0.5, size1: 3.5, life: 0.45, grow: GROW.OUT });
    }
    if (e.id === this.hooks.mySlot) {
      sfx.play('levelup');
      const guided = this.hooks.onLevel?.(e.level) === true;
      // the satisfying level-up (fun plan F2 item 6): a gold shockwave, a fountain of stars and a rim flash
      if (v) {
        this.shock.start(this.at(v, 0), { r1: 5, dur: 0.5, color: '#FFD34D', height: 0.5 });
        this.particles.burst(this.at(v, 0.4), { additive: true, n: 26, shape: SHAPE.STAR5, color: 0xffd34d, intensity: 2, size: [0.2, 0.36], life: [0.6, 1], speed: [2, 4.5], up: 5, gravity: 6 });
      }
      this.juice.flash('gold');
      this.juice.kick(0.12);
      this.juice.callout(`Level ${e.level}`, 'gold');
      // one channel per message: the goal chip or tip carries it when the session guides; else the banner
      if (e.level === 4 && !guided) this.juice.banner({ title: 'ULTIMATE READY', sub: ultHint(), tone: 'gold' });
    }
  }

  private tower(e: Extract<SimEvent, { type: 'tower' }>): void {
    const v = this.hooks.who(e.id);
    const good = e.destroyedBy === this.hooks.myTeam;
    this.hooks.onTowerDown?.(good);
    // Which lane, so two towers falling at once read as two events (sim +y is north: Sunny Lane is on top).
    const lane = v ? (-v.z * 1000 > MAP_MID_Y ? 'Sunny Lane' : 'Puddle Lane') : undefined;
    const what = v?.kind === 'core' ? 'core' : 'tower';
    this.juice.banner({ title: good ? `Enemy ${what} down!` : `We lost a ${what}`, sub: what === 'core' ? undefined : lane, tone: good ? 'good' : 'bad' });
    sfx.play('boom');
    sfx.play('roar', { vol: good ? 1 : 0.6 });
    this.juice.kick(what === 'core' ? 0.7 : 0.45);
    if (what === 'core') this.juice.slowmo(1200, 0.25);
    if (!v) return;
    if (what === 'core') this.hooks.onCoreDown?.(v);
    for (let i = 0; i < 3; i++) this.shock.start(this.at(v, 0), { r1: 4 + i * 2.5, dur: 0.4 + i * 0.15, color: i === 0 ? '#FFD34D' : '#FFE0C8', height: 0.6 });
    this.particles.burst(this.at(v, 2.5), { n: 40, shape: SHAPE.SHARD, color: 0xc9b8a8, tint: 0.2, size: [0.15, 0.35], life: [0.8, 1.3], speed: [4, 9], up: 5, gravity: 14, spin: 10, floor: true, fade: FADE.HOLD });
    this.particles.burst(this.at(v, 2.5), { additive: true, n: 30, shape: SHAPE.STAR5, color: TEAM[v.team === 1 ? 1 : 0].main, intensity: 2, size: [0.25, 0.45], life: [0.6, 1], speed: [3, 7], up: 4, gravity: 6 });
    this.particles.burst(this.at(v, 1.5), { n: 30, shape: SHAPE.PUFF, color: 0xf2ddbb, alpha: 0.85, size: [0.8, 1.4], sizeEnd: 2.2, life: [0.9, 1.4], speed: [1.5, 4], up: 1, drag: 1.5 });
  }

  private pudding(e: Extract<SimEvent, { type: 'pudding' }>): void {
    switch (e.what) {
      case 'spawn':
        sfx.play('horn', { rate: 1.3 });
        this.juice.banner({ title: 'Pudding is here!', sub: 'Calm him in the river to win his courage.', tone: 'gold' });
        break;
      case 'hop':
        sfx.play('slam', { rate: 0.7 });
        break;
      case 'calmed': {
        const ours = e.team === this.hooks.myTeam;
        this.juice.banner({ title: ours ? 'We calmed Pudding!' : 'They calmed Pudding', sub: ours ? 'He walks with our next wave.' : 'He walks with their next wave.', tone: ours ? 'good' : 'bad' });
        break;
      }
      default:
        break;
    }
  }

  /** Victory confetti over a point. */
  confetti(x: number, z: number): void {
    for (let i = 0; i < 6; i++) {
      _p.set(x + (Math.random() - 0.5) * 4, 4, z + (Math.random() - 0.5) * 4);
      this.particles.burst(_p, { n: 18, shape: SHAPE.CONFETTI, color: Number('0x' + CONFETTI_COLORS[i % CONFETTI_COLORS.length].slice(1)), size: [0.18, 0.26], life: [1.6, 2.4], speed: [2, 5], up: 4, gravity: 4, drag: 1.2, spin: 8 });
    }
  }

  render(dt: number): void {
    this.time += dt;
    this.numbers.render(dt);
  }

  dispose(): void {
    this.numbers.dispose();
  }
}

function heroAccent(h: HeroId): number {
  switch (h) {
    case 'clem':
      return 0xffd34d;
    case 'sage':
      return 0x9be3c4;
    case 'brutus':
      return 0xff9f5a;
    default:
      return 0xb07cff;
  }
}

function ultName(h: HeroId): string {
  switch (h) {
    case 'clem':
      return 'Golden Hour!';
    case 'sage':
      return 'Moonshot!';
    case 'brutus':
      return 'Champion’s Challenge!';
    default:
      return 'Pack Hunt!';
  }
}

export const HERO_NAME = (h: HeroId): string => HEROES[h].name;
