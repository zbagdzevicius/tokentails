/**
 * AnimDirector (ANIM-SPEC §2, §4): turns sim events and snapshot edges into authored clips on each hero's layer stack,
 * with every clip's markers pinned to the sim's anchors (render seconds on the render clock: hitstop included):
 *
 * - peeked events (SnapBuffer.peekEvents, ≈ 53 ms ahead): casts and windups start their clips with a coil, a basic
 *   melee hit re-pins the predicted contact;
 * - the BasicClock (basicClock.ts) starts basic swings at their sim start (D1); stub heroes get the legacy swing at
 *   the right moment, filled heroes their MoveSet basics (combo, basicPick);
 * - dashes drive progress segments from the travelled distance (a flip ends on the dash's last tick; a dash stopped
 *   early snaps to the landing); zones drive the arm progress;
 * - fired events (Effects hooks): reactions (directional flinch, knock tumble), local hit-stop (§6), deaths, the
 *   SkillFxSet callbacks, and the stub fallbacks (legacy cast);
 * - clip cues: trails, ghosts, dust, whooshes, own shake / punch, smears, mouth.
 *
 * Render only: reads snapshots and events, never the sim. Per-frame work reuses preallocated state.
 */
import * as THREE from 'three';
import { HEROES } from '../../data/heroes';
import type { HeroId } from '../../data/heroes/types';
import { PROJECTILE_KIND } from '../../data/towers';
import { BuffFlag, type CastSlot, type SimEvent } from '../../sim/api';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import type { Character } from '../chars';
import { BONE_INDEX } from '../chars/skeleton';
import { SHAPE, type Particles } from '../fx/Particles.js';
import { BasicClock, ClockOut } from './basicClock';
import { COMMON } from './common';
import { CueSfx, FxRuntime, WEAPON_TIP, type HeroLookup } from './fxctx';
import { movesFor, skillFxFor, loadHeroAnim } from './registry';
import type { Ribbons } from './trails';
import type { Ghosts } from './ghosts';
import type { FightCam } from './cam';
import { ANCHOR_INDEX as A, SLOTS, newAnchors, type AnchorTimes, type ClipDef, type CueKind, type MoveCtx, type MoveSet, type Slot } from './types';
import { DASH_SPEED, SIM_TIMING, TICK_HZ, TICK_S, abilNumbers, slotTimingFrom, travelTicks } from './timing';

/** What the director needs from the hero view for one hero. */
export interface DirectorRig {
  ch: Character;
  hero: HeroId;
  team: 0 | 1;
  visible: boolean;
  pos: THREE.Vector3;
  yaw: number;
}

export interface DirectorEnv {
  rig(id: number): DirectorRig | null;
  readonly mySlot: number;
  readonly myTeam: number;
  /** Pending events up to `horizon` ticks past the render clock (SnapBuffer.peekEvents), or null. */
  peek: ((horizonTicks: number, out: SimEvent[]) => SimEvent[]) | null;
  particles: Particles | null;
  ribbons: Ribbons | null;
  ghosts: Ghosts | null;
  cam: FightCam | null;
  fx: FxRuntime;
  sfx: CueSfx;
  /** Victim shake multiplier (the shake setting; 0 under reduce motion). */
  shakeScale(): number;
  reduced(): boolean;
  tier(): 'low' | 'med' | 'high';
  teamFight(): boolean;
}

/** Local hit-stop table (§6): attacker / victim freeze ms and victim shake (m). */
export const HITSTOP = Object.freeze({
  minion: { a: 20, v: 0, shake: 0 },
  basic: { a: 45, v: 60, shake: 0.03 },
  empowered: { a: 60, v: 70, shake: 0.03 },
  ability: { a: 70, v: 80, shake: 0.03 },
  heavy: { a: 100, v: 110, shake: 0.04 },
  kill: { a: 140, v: 0, shake: 0 },
  ult: { a: 90, v: 110, shake: 0.04 },
});

/** Freeze share for hits between other heroes while a team fight is on. */
export const HITSTOP_FIGHT = 0.6;

const SLOT_OF: readonly Slot[] = SLOTS;
/** Clip ids '<hero>.<slot>…' (clem.q3, sage.r): ability swings and ults (the team-fight caps). */
const ABILITY_CLIP = /\.[qwer](?![a-z])/;
const ULT_CLIP = /\.r(?![a-z])/;
const MAX_IDS = 16;
const PEEK_HORIZON = 2;
/** Basic bolts that confirm a ranged swing (hero bolt, Sage's Steady Paw pierce). */
const BASIC_BOLTS = new Set<number>([PROJECTILE_KIND.hero, PROJECTILE_KIND.pierce]);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

interface Dash {
  on: boolean;
  slot: number;
  x0: number;
  z0: number;
  dist: number;
  startTick: number;
  endTick: number;
  clip: string;
  done: boolean;
}

class HState {
  readonly anchors: AnchorTimes = newAnchors();
  readonly clock: BasicClock;
  readonly ctx: MoveCtx;
  /** Legacy (stub) swing waiting for its start (render s). */
  legacyAt = NaN;
  legacyContactIn = 0;
  swingClip = '';
  readonly recastN = new Int8Array(4);
  readonly recastUntil = new Float64Array(4);
  readonly dash: Dash = { on: false, slot: -1, x0: 0, z0: 0, dist: 0, startTick: 0, endTick: 0, clip: '', done: true };
  windSlot = -1;
  windTick = 0;
  windTicks = 0;
  /** Sustained state: hold clip waiting, its end. */
  holdClip: ClipDef | null = null;
  endClip: ClipDef | null = null;
  stateEnd = NaN;
  lastCastSlot = -1;
  lastCastTick = -99;
  lastHitAt = -99;
  hitFromX = 0;
  hitFromZ = 0;
  knockAt = -99;
  stunned = false;
  trail = -1;
  smearT = 0;
  mouthT = 0;
  prevX = NaN;
  prevZ = NaN;
  moves: MoveSet | null = null;
  wired = false;
  /** Standing still (render s), the next fidget's time and the idle clip on. */
  stillT = 0;
  fidgetAt = 0;
  idleOn = '';
  /** Match over: the victory loop is on (nothing else starts). */
  won = false;
  /** Buffs in the previous snapshot (status edges for the skill FX). */
  prevBuffs = 0;
  /** The state ends on this BuffFlag bit's falling edge (SlotMoves.endOnBuff), 0 = none; was it seen set yet? */
  endBuff = 0;
  endBuffSeen = false;

