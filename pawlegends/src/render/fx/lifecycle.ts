/**
 * Match lifecycle feel (render, UI and audio only; the sim is never touched). Everything here is driven by snapshot
 * state (the render tick, hero `state` and `respawnIn`, entity ids), so a replay looks the same as the live match:
 *
 * - Start gate: a pet-gate fence with a paw forcefield at each base exit while the sim's barrier holds (padlock signs
 *   with the seconds over it, a countdown pill), then a dissolve, confetti, a horn and a cheer on the tick it drops.
 * - Death: a little ghost cat (or dog) with a halo floats up from the body; for the player a soft veil, the nine-lives
 *   pips and a tick for each of the last three seconds (the HUD's respawn card shows the count and flips up on return).
 * - Respawn: a pulsing paw pad at the hero's fountain spawn for the last second, then a light column, a card-glint ring
 *   (the worn card's colour), paw prints, a spawn shimmer and a chime as the hero drops in; for the player a long
 *   knockout (4 s+) closes a paw iris (under the HUD) to hide the camera cut to the fountain a moment early, and a
 *   short one pans the camera there instead, so the whole drop plays on screen either way.
 * - Nap (recall), LoL pass (lane C): a blue-gold rune circle that fills clockwise with the channel and three rising
 *   light motes while napping (no motes on Low), then a short flash and light column where the hero left, and a pillow
 *   pop with feathers where it lands.
 * - Minion waves: a puff where each new minion appears and a soft march horn near the camera.
 * - Match end: confetti (won) or soft grey puffs (lost), and a paw wipe into the results.
 *
 * Budgets: one sprite draw (LifeSprites), one decal draw (pads and nap rings), two gate draws (gone once open). Bursts
 * go through the shared Particles / Shockwaves / MeshFx pools, scaled down on Low and under reduce motion.
 */
import * as THREE from 'three';
import { HERO_SPAWNS, mirrorX } from '../../data/map';
import { TICK_HZ, TIMELINE } from '../../data/timeline';
import { HERO_RULES } from '../../data/xp';
import { sfx } from '../../audio/sfx';
import { SHAPE, FADE } from './Particles.js';
import { dressTeam, RELATION } from '../palette';
import { boldRingTexture, DecalLayer } from '../views/decals';
import { NapRunes } from './napRune';
import { toX, toZ } from '../coords';
import type { ViewEntity, ViewFrame } from '../interp';
import type { GameView } from '../gameView';
import { GATE_X, gateState, StartGate } from './lifecycleGate';
import { digitGlyph, GLYPH, LifeSprites } from './lifecycleSprites';
import { LifeHud } from './lifecycleHud';
import { heroBodyScale, heroTop, heroY } from '../chars/visualSize';
import { HEROES } from '../../data/heroes';
import { glintColor } from '../skins/tierFx';
import type { Element } from '../../meta/roster';