  constructor(
    readonly id: number,
    readonly hero: HeroId,
  ) {
    this.clock = new BasicClock(SIM_TIMING[hero].period);
    this.ctx = { hero, id, branch: false, talents: [], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false };
  }
}

export class AnimDirector {
  private readonly st: (HState | null)[] = new Array(MAX_IDS).fill(null);
  private readonly peekOut: SimEvent[] = [];
  private peekTick = -1;
  private lastLatest = -1;
  /** Projectile owner per pool index in the last seen snapshot (+1; 0 = none). */
  private readonly projOwner = new Int16Array(512);
  private readonly projSeen = new Int16Array(512);
  /** Zone arm / life per index for zone phases. */
  private readonly zoneArm = new Int16Array(64).fill(-1);
  private readonly zoneOwner = new Int16Array(64).fill(-1);
  private readonly recent = new Float64Array(64);
  private recentN = 0;
  now = 0;
  private latestTick = 0;
  private readonly loaded = new Set<HeroId>();
  readonly runtime: FxRuntime;
  readonly lookup: HeroLookup;
  private frame: ViewFrame | null = null;

  constructor(private readonly env: DirectorEnv) {
    this.runtime = env.fx;
    this.lookup = env.fx.lookup;
  }

  /** Start loading the move sets of `ids` (match load). */
  preload(ids: readonly HeroId[]): Promise<void> {
    for (const h of ids) this.loaded.add(h);
    return loadHeroAnim(ids);
  }

  private state(id: number, hero: HeroId): HState {
    let s = id >= 0 && id < MAX_IDS ? this.st[id] : null;
    if (!s || s.hero !== hero) {
      s = new HState(id, hero);
      if (id >= 0 && id < MAX_IDS) this.st[id] = s;
      if (!this.loaded.has(hero)) {
        this.loaded.add(hero);
        void loadHeroAnim([hero]);
      }
    }
    return s;
  }

  /** Hook the hero's stack (once per character instance) and keep its move set current. */
  private wire(s: HState, r: DirectorRig): void {
    const m = movesFor(s.hero);
    const stack = r.ch.anim.stack;
    if (!s.wired || s.moves !== m || stack.heroId !== s.id) {
      s.moves = m;
      s.wired = true;
      stack.heroId = s.id;
      stack.springsOn = true;
      stack.tune(m.springs);
      r.ch.anim.gaitProfile = m.gait;
      r.ch.anim.legacyFlinch = false;
      stack.onMarker = (id, clip, marker) => this.marker(id, clip, marker);
      stack.onCue = (id, clip, kind, arg) => this.cue(id, clip, kind, arg);
    }
    stack.reduced = this.env.reduced();
    stack.tier = this.env.tier();
  }

  private stub(s: HState): boolean {
    return !s.moves || s.moves.stub;
  }

  private fillCtx(s: HState, e: ViewEntity | undefined): MoveCtx {
    const c = s.ctx as { -readonly [K in keyof MoveCtx]: MoveCtx[K] };
    c.comboIndex = s.clock.combo;
    c.basicCount = s.clock.basicCount;
    if (e) {
      c.branch = e.branch === true;
      c.charged = e.charged === true;
      c.resource = e.resource ?? 0;
      c.buffs = e.buffs;
      c.stealthed = (e.buffs & BuffFlag.Stealth) !== 0;
    }
    return s.ctx;
  }

  // ------------------------------------------------------------------------------------------------ per frame

  /** Per frame, before the hero view updates (render clock = frame.tick). */
  update(frame: ViewFrame, dtReal: number): void {
    this.frame = frame;
    this.runtime.ents = frame.byId;
    this.runtime.projs = frame.projectiles;
    this.now = frame.tick * TICK_S;
    const latest = frame.latest;
    this.latestTick = latest.clock.tick;
    this.env.sfx.tick(dtReal);
    // 1) peeked events (casts, windups, melee hits), each once
    const peek = this.env.peek;
    const list = peek ? peek(PEEK_HORIZON, this.peekOut) : latest.events;
    let maxTick = this.peekTick;
    for (let i = 0; i < list.length; i++) {
      const ev = list[i];
      if (ev.tick <= this.peekTick) continue;
      if (ev.tick > maxTick) maxTick = ev.tick;
      if (ev.type === 'cast') this.castSeen(ev);
      else if (ev.type === 'windup') this.windupSeen(ev);
      else if (ev.type === 'hit' && ev.kind === 'basic') this.basicFired(ev.src, ev.tick);
    }
    this.peekTick = maxTick;
    if (peek) this.peekOut.length = 0;
    // 2) a new snapshot: attack edges, new bolts, zones
    const fresh = latest.clock.tick !== this.lastLatest;
    this.lastLatest = latest.clock.tick;
    if (fresh) {
      this.projectiles(frame);
      this.zones(frame);
    }
    // 3) per hero
    for (let i = 0; i < frame.entities.length; i++) {
      const e = frame.entities[i];
      if (e.kind !== 'hero' || !e.hero) continue;
      const r = this.env.rig(e.id);
      if (!r) continue;
      const s = this.state(e.id, e.hero);
      this.wire(s, r);
      if (fresh) this.edges(s, r, latest.entities, e);
      this.perHero(s, r, e, dtReal);
    }
    // 4) sustained skill FX
    for (const h of this.loaded) skillFxFor(h).update?.(dtReal, this.runtime);
  }

  private edges(s: HState, r: DirectorRig, latestEnts: readonly { id: number; state: string; buffs: number }[], e: ViewEntity): void {
    let le: { id: number; state: string; buffs: number } | null = null;
    for (let i = 0; i < latestEnts.length; i++)
      if (latestEnts[i].id === s.id) {
        le = latestEnts[i];
        break;
      }
    if (!le) return;
    const out = s.clock.frame(this.latestTick, le.state === 'attacking', le.state === 'dead');
    if (out === ClockOut.Start) this.startSwing(s, r, e, s.clock.start, s.clock.contact);
    else if (out === ClockOut.Feint) this.feint(s, r);
    // hard CC cuts the cast clip (the sim cancelled the cast)
    const stunned = (le.buffs & BuffFlag.Stunned) !== 0;
    if (stunned && !s.stunned) r.ch.anim.stack.cut(0.06);
    s.stunned = stunned;
    // status edges for the skill FX (the sim sends no stun / slow / charm event)
    const gained = le.buffs & ~s.prevBuffs;
    const lost = s.prevBuffs & ~le.buffs;
    s.prevBuffs = le.buffs;
    if (gained | lost) for (const h of this.loaded) {
      const fx = skillFxFor(h);
      if (!fx.stub && fx.onStatus) fx.onStatus(s.id, gained, lost, this.runtime);
    }
    // a state that lasts while a buff is up (Cacklejaw's Stealth) ends on its falling edge
    if (s.endBuff) {
      if (le.buffs & s.endBuff) s.endBuffSeen = true;
      else if (s.endBuffSeen) {
        s.stateEnd = this.now;
        s.endBuff = 0;
      }
    }
  }

  private perHero(s: HState, r: DirectorRig, e: ViewEntity, dt: number): void {
    const stack = r.ch.anim.stack;
    // legacy swing waiting for its start
    if (s.legacyAt === s.legacyAt && this.now >= s.legacyAt) {
      r.ch.anim.swing(s.legacyContactIn);
      s.legacyAt = NaN;
    }
    // gait variant from the buffs
    const b = e.buffs;
    stack.setGait(
      b & (BuffFlag.Zoomies | BuffFlag.Frenzy)
        ? 'gallop'
        : e.charmed
          ? 'charm'
          : b & BuffFlag.Feared
            ? 'cower'
            : b & BuffFlag.Slowed
              ? 'trudge'
              : b & BuffFlag.Hasted
                ? 'haste'
                : b & BuffFlag.Stealth && e.team === this.env.myTeam
                  ? 'sneak'
                  : 'run',
    );
    const x = toX(e.fx);
    const z = toZ(e.fy);
    this.idle(s, r, e, x, z, dt);
    // dash progress (progress-driven warp segments)
    const d = s.dash;
    if (d.on) {
      const startS = d.startTick * TICK_S;
      const endS = d.endTick * TICK_S;
      let prog = this.now <= startS ? 0 : Math.min(1, Math.hypot(x - d.x0, z - d.z0) / Math.max(0.05, d.dist));
      const sp = dt > 0 && s.prevX === s.prevX ? Math.hypot(x - s.prevX, z - s.prevZ) / dt : DASH_SPEED / 1000;
      // stopped early (a wall, a stun): snap to the landing, never later than predicted + 2 ticks
      if ((this.now > startS + 1.5 * TICK_S && sp < (DASH_SPEED / 1000) * 0.25) || this.now > endS + 2 * TICK_S) prog = 1;
      const pl = stack.playing(d.clip);
      if (pl) {
        pl.warp.progress = prog;
        if (prog >= 1 && !d.done) {
          pl.warp.retime(A.travelEnd, Math.min(this.now, endS + 2 * TICK_S));
          pl.warp.progress = NaN;
          d.done = true;
        }
      }
      if (prog >= 1 && (d.done || !pl)) d.on = false;
    }
    // knock / pull detection: a hero shoved fast right after a hit, not by its own dash
    if (s.prevX === s.prevX && dt > 0 && !d.on && this.now - s.lastHitAt < 0.25 && this.now - s.knockAt > 0.4) {
      const vx = (x - s.prevX) / dt;
      const vz = (z - s.prevZ) / dt;
      const sp = Math.hypot(vx, vz);
      if (sp > 6) {
        const toward = vx * s.hitFromX + vz * s.hitFromZ > 0;
        stack.react(toward ? 'knock' : 'pull', vx, vz);
        s.knockAt = this.now;
      }
    }
    s.prevX = x;
    s.prevZ = z;
    // sustained state: the hold clip once the cast clip is done, the end clip on stateEnd
    if (s.holdClip && !stack.current() && this.now < s.stateEnd) {
      this.anchorsReset(s);
      stack.play(s.holdClip, { anchors: s.anchors, loop: true });
      s.holdClip = null;
    }
    if (s.stateEnd === s.stateEnd && this.now >= s.stateEnd) {
      s.stateEnd = NaN;
      s.endBuff = 0;
      if (s.endClip) {
        this.anchorsReset(s);
        s.anchors[A.stateEnd] = this.now;
        s.anchors[A.contact] = this.now;
        stack.play(s.endClip, { anchors: s.anchors });
      }
      s.endClip = null;
      s.holdClip = null;
    }
    // smear / mouth restore
    const bones = r.ch.rig.bones;
    if (s.smearT > 0) {
      s.smearT -= dt;
      if (s.smearT <= 0) bones[BONE_INDEX.weapon].scale.set(1, 1, 1);
    }
    if (s.mouthT > 0) {
      s.mouthT -= dt;
      if (s.mouthT <= 0) bones[BONE_INDEX.mouth].scale.set(1, 1, 1);
    }
    // a trail on a hero that stopped being drawn ends
    if (!r.visible && s.trail >= 0) {
      this.env.ribbons?.end(s.trail);
      s.trail = -1;
    }
  }