/** Replay-safe cosmetic hash in [0, 1) (the fun kit's funRand, inlined so this chunk does not pull the kit in). */
function funHash(tick: number, src: number, salt: number): number {
  let h = (Math.imul(tick | 0, 0x9e3779b1) ^ Math.imul((src | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((salt | 0) + 0x165667b1, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Respawn timing (ticks of `respawnIn`): the pad pulses from PAD, the player's iris closes CLOSE..SHUT, opens SHUT..OPEN. */
export const RESPAWN_TICKS = Object.freeze({ pad: 36, close: 54, shut: 42, open: 30, count: 3 * TICK_HZ });
/** Seconds after the player's respawn during which coaching tips hold (P2-12: no "Press Q" alone in the fountain). */
export const TIPS_HOLD_AFTER_RESPAWN = 2.5;
/** LoL pass (lane C): nap motes live this long (s); at most this many over all napping heroes. */
const NAP_MOTE_LIFE = 0.8;
const NAP_MOTES = 12;
/** A nap that ends this far (m) from where the hero slept was a recall to the fountain. */
const NAP_JUMP_M = 8;
const MAX_ID = 128;

/** A hero's fountain spawn point (m, three.js X/Z): the sim's HERO_SPAWNS by slot, mirrored for team 1. */
export function spawnPoint(id: number, team: number, out: { x: number; z: number }): { x: number; z: number } {
  const s = HERO_SPAWNS[((id % HERO_SPAWNS.length) + HERO_SPAWNS.length) % HERO_SPAWNS.length];
  out.x = toX(team === 1 ? mirrorX(s.x) : s.x);
  out.z = toZ(s.y);
  return out;
}

/**
 * A knockout shorter than this (ticks of `respawnIn` at the knockout) gets no iris: the camera pans to the fountain
 * instead, so the ghost and the lives row stay on screen for the whole short wait (feel QA: at level 1 the iris used
 * up most of a 3 s death).
 */
export const IRIS_MIN_DEATH = 4 * TICK_HZ;
/** Ticks before respawn when a short death's camera pan to the fountain starts (it lands before the hero does). */
export const PAN_AT = 20;

/** The player's iris at `respawnIn` ticks of a `total`-tick knockout: 0 open .. 1 shut (0 throughout a short one). */
export function irisAt(respawnIn: number, total = Infinity): number {
  const T = RESPAWN_TICKS;
  if (total < IRIS_MIN_DEATH) return 0;
  if (respawnIn > T.close || respawnIn <= T.open) return 0;
  if (respawnIn > T.shut) return (T.close - respawnIn) / (T.close - T.shut);
  return (respawnIn - T.open) / (T.shut - T.open);
}

/** Seconds ticked in the last three seconds of a death (3, 2, 1), or 0 before them. */
export function backCount(respawnIn: number): number {
  if (respawnIn <= 0 || respawnIn > RESPAWN_TICKS.count) return 0;
  return Math.ceil(respawnIn / TICK_HZ);
}

/** Nap channel progress 0..1 from the tick the nap started. */
export function napProgress(startTick: number, tick: number): number {
  return Math.max(0, Math.min(1, (tick - startTick) / HERO_RULES.napChannel));
}

/** Blend two 0xRRGGBB colours (no closure: it runs per frame for the gate and per napping hero). */
const mixCh = (a: number, b: number, k: number, s: number): number => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
const mix = (a: number, b: number, k: number): number => (mixCh(a, b, k, 16) << 16) | (mixCh(a, b, k, 8) << 8) | mixCh(a, b, k, 0);
/** The enemy's gate colour (a gold wash keeps both warm and friendly). */
const THEIRS = mix(RELATION.enemy, 0xffffff, 0.15);
/** Ticks the "3, 2, 1, Ready!" count's last step stays up after the sim starts (app/matchSession.ts countdown, 600 ms). */
const READY_TICKS = 20;
/** Other heroes' death ghosts show only this close (m) to the camera focus, and fainter, so a team fight stays readable. */
const GHOST_NEAR = 13;

interface Track {
  seen: boolean;
  dead: boolean;
  state: string;
  x: number;
  z: number;
  team: number;
  napStart: number;
  napZ: number;
  /** Seconds until the next nap mote. */
  napMote: number;
  shield: number;
  sx: number;
  sz: number;
  /** `respawnIn` (ticks) at the knockout: the whole wait, which picks iris or pan. */
  total: number;
}

export class Lifecycle {
  readonly sprites = new LifeSprites();
  readonly gate = new StartGate();
  readonly hud: LifeHud;
  private readonly decals: DecalLayer;
  /** LoL pass (lane C): the nap rune circles (one pooled ring per hero slot). */
  readonly napRunes = new NapRunes();
  /** Birth times (s) of the live nap motes (at most NAP_MOTES at once, all heroes together). */
  private readonly motes: number[] = [];
  private readonly tr: Track[] = Array.from({ length: 16 }, () => ({ seen: false, dead: false, state: '', x: 0, z: 0, team: 0, napStart: -1, napZ: 0, napMote: 0, shield: 0, sx: 0, sz: 0, total: 0 }));
  private readonly minionSeen = new Uint32Array(MAX_ID);
  private stamp = 1;
  private first = true;
  private time = 0;
  private dt = 0;
  private lastTick = -1;
  private gateSecs = -1;
  private gateBurst = false;
  private gateTag = '';
  private myDeaths = 0;
  private camMoved = false;
  private backShown = 0;
  private respawnedAt = -99;
  private meTotal = 0;
  private primed = 0;
  private readonly gs = { up: true, open: 0, secs: 0 };
  private readonly v = new THREE.Vector3();
  private readonly sp = { x: 0, z: 0 };
  /** Pending end-of-match bursts (seconds from now). */
  private endBursts: { at: number; won: boolean }[] = [];
  /** Telemetry (e2e): how many lifecycle moments played. */
  readonly counts = { gateOpen: 0, respawn: 0, death: 0, napOut: 0, wave: 0 };

  constructor(
    private readonly view: GameView,
    uiRoot: HTMLElement | null,
  ) {
    this.hud = new LifeHud(uiRoot);
    this.decals = new DecalLayer(boldRingTexture(), 14, { additive: true, y: 0.08, renderOrder: 2, name: 'lifecycle-decals' });
    view.scene.add(this.gate.group, this.sprites.mesh, this.decals.mesh, this.napRunes.group);
    // the fence replaces the map's flat ground strip (which also ran under the core)
    view.map.gateStrip = false;
    this.prime();
  }

  /**
   * Draw one invisible particle in each particle pool and one tiny shockwave far under the ground during the loading
   * frames, so their shaders compile there and not on the gate-open tick (measured: a ~1 s hitch on SwiftShader when
   * the gate burst was the match's first particle).
   */
  private prime(): void {
    this.v.set(0, -60, 0);
    this.view.particles.single(this.v, { additive: true, alpha: 0, size0: 0.01, life: 0.4 });
    this.view.particles.single(this.v, { additive: false, alpha: 0, size0: 0.01, life: 0.4 });
    this.view.shock.start(this.v, { r1: 0.2, dur: 0.3, height: 0.05 });
  }

  /** Coaching tips hold for a moment after the player respawns. */
  get holdTips(): boolean {
    return this.time - this.respawnedAt < TIPS_HOLD_AFTER_RESPAWN;
  }

  private get reduced(): boolean {
    return this.view.vfx.reduced;
  }

  /** Burst count under reduce motion (Particles scales every burst by the quality tier itself). */
  private n(base: number): number {
    return Math.max(1, Math.round(base * (this.reduced ? 0.6 : 1)));
  }

  update(frame: ViewFrame | null, dt: number): void {
    this.time += dt;
    this.dt = dt;
    this.sprites.begin();
    this.decals.begin();
    const tick = frame ? frame.tick : null;
    // the sprite shader compiles in the loading frames even when this chunk arrived after the gate (readability QA)
    if (this.primed < 2) {
      this.primed++;
      this.sprites.put(0, -60, 0, 0.01, GLYPH.paw, 0xffffff, 0.02);
    }
    this.updateGate(tick, frame ? frame.latest.clock.phase === 'gate' : true);
    if (frame) {
      this.napRunes.begin();
      this.updateHeroes(frame);
      this.napRunes.end();
      this.updateMinions(frame);
      this.lastTick = frame.tick;
      this.first = false;
    }
    this.updateEnd(dt);
    this.decals.end();
    this.sprites.update(dt);
  }

  // ------------------------------------------------------------------------------------------------ start gate

  private updateGate(tick: number | null, gatePhase: boolean): void {
    const s = gateState(tick, this.gs);
    // the player's own exit in the ally colour, the enemy's in theirs (a gold wash keeps both warm and friendly)
    const mine = 0xffc93d;
    const my = this.view.myTeam;
    this.gate.setColors(my === 0 ? mine : THEIRS, my === 0 ? THEIRS : mine);
    this.gate.update(s, this.time, this.reduced);
    // the exact tick the barrier drops (a late join or a replay seek past it shows no burst)
    if (tick !== null && !this.gateBurst && tick >= TIMELINE.barrierDrop) {
      this.gateBurst = true;
      if (this.lastTick >= 0 && this.lastTick < TIMELINE.barrierDrop && tick - TIMELINE.barrierDrop < 15) this.gateOpened();
    }
    // padlock signs over each gate, with the seconds left
    if (s.up && s.open < 0.25) {
      const a = 1 - s.open / 0.25;
      const bob = this.reduced ? 0 : Math.sin(this.time * 3) * 0.12;
      const d = digitGlyph(s.secs);
      for (const g of this.gate.signs) {
        const col = g.side === my ? 0xffd34d : 0xd8e2ff;
        this.sprites.put(g.x, 2.75 + bob, g.sz + 0.35, 1.35, GLYPH.lock, col, a);
        if (d >= 0) this.sprites.put(g.x + 1.05, 2.6 + bob, g.sz + 0.35, 1.15, d, 0xffffff, a);
      }
    }
    // the countdown pill once "Ready!" has gone (the pre-match "3, 2, 1, Ready!" has its own text: feel QA saw three
    // countdowns at once on a phone)
    const left = tick === null ? TIMELINE.barrierDrop : TIMELINE.barrierDrop - tick;
    // hidden as soon as the newest snapshot leaves the gate phase ("Go!" shows then)
    const show = tick !== null && tick > READY_TICKS && left > 0 && gatePhase;
    const secs = show ? s.secs : 0;
    this.hud.gate(secs, left / TIMELINE.barrierDrop);
    if (secs !== this.gateSecs) {
      if (secs > 0 && this.gateSecs > secs) sfx.play('blip', { vol: 0.55, rate: secs === 1 ? 1.5 : 1.15 });
      this.gateSecs = secs;
    }
    const g = s.up ? (s.open > 0 ? 'opening' : 'up') : 'open';
    if (g !== this.gateTag && typeof document !== 'undefined') document.documentElement.dataset.gate = this.gateTag = g;
  }

  private gateOpened(): void {
    this.counts.gateOpen++;
    sfx.play('horn', { vol: 0.75 });
    sfx.play('cheer', { vol: 0.45 });
    this.view.juice.kick(0.18);
    const p = this.view.particles;
    const fx = this.view.gr.focus.x;
    for (const g of this.gate.signs) {
      // only the gates near the camera burst (the far base's are off screen: no particles, rings or overdraw there)
      if (Math.abs(g.x - fx) > 32) continue;
      const mine = g.side === this.view.myTeam;
      const col = mine ? 0xffd34d : 0xd8e2ff;
      const steps = Math.max(2, Math.round(g.len / 2));
      for (let i = 0; i < steps; i++) {
        const z = g.z - g.len / 2 + (g.len * (i + 0.5)) / steps;
        this.v.set(g.x, 0.8, z);
        p.burst(this.v, { n: this.n(mine ? 6 : 3), shape: SHAPE.CONFETTI, color: i % 2 ? col : 0xff9ec0, size: [0.16, 0.26], life: [0.9, 1.4], speed: [2, 4.5], up: 4.5, gravity: 7, drag: 1.2, spin: 8 });
        p.burst(this.v, { additive: true, n: this.n(3), shape: SHAPE.STAR5, color: col, intensity: 1.8, size: [0.2, 0.34], life: [0.5, 0.8], speed: [1.5, 3.5], up: 2.5, drag: 2 });
      }
      this.v.set(g.x, 0.15, g.z);
      this.view.shock.start(this.v, { r1: g.len * 0.55, dur: 0.45, color: mine ? '#FFE9A8' : '#E3E9FF', height: 0.4, dust: false });
      // paw prints scatter up from the gate line
      for (let i = 0; i < (this.reduced ? 1 : 3); i++) {
        this.sprites.spawn({ x: g.x, y: 1.2, z: g.z - g.len * 0.35 + g.len * 0.35 * i, glyph: GLYPH.paw, color: col, size0: 0.7, size1: 0.9, life: 1.1, vy: 2.2, vz: 0, rot: (i - 1) * 0.4, spin: (i - 1) * 1.5, curve: 1 });
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ heroes

  private updateHeroes(frame: ViewFrame): void {
    const me = this.view.mySlot;
    let meDead = false;
    let meRespawnIn = 0;
    let meTeam: number = this.view.myTeam;
    for (const e of frame.entities) {
      if (e.kind !== 'hero' || e.id < 0 || e.id >= this.tr.length) continue;
      const t = this.tr[e.id];
      const x = toX(e.fx);
      const z = toZ(e.fy);
      const dead = e.state === 'dead';
      if (!t.seen) {
        // first sight (match start, a mid-match join): no edge effects
        t.seen = true;
        t.dead = dead;
        t.state = e.state;
        t.x = x;
        t.z = z;
        t.team = e.team;
        t.total = dead ? (e.respawnIn ?? 0) : 0;
        continue;
      }
      if (dead && !t.dead) this.died(e, t);
      if (!dead && t.dead) this.respawned(e, x, z, t);
      if (dead) {
        const r = e.respawnIn ?? 0;
        if (r > 0 && r <= RESPAWN_TICKS.pad) this.pad(e, r);
        if (e.id === me) {
          meDead = true;
          meRespawnIn = r;
          meTeam = e.team;
          this.meTotal = t.total;
        }
      }
      // nap: the channel ring and Zzz, then a poof here and a pillow pop where the hero lands
      if (e.state === 'napping') {
        if (t.state !== 'napping') {
          t.napStart = frame.tick;
          t.napZ = 0;
          t.napMote = 0;
        }
        this.napping(e, x, z, t, frame.tick);
      } else if (t.state === 'napping' && !dead && Math.hypot(x - t.x, z - t.z) > NAP_JUMP_M) this.napArrived(e, t.x, t.z, x, z);
      // the spawn shimmer orbits the hero for a moment
      if (t.shield > 0 && !dead) this.shimmer(e, x, z, t);
      t.dead = dead;
      t.state = e.state;
      t.x = x;
      t.z = z;
      t.team = e.team;
    }
    this.playerDead(meDead, meRespawnIn, meTeam);
  }

  private died(e: ViewEntity, t: Track): void {
    this.counts.death++;
    const mine = e.id === this.view.mySlot;
    if (mine) this.myDeaths++;
    t.total = e.respawnIn ?? 0;
    // another hero's ghost only near the camera, smaller and fainter: in a team fight the sprites draw over bodies and
    // telegraphs (no depth test), so they must never bury the fight (readability QA)
    if (!mine && Math.hypot(t.x - this.view.gr.focus.x, t.z - this.view.gr.focus.z) > GHOST_NEAR) return;
    const dog = dressTeam(e.team) === 1;
    const tint = mix(0xffffff, e.team === this.view.myTeam ? RELATION.ally : RELATION.enemy, 0.22);
    const s = mine ? 1.15 : 0.7;
    const alpha = mine ? 0.92 : 0.5;
    // the soul waits for the faint, then floats up swaying (no gore: a smiling ghost with a halo)
    const o = { x: t.x, z: t.z, delay: 0.55, life: mine ? 2.6 : 1.8, vy: 0.85, sway: 0.22, swayHz: 0.7, curve: 2 as const };
    const gy = heroY(e.hero, 1.3);
    this.sprites.spawn({ ...o, y: gy, glyph: dog ? GLYPH.ghostDog : GLYPH.ghostCat, color: tint, size0: 0.85 * s, size1: 1.05 * s, alpha });
    this.sprites.spawn({ ...o, y: gy + 0.62 * s, glyph: GLYPH.halo, color: 0xffd34d, size0: 0.62 * s, size1: 0.7 * s, alpha: mine ? 0.95 : 0.55 });
    if (!this.reduced && mine) {
      this.v.set(t.x, heroY(e.hero, 1.2), t.z);
      this.view.particles.burst(this.v, { additive: true, n: this.n(6), shape: SHAPE.STAR4, color: 0xfff1c4, intensity: 1.4, size: [0.12, 0.22], life: [0.6, 1], speed: [0.4, 1.2], up: 1.4, drag: 1.5 });
    }
  }

  private pad(e: ViewEntity, r: number): void {
    const p = spawnPoint(e.id, e.team, this.sp);
    const ally = e.team === this.view.myTeam;
    const col = e.id === this.view.mySlot ? RELATION.self : ally ? RELATION.ally : RELATION.enemy;
    const k = 1 - r / RESPAWN_TICKS.pad;
    // two rings converge on the spot ("something lands here"), brighter as it nears
    for (let i = 0; i < 2; i++) {
      const f = this.reduced ? 0.5 : (this.time * 1.4 + i * 0.5) % 1;
      this.decals.add(p.x, p.z, 3.4 - 2.2 * f, col, (0.25 + 0.6 * k) * Math.min(1, f * 3));
    }
    this.decals.add(p.x, p.z, 1.3, col, 0.35 + 0.4 * k);
    const bob = this.reduced ? 0 : Math.sin(this.time * 5) * 0.1;
    this.sprites.put(p.x, 0.7 + bob, p.z, 0.75 + 0.25 * k, GLYPH.paw, col, 0.5 + 0.5 * k);
  }

  private respawned(e: ViewEntity, x: number, z: number, t: Track): void {
    this.counts.respawn++;
    const mine = e.id === this.view.mySlot;
    const ally = e.team === this.view.myTeam;
    const card = this.view.heroes.cardOf(e.id);
    const team = mine ? RELATION.self : ally ? RELATION.ally : RELATION.enemy;
    // the worn card skin's colour leads the glints, else the hero's card element (every champion is a Token Tails card)
    const el = e.hero ? (HEROES[e.hero]?.element as Element | undefined) : undefined;
    const glint = card ? card.tint : el ? glintColor(el, mine) : mix(team, 0xffffff, 0.35);
    const bs = heroBodyScale(e.hero);
    const fx = this.view.meshFx;
    fx.spawn('pillar', { x, z, sx: (mine ? 1.05 : 0.85) * bs, sy: 8, life: 0.8, color: mix(glint, 0xffffff, 0.3), rim: 0xffffff, rel: 'ally', p3: 1 });
    fx.spawn('ring', { x, z, sx: (mine ? 2.8 : 2.2) * bs, life: 0.6, color: glint, rim: 0xffffff, rel: 'ally', p1: 0.15, delay: 0.3 });
    fx.spawn('dome', { x, z, sx: 1.2 * bs, sy: heroY(e.hero, 1.5), life: 1.0, color: mix(glint, 0xffffff, 0.5), rim: team, rel: 'ally', delay: 0.33 });
    const p = this.view.particles;
    this.v.set(x, 0.5, z);
    p.burst(this.v, { additive: true, n: this.n(mine ? 14 : 8), shape: SHAPE.STAR4, color: glint, intensity: 2, size: [0.2, 0.36], life: [0.5, 0.85], speed: [3, 5.5], flat: true, up: 0.6, drag: 3, fade: FADE.TWINKLE });
    if (mine) p.burst(this.v, { n: this.n(16), shape: SHAPE.CONFETTI, color: glint, size: [0.14, 0.24], life: [0.9, 1.3], speed: [2, 4], up: 5, gravity: 8, drag: 1, spin: 9 });
    // paw prints hop up around the hero (cats) or bones (dogs)
    const dog = dressTeam(e.team) === 1;
    const k = this.reduced ? 1 : mine ? 3 : 2;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + 0.6;
      this.sprites.spawn({ x: x + Math.cos(a) * 0.9 * bs, y: heroY(e.hero, 0.9), z: z + Math.sin(a) * 0.9 * bs, glyph: dog ? GLYPH.bone : GLYPH.paw, color: glint, size0: 0.5, size1: 0.65, life: 0.9, vy: 2, delay: 0.32 + i * 0.06, rot: (i - 1) * 0.5, spin: (i - 1) * 2, curve: 1 });
    }
    const at = mine ? undefined : { x, z };
    sfx.play('shieldChime', { vol: mine ? 0.6 : 0.4, ...(at ? { at } : {}) });
    sfx.play('magic', { vol: mine ? 0.4 : 0.25, rate: 1.35, ...(at ? { at } : {}) });
    t.shield = 1.1;
    t.sx = x;
    t.sz = z;
    if (mine) {
      this.respawnedAt = this.time;
      this.view.juice.kick(0.1);
    }
  }

  private shimmer(e: ViewEntity, x: number, z: number, t: Track): void {
    const dt = this.dt;
    t.shield = Math.max(0, t.shield - dt);
    if (this.reduced || this.view.gr.settings.tier === 'low') return;
    const a = this.time * 9 + e.id;
    const r = 0.75 * heroBodyScale(e.hero);
    this.v.set(x + Math.cos(a) * r, heroY(e.hero, 0.4 + (1.1 - t.shield) * 1.2), z + Math.sin(a) * r);
    this.view.particles.single(this.v, { shape: SHAPE.STAR4, additive: true, color: 0xfff6da, intensity: 1.8, size0: 0.28, size1: 0.05, life: 0.3, vy: 0.6 });
  }

  private napping(e: ViewEntity, x: number, z: number, t: Track, tick: number): void {
    const k = napProgress(t.napStart, tick);
    // LoL pass (lane C): the rune circle fills clockwise with the channel (the HUD nap bar reads the same progress)
    this.napRunes.put(e.id, x, z, k, heroBodyScale(e.hero), this.time);
    // three rising light motes at a time per hero, at most NAP_MOTES over all heroes; none on Low or reduce motion
    if (this.reduced || this.view.gr.settings.tier === 'low') return;
    while (this.motes.length && this.time - this.motes[0] > NAP_MOTE_LIFE) this.motes.shift();
    t.napMote -= this.dt;
    if (t.napMote > 0 || this.motes.length >= NAP_MOTES) return;
    t.napMote = NAP_MOTE_LIFE / 3;
    this.motes.push(this.time);
    const a = funHash(tick | 0, e.id, 7) * Math.PI * 2;
    const r = 1.5 * heroBodyScale(e.hero);
    this.v.set(x + Math.cos(a) * r, 0.2, z + Math.sin(a) * r);
    this.view.particles.single(this.v, { shape: SHAPE.STAR4, additive: true, color: k > 0.5 ? 0xffe29a : 0x9cc0ff, intensity: 2, size0: 0.22, size1: 0.06, life: NAP_MOTE_LIFE, vy: 2.2 });
  }

  private napArrived(e: ViewEntity, x0: number, z0: number, x: number, z: number): void {
    this.counts.napOut++;
    const mine = e.id === this.view.mySlot;
    const p = this.view.particles;
    // where it left: LoL pass (lane C) a 200 ms flash and light column, and a poof
    this.v.set(x0, 0.8, z0);
    p.burst(this.v, { n: this.n(12), shape: SHAPE.PUFF, color: 0xf3ecff, alpha: 0.85, size: [0.5, 0.9], sizeEnd: 1.8, life: [0.5, 0.8], speed: [1.5, 3], up: 1, drag: 2 });
    const bs = heroBodyScale(e.hero);
    this.view.meshFx.spawn('pillar', { x: x0, z: z0, sx: 0.9 * bs, sy: 7, life: 0.2, color: 0xbfd4ff, rim: 0xffd36a, rel: 'ally', p3: 1 });
    this.v.set(x0, heroY(e.hero, 1.0), z0);
    p.single(this.v, { shape: SHAPE.STAR4, additive: true, color: 0xfff3c8, intensity: 2.4, size0: 2.6 * bs, size1: 0.4, life: 0.2 });
    // where it lands: a pillow pops and feathers fly
    this.sprites.spawn({ x, y: heroTop(e.hero) - 0.2, z, glyph: GLYPH.pillow, color: 0xfff1f7, size0: 1.9, size1: 1.5, life: 0.85, vy: 0.5, curve: 1 });
    this.v.set(x, heroY(e.hero, 1.8), z);
    p.burst(this.v, { n: this.n(mine ? 14 : 8), shape: SHAPE.FEATHER, color: 0xffffff, alpha: 0.95, size: [0.22, 0.34], life: [0.9, 1.4], speed: [1.5, 3.5], up: 2.2, gravity: 2.2, drag: 2.5, spin: 5 });
    const at = mine ? undefined : { x, z };
    sfx.play('poof', { vol: mine ? 0.6 : 0.35, ...(at ? { at } : {}) });
    sfx.play('squeak', { vol: mine ? 0.3 : 0.18, rate: 1.2, ...(at ? { at } : {}) });
  }

  /** The player's dead veil, lives row, last-seconds ticks, iris and the early camera move to the fountain. */
  private playerDead(dead: boolean, r: number, team: number): void {
    const dog = dressTeam(team) === 1;
    this.hud.dead(dead, this.myDeaths, dog);
    if (!dead) {
      this.hud.iris(0);
      this.camMoved = false;
      this.backShown = 0;
      return;
    }
    const n = backCount(r);
    if (n !== this.backShown) {
      if (n > 0) sfx.play('blip', { vol: 0.5, rate: n === 1 ? 1.5 : 1.15 });
      this.backShown = n;
    }
    // a short knockout: no iris, a quick pan to the fountain just before the drop; a long one: the iris hides the cut
    const iris = this.meTotal >= IRIS_MIN_DEATH;
    this.hud.iris(irisAt(r, this.meTotal), r <= RESPAWN_TICKS.shut);
    if (!this.camMoved && r > 0 && r <= (iris ? RESPAWN_TICKS.shut : PAN_AT)) {
      this.camMoved = true;
      const p = spawnPoint(this.view.mySlot, team, this.sp);
      // feel pass B1: the fixed framing puts the hero itself at the focus (no lead, no lift)
      const fx = p.x;
      const fz = p.z;
      this.view.lookAt(fx, fz, 6);
      // with the iris shut, cut the camera at once, so the respawn plays on screen from its first frame
      if (iris) {
        this.view.gr.focus.x = fx;
        this.view.gr.focus.z = fz;
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ minions

  private updateMinions(frame: ViewFrame): void {
    const st = ++this.stamp;
    let fresh = 0;
    let fx = 0;
    let fz = 0;
    const cx = this.view.gr.focus.x;
    const cz = this.view.gr.focus.z;
    for (const e of frame.entities) {
      if (e.kind !== 'minion' || e.id < 0 || e.id >= MAX_ID) continue;
      const was = this.minionSeen[e.id];
      this.minionSeen[e.id] = st;
      if (this.first || was === st - 1) continue;
      const x = toX(e.fx);
      const z = toZ(e.fy);
      if (Math.abs(x - cx) > 30 || Math.abs(z - cz) > 22) continue;
      fresh++;
      fx = x;
      fz = z;
      this.v.set(x, 0.4, z);
      this.view.particles.burst(this.v, { n: this.n(5), shape: SHAPE.PUFF, color: 0xfff4e0, alpha: 0.8, size: [0.3, 0.55], sizeEnd: 1.6, life: [0.35, 0.55], speed: [1, 2.2], up: 0.6, drag: 2.5 });
    }
    if (fresh >= 2) {
      this.counts.wave++;
      sfx.play('horn', { vol: 0.22, rate: 1.6, at: { x: fx, z: fz } });
    }
  }

  // ------------------------------------------------------------------------------------------------ match end

  /** The match ended: confetti or soft puffs over the field, and the paw wipe `wipeInMs` from now. */
  matchEnd(won: boolean, wipeInMs: number): void {
    this.endBursts = this.reduced ? [{ at: 0.1, won }] : [0.1, 0.5, 0.9, 1.3].map((at) => ({ at, won }));
    this.hud.endWipe(won, wipeInMs);
  }

  private updateEnd(dt: number): void {
    if (!this.endBursts.length) return;
    for (const b of this.endBursts) b.at -= dt;
    const fx = this.view.gr.focus.x;
    const fz = this.view.gr.focus.z;
    while (this.endBursts.length && this.endBursts[0].at <= 0) {
      const b = this.endBursts.shift()!;
      // replay-safe cosmetic spread (the fun kit's rule: a replay draws the same confetti)
      const i = this.endBursts.length;
      const ox = (funHash(this.lastTick, i, 1) - 0.5) * 14;
      this.v.set(fx + ox, b.won ? 7 : 2, fz + (funHash(this.lastTick, i, 2) - 0.5) * 6);
      if (b.won) {
        this.view.particles.burst(this.v, { n: this.n(26), shape: SHAPE.CONFETTI, color: [0xffd34d, 0xff9ec0, 0x8fd0ff, 0x7dff8a][Math.floor(funHash(this.lastTick, i, 3) * 4)], size: [0.2, 0.32], life: [1.4, 2], speed: [2, 5], up: 2, gravity: 5, drag: 1.2, spin: 9 });
        this.sprites.spawn({ x: fx + ox * 0.5, y: 3, z: fz, glyph: funHash(this.lastTick, i, 4) < 0.5 ? GLYPH.star : GLYPH.heart, color: 0xffd34d, size0: 0.9, size1: 1.2, life: 1.2, vy: 1.6, curve: 1 });
      } else {
        this.view.particles.burst(this.v, { n: this.n(10), shape: SHAPE.PUFF, color: 0xb9b4c8, alpha: 0.6, size: [0.8, 1.3], sizeEnd: 2, life: [1, 1.5], speed: [0.5, 1.5], up: 0.6, drag: 1.5 });
      }
    }
  }

  dispose(): void {
    this.view.scene.remove(this.gate.group, this.sprites.mesh, this.decals.mesh, this.napRunes.group);
    this.napRunes.dispose();
    this.view.map.gateStrip = true;
    this.gate.dispose();
    this.sprites.dispose();
    this.decals.dispose();
    this.hud.dispose();
    if (typeof document !== 'undefined') delete document.documentElement.dataset.gate;
  }
}

/** Both gate lines (m), re-exported for tests. */
export { GATE_X };