  /**
   * The hero's own idle loop once it has stood still for 0.25 s with nothing else playing, a weighted fidget every
   * 6–10 s of standing, and the idle stopped as soon as it moves (a run never carries the idle's arms).
   */
  private idle(s: HState, r: DirectorRig, e: ViewEntity, x: number, z: number, dt: number): void {
    const m = s.moves;
    const stack = r.ch.anim.stack;
    if (!m || m.stub || s.won) return;
    const moved = s.prevX === s.prevX && dt > 0 ? Math.hypot(x - s.prevX, z - s.prevZ) / dt : 0;
    const busy = e.state === 'dead' || e.state === 'attacking' || e.state === 'casting' || s.stunned || s.dash.on || s.holdClip !== null || s.stateEnd === s.stateEnd;
    if (moved > 0.4 || busy) {
      s.stillT = 0;
      if (s.idleOn) {
        stack.stop(s.idleOn, 0.15);
        s.idleOn = '';
      }
      return;
    }
    s.stillT += dt;
    if (s.stillT < 0.25 || !r.visible) return;
    const cur = stack.current();
    if (s.fidgetAt === 0) s.fidgetAt = s.stillT + 6 + this.rand() * 4;
    if (m.fidgets.length > 0 && s.stillT >= s.fidgetAt && (!cur || cur.bin?.def.prio === 1)) {
      s.fidgetAt = s.stillT + 6 + this.rand() * 4;
      let total = 0;
      for (let i = 0; i < m.fidgets.length; i++) total += m.fidgets[i][1];
      let pick = this.rand() * total;
      let clip = m.fidgets[0][0];
      for (let i = 0; i < m.fidgets.length; i++) {
        pick -= m.fidgets[i][1];
        if (pick <= 0) {
          clip = m.fidgets[i][0];
          break;
        }
      }
      if (s.idleOn) stack.stop(s.idleOn, 0.15);
      s.idleOn = '';
      this.anchorsReset(s);
      stack.play(clip, { anchors: s.anchors });
      return;
    }
    if (cur || s.idleOn) {
      // the idle stopped itself (an additive one ends with its loop never): re-arm when nothing plays
      if (s.idleOn && !stack.playing(s.idleOn)) s.idleOn = '';
      return;
    }
    this.anchorsReset(s);
    if (stack.play(m.idle, { anchors: s.anchors, loop: true })) s.idleOn = m.idle.id;
  }

  private seed = 0x2f6b9a1;
  /** Render-only variety (fidget picks): a tiny LCG, so nothing allocates and replays look alike. */
  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Play one of the hero's own one-shot clips (level-up, emote) when it has a filled move set. */
  private oneShot(id: number, which: 'levelUp' | 'emote'): boolean {
    const r = this.env.rig(id);
    const s = id >= 0 && id < MAX_IDS ? this.st[id] : null;
    if (!r || !s || !r.visible || this.stub(s) || s.won) return false;
    const clip = s.moves?.[which];
    if (!clip) return false;
    if (s.idleOn) {
      r.ch.anim.stack.stop(s.idleOn, 0.1);
      s.idleOn = '';
    }
    this.anchorsReset(s);
    s.anchors[A.contact] = this.now;
    return r.ch.anim.stack.play(clip, { anchors: s.anchors });
  }

  /** A level-up fired (Effects hook): the hero's level-up flourish, unless it is busy with a higher clip. */
  levelFired(id: number): void {
    this.oneShot(id, 'levelUp');
  }

  /** The player's emote (render only). False for stub heroes (the caller plays the legacy pose). */
  emote(id: number): boolean {
    return this.oneShot(id, 'emote');
  }

  /** Match over: every living hero of the winning team loops its victory clip (the losers keep their idle). */
  victory(team: number): void {
    for (let i = 0; i < MAX_IDS; i++) {
      const s = this.st[i];
      const r = this.env.rig(i);
      if (!s || !r || r.team !== team || this.stub(s) || !s.moves) continue;
      const e = this.frame?.byId.get(i);
      if (e && e.state === 'dead') continue;
      r.ch.anim.stack.cut(0.1);
      if (s.idleOn) s.idleOn = '';
      this.anchorsReset(s);
      s.anchors[A.contact] = this.now;
      s.won = r.ch.anim.stack.play(s.moves.victory, { anchors: s.anchors, loop: true });
    }
  }

  private anchorsReset(s: HState): void {
    s.anchors.fill(NaN);
  }

  // ------------------------------------------------------------------------------------------------ basics

  private startSwing(s: HState, r: DirectorRig, e: ViewEntity | undefined, startTick: number, contactTick: number): void {
    const m = s.moves;
    const contactS = contactTick * TICK_S;
    if (!m || m.stub || m.basic.length === 0) {
      // legacy swing, started so its strike lands on the contact
      const strike = r.ch.anim.profile.attack === 'shoot' ? 0.3 : 0.27;
      s.legacyAt = contactS - strike;
      s.legacyContactIn = strike;
      if (s.legacyAt <= this.now) {
        r.ch.anim.swing(Math.max(0, contactS - this.now));
        s.legacyAt = NaN;
      }
      return;
    }
    const ctx = this.fillCtx(s, e);
    const clip = m.basicPick?.(ctx) ?? m.basic[s.clock.combo % m.basic.length];
    this.anchorsReset(s);
    s.anchors[A.swingStart] = startTick * TICK_S;
    s.anchors[A.contact] = contactS;
    s.anchors[A.release] = contactS;
    // post-contact speeds up with the attack speed (Golden Hour, Frenzy): authored period / measured period
    const post = Math.max(1, Math.min(1.8, SIM_TIMING[s.hero].period / Math.max(6, s.clock.P)));
    if (r.ch.anim.stack.play(clip, { anchors: s.anchors, post })) s.swingClip = clip.id;
  }

  private feint(s: HState, r: DirectorRig): void {
    if (s.swingClip) r.ch.anim.stack.stop(s.swingClip, 0.08);
    s.legacyAt = NaN;
    s.swingClip = '';
  }

  /** A basic contact at `tick` (a peeked or fired melee hit, a new bolt). */
  private basicContact(src: number, tick: number): void {
    if (src < 0 || src >= MAX_IDS) return;
    const s = this.st[src];
    if (!s) return;
    if (tick <= s.clock.lastContact) return;
    const r = this.env.rig(src);
    const out = s.clock.confirm(tick);
    if (!r) return;
    const pl = s.swingClip ? r.ch.anim.stack.playing(s.swingClip) : null;
    if (out === ClockOut.Confirmed && pl) {
      // re-pin the contact on the exact tick
      if (Math.abs(pl.warp.anchorTime(A.contact) - tick * TICK_S) > 1e-6) {
        s.anchors[A.contact] = s.anchors[A.release] = tick * TICK_S;
        pl.rebind(s.anchors, this.now);
      }
      return;
    }
    if (out === ClockOut.Confirmed && s.legacyAt === s.legacyAt) return;
    if (out === ClockOut.ImpactLed || !pl) {
      // never late: an impact-led swing from the contact pose
      const e = this.frame?.byId.get(src);
      this.startSwing(s, r, e, tick - s.clock.windup, tick);
    }
  }

  /** Effects hook: a basic hit fired at render time (melee contact; a ranged bolt's landing is ignored here). */
  basicFired(src: number, tick: number): void {
    const s = src >= 0 && src < MAX_IDS ? this.st[src] : null;
    if (!s) return;
    if (SIM_TIMING[s.hero].ranged) return;
    this.basicContact(src, tick);
  }

  // ------------------------------------------------------------------------------------------------ casts

  private seen(key: number): boolean {
    for (let i = 0; i < this.recentN; i++) if (this.recent[i] === key) return true;
    this.recent[this.recentN % this.recent.length] = key;
    this.recentN = Math.min(this.recent.length, this.recentN + 1);
    return false;
  }

  private windupSeen(e: Extract<SimEvent, { type: 'windup' }>): void {
    if (e.src < 0 || e.src >= MAX_IDS || e.slot > 3) return;
    const s = this.st[e.src];
    if (!s) return;
    s.windSlot = e.slot;
    s.windTick = e.tick;
    s.windTicks = e.ticks;
    if (this.stub(s)) return;
    const r = this.env.rig(e.src);
    if (!r) return;
    const clip = this.pickCast(s, e.slot as CastSlot, e.tick + e.ticks, false);
    if (!clip || !clip.warp.some((w) => w[1] === 'windupStart')) return;
    this.anchorsReset(s);
    s.anchors[A.windupStart] = e.tick * TICK_S;
    s.anchors[A.cast] = s.anchors[A.contact] = s.anchors[A.release] = (e.tick + e.ticks) * TICK_S;
    r.ch.anim.stack.play(clip, { anchors: s.anchors });
  }

  private pickCast(s: HState, slot: CastSlot, tick: number, commit: boolean): ClipDef | null {
    const m = s.moves;
    if (!m) return null;
    const sm = m.slots[SLOT_OF[slot]];
    const e = this.frame?.byId.get(s.id);
    const ctx = this.fillCtx(s, e);
    const a = abilNumbers(s.hero, SLOT_OF[slot], this.lookup.talentsOf(s.id), ctx.branch);
    const recasts = a.recasts ?? 0;
    let idx = -1;
    if (sm.recasts && recasts > 0 && tick <= s.recastUntil[slot] && s.recastN[slot] < recasts) idx = s.recastN[slot];
    (ctx as { recastIndex: number }).recastIndex = idx + 1;
    if (commit) {
      if (idx >= 0) s.recastN[slot]++;
      else {
        s.recastN[slot] = 0;
        s.recastUntil[slot] = tick + (a.recastWindow ?? a.resetWindow ?? 0);
      }
    }
    return sm.pick?.(ctx) ?? (idx >= 0 && sm.recasts ? sm.recasts[Math.min(idx, sm.recasts.length - 1)] : ctx.branch && sm.branch ? sm.branch : sm.cast);
  }

  private castSeen(e: Extract<SimEvent, { type: 'cast' }>): void {
    if (e.src < 0 || e.src >= MAX_IDS || e.slot > 3) return;
    const key = e.tick * 64 + e.src * 5 + e.slot;
    if (this.seen(key)) return;
    const s = this.st[e.src];
    if (!s) return;
    s.lastCastSlot = e.slot;
    s.lastCastTick = e.tick;
    if (this.stub(s)) return;
    const r = this.env.rig(e.src);
    if (!r) return;
    const slot = e.slot as CastSlot;
    const sn = SLOT_OF[slot];
    const ent = this.frame?.byId.get(e.src);
    const a = abilNumbers(s.hero, sn, this.lookup.talentsOf(e.src), ent?.branch === true);
    const T = slotTimingFrom(s.hero, sn, a);
    const windupClip = s.windSlot === slot && s.windTick + s.windTicks === e.tick;
    // the aim distance for picks that scale with a shorter dash (Lambo's Belly Flop); NaN for full-length dashes
    (s.ctx as { aimDist?: number }).aimDist = T.aimClamped ? Math.hypot(e.x / 1000 - r.pos.x, -e.y / 1000 - r.pos.z) : NaN;
    const clip = this.pickCast(s, slot, e.tick, true);
    (s.ctx as { aimDist?: number }).aimDist = NaN;
    if (!clip) return;
    const stack = r.ch.anim.stack;
    this.anchorsReset(s);
    const castS = e.tick * TICK_S;
    if (windupClip) s.anchors[A.windupStart] = s.windTick * TICK_S;
    s.anchors[A.cast] = castS;
    s.anchors[A.release] = castS;
    // instant casts resolve on the cast tick; touch dashes (Brutus E, Cacklejaw R) bind contact on their hit
    const touch = (s.hero === 'brutus' && sn === 'e') || (s.hero === 'cacklejaw' && sn === 'r');
    if (!touch) s.anchors[A.contact] = castS;
    const sx = r.pos.x;
    const sz = r.pos.z;
    const aimDist = Math.hypot(e.x / 1000 - sx, -e.y / 1000 - sz) * 1000;
    if (T.dashMm > 0) {
      // only an aim-clamped dash (Lambo's hop) stops at the aim point; the rest fly their full length (walls snap)
      const dist = T.aimClamped ? Math.min(aimDist > 1 ? aimDist : T.dashMm, T.dashMm) : T.dashMm;
      const ticks = travelTicks(dist, DASH_SPEED);
      s.anchors[A.travelEnd] = (e.tick + ticks) * TICK_S;
      const d = s.dash;
      d.on = true;
      d.done = false;
      d.slot = slot;
      d.x0 = sx;
      d.z0 = sz;
      d.dist = dist / 1000;
      d.startTick = e.tick;
      d.endTick = e.tick + ticks;
      d.clip = clip.id;
    }
    if (s.hero === 'cacklejaw' && sn === 'r') s.anchors[A.homingEnd] = (e.tick + Math.min(15, travelTicks(a.range ?? 12000, a.speed ?? 24000))) * TICK_S;
    if (T.arm > 0) s.anchors[A.zoneArm] = (e.tick + T.arm) * TICK_S;
    if (T.every > 0) s.anchors[A.pulse] = (e.tick + T.arm + T.every) * TICK_S;
    if (T.duration > 0) s.anchors[A.stateEnd] = (e.tick + T.duration) * TICK_S;
    const playing = stack.playing(clip.id);
    if (playing && windupClip) playing.rebind(s.anchors, this.now);
    else stack.play(clip, { anchors: s.anchors });
    const sm = s.moves?.slots[sn];
    // the level-6 branch has its own hold / end (none when it does not author them)
    const br = ent?.branch === true && !!sm?.branch;
    s.holdClip = (br ? sm?.branchHold : sm?.hold) ?? null;
    s.endClip = (br ? sm?.branchEnd : sm?.end) ?? null;
    s.endBuff = 0;
    if (sm?.endOnBuff && (s.holdClip || s.endClip)) {
      // until the buff's falling edge (a cap in case it never shows: cast + 3 × duration, or 10 s)
      s.endBuff = sm.endOnBuff;
      s.endBuffSeen = false;
      s.stateEnd = castS + (T.duration > 0 ? 3 * T.duration * TICK_S : 10);
    } else s.stateEnd = (s.holdClip || s.endClip) && T.duration > 0 ? (e.tick + T.duration) * TICK_S : NaN;
  }

  // ------------------------------------------------------------------------------------------------ fired events (Effects hooks)

  /** A cast fired at render time. Returns true when the hero's SkillFxSet drew the slot (skip the generic shape). */
  castFired(e: Extract<SimEvent, { type: 'cast' }>): boolean {
    const s = e.src >= 0 && e.src < MAX_IDS ? this.st[e.src] : null;
    if (!s) return false;
    // never peeked (no peek source, several snapshots in one frame): bind it now, impact-led
    if (e.slot <= 3) this.castSeen(e);
    const r = this.env.rig(e.src);
    if (this.stub(s) && r) r.ch.anim.cast();
    if (e.slot > 3) return false;
    const fx = skillFxFor(s.hero);
    const sn = SLOT_OF[e.slot];
    if (fx.stub || !fx.owns[sn] || !fx.onCast || (r && !r.visible)) return false;
    fx.onCast(e, this.runtime, this.fillCtx(s, this.frame?.byId.get(e.src)));
    return true;
  }

  windupFired(e: Extract<SimEvent, { type: 'windup' }>): void {
    if (e.slot > 3) return;
    this.windupSeen(e);
    const s = e.src >= 0 && e.src < MAX_IDS ? this.st[e.src] : null;
    if (!s) return;
    const fx = skillFxFor(s.hero);
    if (!fx.stub && fx.onWindup) fx.onWindup(e, this.runtime);
  }

  /** A hit fired at render time: reactions, local hit-stop (§6), the fight meter, own ability-hit follow-ups. */
  hitFired(e: Extract<SimEvent, { type: 'hit' }>, srcIsHero: boolean, dstIsHero: boolean, big: boolean): boolean {
    const dst = dstIsHero ? this.env.rig(e.dst) : null;
    const src = srcIsHero ? this.env.rig(e.src) : null;
    const table = !dstIsHero ? HITSTOP.minion : big ? HITSTOP.heavy : e.kind === 'ability' ? HITSTOP.ability : HITSTOP.basic;
    // in a team fight, freezes between other heroes shrink (a dozen overlapping stops read as stutter); the player's
    // own hits and hits on the player keep the full table
    const mineHit = e.src === this.env.mySlot || e.dst === this.env.mySlot;
    const fk = this.env.teamFight() && !mineHit ? HITSTOP_FIGHT : 1;
    if (src && srcIsHero) src.ch.anim.stack.freeze(table.a * fk);
    if (dst) {
      const ds = this.st[e.dst];
      const stack = dst.ch.anim.stack;
      _v.copy(dst.pos);
      if (src) _w.copy(src.pos);
      else _w.set(dst.pos.x - Math.cos(dst.yaw), 0, dst.pos.z + Math.sin(dst.yaw));
      let dx = _v.x - _w.x;
      let dz = _v.z - _w.z;
      if (Math.abs(dx) + Math.abs(dz) < 1e-3) (dx = -Math.cos(dst.yaw)), (dz = Math.sin(dst.yaw));
      stack.react(e.kind === 'ability' || big ? 'heavy' : 'light', dx, dz);
      stack.freeze(table.v * fk);
      const k = this.env.shakeScale();
      if (k > 0 && table.shake > 0) stack.shake(table.v * fk, table.shake * k);
      if (ds) {
        ds.lastHitAt = this.now;
        const l = Math.hypot(dx, dz) || 1;
        ds.hitFromX = dx / l;
        ds.hitFromZ = dz / l;
      }
      if (src) {
        this.env.cam?.damage(src.team);
        this.env.cam?.damage(dst.team);
      }
    }
    // own ability-hit follow-up clip (Brutus E impact, Cacklejaw R maul) and the touch-dash contact
    let drew = false;
    if (src && e.kind === 'ability') {
      const s = this.st[e.src];
      if (s && !this.stub(s) && s.lastCastSlot >= 0 && this.latestTick - s.lastCastTick < 40) {
        const sm = s.moves?.slots[SLOT_OF[s.lastCastSlot]];
        if (sm?.onHit && !src.ch.anim.stack.playing(sm.onHit.id)) {
          this.anchorsReset(s);
          s.anchors[A.contact] = this.now;
          src.ch.anim.stack.play(sm.onHit, { anchors: s.anchors });
        }
        const fx = skillFxFor(s.hero);
        if (!fx.stub && fx.onHit && fx.owns[SLOT_OF[s.lastCastSlot]]) {
          fx.onHit(e, this.runtime, this.fillCtx(s, this.frame?.byId.get(e.src)));
          drew = true;
        }
      }
    } else if (src && e.kind === 'basic') {
      const s = this.st[e.src];
      const fx = s ? skillFxFor(s.hero) : null;
      if (s && fx && !fx.stub && fx.onHit && fx.owns.basic) {
        fx.onHit(e, this.runtime, this.fillCtx(s, this.frame?.byId.get(e.src)));
        drew = true;
      }
    }
    return drew;
  }

  /** A death fired at render time. */
  deathFired(e: Extract<SimEvent, { type: 'death' }>): void {
    const v = e.id >= 0 && e.id < MAX_IDS ? this.env.rig(e.id) : null;
    const k = e.killer >= 0 && e.killer < MAX_IDS ? this.env.rig(e.killer) : null;
    if (k) k.ch.anim.stack.freeze(HITSTOP.kill.a);
    if (!v) return;
    // a takedown in a team fight lands as a beat: a T2 shake for everyone watching (the killer's own T3 is its cue)
    if (v.visible && this.env.teamFight()) this.env.cam?.tier(2);
    const s = this.st[e.id];
    const stack = v.ch.anim.stack;
    stack.cut(0.06);
    if (s && !this.stub(s) && s.moves) {
      this.anchorsReset(s);
      s.anchors[A.contact] = this.now;
      stack.play(s.moves.death, { anchors: s.anchors });
    }
    if (s) {
      s.dash.on = false;
      s.holdClip = s.endClip = null;
      s.stateEnd = NaN;
      s.endBuff = 0;
      s.idleOn = '';
    }
  }

  /** A hero came back (HeroView edge): the respawn drop from the sky (shared clip). */
  respawned(id: number): void {
    const r = this.env.rig(id);
    const s = id >= 0 && id < MAX_IDS ? this.st[id] : null;
    if (!r || !s) return;
    this.anchorsReset(s);
    r.ch.anim.stack.play(s.moves?.respawn ?? COMMON.respawn, { anchors: s.anchors });
  }

  // ------------------------------------------------------------------------------------------------ snapshot scans

  private projectiles(frame: ViewFrame): void {
    const list = frame.latest.projectiles;
    // mark this snapshot's owners
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.index < 0 || p.index >= this.projSeen.length) continue;
      const owner = p.owner + 1;
      if (this.projOwner[p.index] !== owner) {
        // a new bolt: a ranged swing's release, or an owned skill projectile
        const s = p.owner >= 0 && p.owner < MAX_IDS ? this.st[p.owner] : null;
        if (s) {
          if (BASIC_BOLTS.has(p.kind)) this.basicContact(p.owner, this.latestTick);
          const fx = skillFxFor(s.hero);
          if (!fx.stub && fx.onProjectile) {
            const slot = !BASIC_BOLTS.has(p.kind) && this.latestTick - s.lastCastTick <= 2 ? s.lastCastSlot : -1;
            fx.onProjectile(p.owner, p.kind, slot, this.runtime, p.index);
          }
        }
      }
      this.projSeen[p.index] = owner;
    }
    // swap: what this snapshot had is what the next one is compared with
    for (let i = 0; i < this.projOwner.length; i++) {
      this.projOwner[i] = this.projSeen[i];
      this.projSeen[i] = 0;
    }
  }

  private zones(frame: ViewFrame): void {
    const zs = frame.latest.zones;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (z.index < 0 || z.index >= this.zoneOwner.length) continue;
      const s = z.owner >= 0 && z.owner < MAX_IDS ? this.st[z.owner] : null;
      const fx = s ? skillFxFor(s.hero) : null;
      const arm = z.arm ?? 0;
      if (this.zoneOwner[z.index] !== z.owner) {
        this.zoneOwner[z.index] = z.owner;
        this.zoneArm[z.index] = arm;
        if (fx && !fx.stub) fx.onZone?.(z.index, 'spawn', this.runtime);
        // the zone's real arm time re-pins a playing clip's zoneArm marker
        if (s && arm > 0) {
          const r = this.env.rig(z.owner);
          const pl = r?.ch.anim.stack.current();
          if (pl && pl.warp.anchorTime(A.zoneArm) === pl.warp.anchorTime(A.zoneArm)) pl.warp.retime(A.zoneArm, (this.latestTick + arm) * TICK_S);
        }
      } else if (this.zoneArm[z.index] > 0 && arm === 0) {
        if (fx && !fx.stub) fx.onZone?.(z.index, 'arm', this.runtime);
      }
      this.zoneArm[z.index] = arm;
    }
    // ended zones
    for (let i = 0; i < this.zoneOwner.length; i++) {
      if (this.zoneOwner[i] < 0) continue;
      let alive = false;
      for (let j = 0; j < zs.length; j++) if (zs[j].index === i) alive = true;
      if (alive) continue;
      const s = this.zoneOwner[i] < MAX_IDS ? this.st[this.zoneOwner[i]] : null;
      const fx = s ? skillFxFor(s.hero) : null;
      if (fx && !fx.stub) fx.onZone?.(i, 'end', this.runtime);
      this.zoneOwner[i] = -1;
      this.zoneArm[i] = -1;
    }
  }

  // ------------------------------------------------------------------------------------------------ markers and cues

  private marker(id: number, clip: string, marker: string): void {
    const s = id >= 0 && id < MAX_IDS ? this.st[id] : null;
    if (!s) return;
    // a hero the viewer cannot see (stealth, fog) draws no marker FX, like its cues
    const r = this.env.rig(id);
    if (!r || !r.visible) return;
    const fx = skillFxFor(s.hero);
    if (!fx.stub && fx.onMarker) fx.onMarker(id, clip, marker, this.runtime);
  }

  private cue(id: number, _clip: string, kind: CueKind, arg: string | number | undefined): void {
    const r = this.env.rig(id);
    const s = id >= 0 && id < MAX_IDS ? this.st[id] : null;
    if (!r || !s || !r.visible) return;
    const mine = id === this.env.mySlot;
    const color = this.elementColor(s.hero, mine);
    switch (kind) {
      case 'trailOn': {
        const rb = this.env.ribbons;
        if (!rb) return;
        // team fight cap: ribbons only on ability swings (and the player's own)
        if (this.env.teamFight() && !mine && !ABILITY_CLIP.test(_clip)) return;
        if (s.trail >= 0) rb.end(s.trail);
        const sock = typeof arg === 'string' ? arg : 'weapon';
        const bones = r.ch.rig.bones;
        if (sock === 'weapon') {
          const wb = bones[BONE_INDEX.weapon];
          _v.set(0, 0.08, 0);
          _w.set(0, WEAPON_TIP, 0);
          s.trail = rb.pair(wb, _v, wb, _w, color, 0.16);
        } else {
          const bi = BONE_INDEX[sock as keyof typeof BONE_INDEX] ?? BONE_INDEX.pawR;
          s.trail = rb.follow(bones[bi], null, color, 0.35, 0.2);
        }
        return;
      }
      case 'trailOff':
        if (s.trail >= 0) this.env.ribbons?.end(s.trail);
        s.trail = -1;
        return;
      case 'ghost': {
        const g = this.env.ghosts;
        if (!g) return;
        if (this.env.teamFight() && !mine && !ULT_CLIP.test(_clip)) return;
        g.spawn(r.ch.mesh, mine ? color : r.team === this.env.myTeam ? color : 0x8a92b8);
        return;
      }
      case 'dust':
      case 'land': {
        const p = this.env.particles;
        if (p) {
          _v.set(r.pos.x, 0.15, r.pos.z);
          p.burst(_v, { n: kind === 'land' ? 8 : 5, shape: SHAPE.PUFF, color: 0xfff4e0, alpha: 0.75, size: [0.3, 0.5], sizeEnd: 1.5, life: [0.3, 0.45], speed: [0.6, 1.8], up: 0.5, drag: 2.5 });
        }
        if (kind === 'land') this.env.sfx.cue('land', r.pos);
        return;
      }
      case 'dustRing': {
        const p = this.env.particles;
        if (!p) return;
        _v.set(r.pos.x, 0.12, r.pos.z);
        p.ring(_v, { n: 12, r0: 0.4, speed: [1.5, 2.5], up: 0.4, color: 0xfff4e0, alpha: 0.8, size: [0.3, 0.45], shape: SHAPE.PUFF });
        return;
      }
      case 'whoosh':
        this.env.sfx.cue(`whoosh${typeof arg === 'string' ? arg : 'M'}`, r.pos);
        return;
      case 'sfx':
        if (typeof arg === 'string') this.env.sfx.cue(arg, r.pos);
        return;
      case 'shake':
        if (mine) this.env.cam?.tier((typeof arg === 'number' ? Math.max(0, Math.min(4, arg)) : 1) as 0 | 1 | 2 | 3 | 4);
        return;
      case 'punch':
        if (mine) this.env.cam?.punch(typeof arg === 'number' ? arg : 0.04);
        return;
      case 'smear':
        r.ch.rig.bones[BONE_INDEX.weapon].scale.set(1, 1.8, 1);
        s.smearT = 2 / 60;
        return;
      case 'mouthOpen':
        r.ch.rig.bones[BONE_INDEX.mouth].scale.set(1, 1.6, 1);
        s.mouthT = typeof arg === 'number' ? arg / 1000 : 0.3;
        return;
      case 'fx': {
        const fx = skillFxFor(s.hero);
        if (!fx.stub && fx.onMarker && typeof arg === 'string') fx.onMarker(id, _clip, arg, this.runtime);
        return;
      }
      default:
        return;
    }
  }

  private elementColor(h: HeroId, mine: boolean): number {
    void mine;
    const el = HEROES[h].element;
    return ELEMENT_TRAIL[el] ?? 0xffffff;
  }

  /**
   * Forget every hero's clock, the peeked ticks, bolts and zones (a SnapBuffer reset: ticks start over). The
   * characters' stacks are reset too.
   */
  reset(): void {
    for (let i = 0; i < MAX_IDS; i++) {
      const s = this.st[i];
      if (!s) continue;
      const r = this.env.rig(i);
      if (r) r.ch.anim.stack.reset();
      if (s.trail >= 0) this.env.ribbons?.end(s.trail);
      this.st[i] = null;
    }
    this.peekTick = -1;
    this.lastLatest = -1;
    this.recentN = 0;
    this.projOwner.fill(0);
    this.projSeen.fill(0);
    this.zoneArm.fill(-1);
    this.zoneOwner.fill(-1);
  }

  /** Tests: the per-hero clock. */
  clockOf(id: number): BasicClock | null {
    return id >= 0 && id < MAX_IDS ? (this.st[id]?.clock ?? null) : null;
  }

  dispose(): void {
    this.st.fill(null);
  }
}

/** Trail colours by element (bright cores; the rim comes from relation in mesh FX). */
const ELEMENT_TRAIL: Readonly<Record<string, number>> = Object.freeze({
  FAIRY: 0xffe9a8,
  WIND: 0xd8fff0,
  SAND: 0xffd9a0,
  DARK: 0xc9a8ff,
  STELLAR: 0xfff1a8,
  ELECTRIC: 0xfff36a,
  FIRE: 0xffa060,
});

export const TICKS_PER_S = TICK_HZ;
