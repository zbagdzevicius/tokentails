/**
 * The highlight detector (HIGHLIGHTS.md §2): a pure reader of a match's raw event stream (every event, also the ones
 * fog hides) plus a probe of the hero slots every SAMPLE ticks. It finds fights (multikills, aces, teamfights,
 * shutdowns, the Kibble Cannon, yarn strikes, boss kills), clutch escapes, steals, dives, comebacks and the funny
 * moments, then ranks, merges and picks the reel: the 3 best, a Funniest and a 20-30 s montage.
 *
 * No clock, no randomness, no DOM, no sim import (the probe and `kindOf` are passed in): the same record gives the
 * same reel. It runs in the sim Worker (replay/core.ts feeds it while the scout re-runs the match) and in tests on
 * scripted event streams.
 */
import type { SimEvent } from '../../sim/api';
import type { HeroSample, ProbeSample, UnitKind } from './probe';
import {
  CATEGORY,
  DETECTOR_V,
  FRAME_MIN,
  FRAME_PAD,
  HZ,
  KEY_EVERY,
  LIST_MAX,
  MONTAGE_MAX,
  MONTAGE_MIN,
  RULES,
  TOP_MAX,
  segmentOf,
  type CamKey,
  type Highlight,
  type HighlightReel,
  type HighlightType,
} from './rules';
import { titleFor, type TitleCtx, type TitleFacts } from './titles';

export interface DetectorMeta {
  seed: number;
  /** The record key (`seed:finalHash:ticks`). */
  key: string;
  simVersion: number;
  /** Hero slots (6 or 10) and heroes a side (3 or 5). */
  slots: number;
  teamSize: number;
  /** The replay's length (ticks). */
  ticks: number;
  /** The record's mutator ('none', 'duel', 'boss', 'practice' ...). */
  mutator: string;
  /** Per slot: the Paw Trick ('pounce' ...). */
  tricks: readonly string[];
  /** Per slot: display name. */
  names: readonly string[];
  /** Per slot: a bot. */
  bots: readonly boolean[];
  /** Solo or co-op against bots. */
  vsBots: boolean;
  /** The player's slot. */
  me?: number;
  teams?: readonly [string, string];
  /** The kind of unit an id is now (killers, hit targets). */
  kindOf(id: number): UnitKind;
  /** Optional sidecar: ticks of the player's emotes (not in the record). */
  emotes?: readonly number[];
}

export interface MatchEndFacts {
  winner: 0 | 1 | -1;
  reason: string;
  ticks: number;
}

interface Cand {
  type: HighlightType;
  start: number;
  end: number;
  peak: number;
  base: number;
  funny: number;
  actors: number[];
  victims: number[];
  /** Heroes in it besides actors and victims (a teamfight's participants). */
  group: number[];
  side: 0 | 1 | -1;
  tags: string[];
  facts: TitleFacts;
  frame: boolean;
}

interface Fight {
  open: number;
  parts: Set<number>;
  victims: Set<number>;
  cx: number;
  cy: number;
  kills: [number, number];
  dmg: [number, number];
  deaths: number;
  last: number;
  wiped: [boolean, boolean];
}

const NEG = -1e9;
const d2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const within = (a: { x: number; y: number }, x: number, y: number, r: number): boolean => d2(a.x, a.y, x, y) <= r * r;
const FRAME_TYPES: ReadonlySet<HighlightType> = new Set(['teamfight', 'ace', 'steal', 'strike', 'kaboom', 'comeback', 'finale', 'bossDown']);

export class HighlightDetector {
  private readonly S: number;
  private readonly N: number;
  private readonly me: number;
  private readonly cands: Cand[] = [];
  private last: ProbeSample | null = null;
  /** HP history (one entry per probe, last ~7 s) for "had ≥ 50% HP 6 s before". */
  private hpHist: { tick: number; pct: number[] }[] = [];
  /** 1 Hz positions (100 mm units) and team-0 visibility (0 no, 1 yes, 2 unknown). */
  private readonly posX: Int32Array;
  private readonly posY: Int32Array;
  private readonly seen: Uint8Array;
  private readonly secs: number;
  private lastSec = -1;
  private readonly alive: boolean[];
  private readonly benched: boolean[];
  private readonly lastHeroDmg: number[];
  private readonly lastHitTaken: number[];
  private readonly napAt: number[];
  private readonly clutchCool: number[];
  private readonly lastBoing: number[];
  private readonly lastTrick: number[];
  private readonly lastKick: number[];
  private readonly chainUntil: number[];
  private readonly aceDone: [boolean, boolean] = [false, false];
  private objHits: { tick: number; team: number; amount: number }[] = [];
  private ults: { src: number; tick: number; any: boolean; hero: boolean }[] = [];
  private chains: { killer: number; first: number; last: number; victims: number[] }[] = [];
  private clutches: { h: number; tick: number; min: number; nine: boolean; dead: boolean }[] = [];
  private dives: { killer: number; victim: number; tick: number; failed: boolean }[] = [];
  private pounces: { h: number; tick: number; x: number; y: number; done: boolean }[] = [];
  private pounceCand: { h: number; tick: number; c: Cand }[] = [];
  private dooms: { h: number; tick: number }[] = [];
  private pings: number[] = [];
  private pingUntil = NEG;
  private timeline: { tick: number; k: number; t: number }[] = [];
  private kills: [number, number] = [0, 0];
  private towers: [number, number] = [0, 0];
  private fight: Fight | null = null;
  private lastFightStep = NEG;
  private carrier = -1;
  private lastFire: { tick: number; id: number } | null = null;
  private parry: { tick: number; id: number; shooter: number } | null = null;
  private bossDeath = -1;
  /** Every hero takedown by a hero: killer and tick. */
  private readonly killLog: { killer: number; tick: number }[] = [];

  constructor(private readonly meta: DetectorMeta) {
    this.S = meta.slots;
    this.N = meta.teamSize >= 5 ? 6 : 4;
    this.me = meta.me ?? 0;
    this.secs = Math.ceil(meta.ticks / HZ) + 2;
    this.posX = new Int32Array(this.secs * this.S);
    this.posY = new Int32Array(this.secs * this.S);
    this.seen = new Uint8Array(this.secs * this.S).fill(2);
    const fill = <T>(v: T): T[] => Array.from({ length: this.S }, () => v);
    this.alive = fill(true);
    this.benched = fill(false);
    this.lastHeroDmg = fill(NEG);
    this.lastHitTaken = fill(NEG);
    this.napAt = fill(NEG);
    this.clutchCool = fill(NEG);
    this.lastBoing = fill(NEG);
    this.lastTrick = fill(NEG);
    this.lastKick = fill(NEG);
    this.chainUntil = fill(NEG);
  }

  private teamOf(h: number): 0 | 1 {
    return h < this.meta.teamSize ? 0 : 1;
  }

  private isHero(id: number): boolean {
    return id >= 0 && id < this.S && !this.benched[id];
  }

  /** Heroes of `team` in the match (a mode may bench some). */
  private active(team: 0 | 1): number[] {
    const out: number[] = [];
    for (let h = team * this.meta.teamSize; h < (team + 1) * this.meta.teamSize; h++) if (!this.benched[h]) out.push(h);
    return out;
  }

  private sample(h: number): HeroSample | null {
    return this.last?.heroes[h] ?? null;
  }

  private add(c: Omit<Cand, 'group' | 'tags' | 'frame' | 'facts'> & Partial<Pick<Cand, 'group' | 'tags' | 'facts'>>): Cand {
    const cand: Cand = {
      ...c,
      start: Math.max(0, c.start),
      end: Math.min(this.meta.ticks, c.end),
      group: c.group ?? [],
      tags: c.tags ?? [],
      facts: c.facts ?? { type: c.type, start: c.start, actors: c.actors, victims: c.victims },
      frame: FRAME_TYPES.has(c.type),
    };
    cand.facts = { ...cand.facts, type: c.type, start: cand.start, actors: c.actors, victims: c.victims };
    this.cands.push(cand);
    return cand;
  }

  /** One funny moment around `t`. */
  private funny(type: HighlightType, t: number, funny: number, actors: number[], victims: number[] = [], facts: Partial<TitleFacts> = {}): Cand {
    return this.add({ type, start: t - RULES.preRoll, end: t + RULES.postRoll, peak: t, base: Math.round(funny * RULES.funnyToScore), funny, actors, victims, side: actors.length ? this.teamOf(actors[0]) : -1, facts: { type, start: t, actors, victims, ...facts } });
  }

  /** Feed one tick: its raw events, and (every SAMPLE ticks) the probe. */
  feed(tick: number, events: readonly SimEvent[], probe?: ProbeSample | null): void {
    for (const e of events) this.onEvent(e);
    if (probe) this.onProbe(tick, probe);
  }

  private onEvent(e: SimEvent): void {
    const t = e.tick;
    switch (e.type) {
      case 'hit': {
        const srcHero = this.isHero(e.src);
        const dstHero = this.isHero(e.dst);
        if (srcHero && dstHero && this.teamOf(e.src) !== this.teamOf(e.dst)) {
          this.lastHeroDmg[e.src] = this.lastHeroDmg[e.dst] = t;
          this.lastHitTaken[e.dst] = t;
          const f = this.fight;
          if (f && f.parts.has(e.src) && f.parts.has(e.dst)) {
            f.dmg[this.teamOf(e.src)] += e.amount;
            f.last = t;
          }
          // overkill: one hit of ≥ 5x what was left, on a hero at ≤ 5% HP
          const s = this.sample(e.dst);
          if (s && s.alive && s.hp > 0 && s.hp * 100 <= s.maxHp * RULES.overkillPct && e.amount >= s.hp * RULES.overkillTimes) this.funny('overkill', t, RULES.overkill, [e.src], [e.dst]);
        }
        if (srcHero) {
          const k = dstHero ? 'hero' : this.meta.kindOf(e.dst);
          if (k === 'camp' || k === 'pudding' || k === 'boss') {
            this.objHits.push({ tick: t, team: this.teamOf(e.src), amount: e.amount });
            if (this.objHits.length > 400) this.objHits = this.objHits.filter((h) => t - h.tick <= RULES.stealWindow);
          }
          for (const u of this.ults) {
            if (u.src !== e.src || t - u.tick > RULES.ultWindow) continue;
            u.any = true;
            if (k !== 'minion' && k !== 'camp') u.hero = true;
          }
        }
        break;
      }
      case 'cast':
        if (!this.isHero(e.src)) break;
        if (e.slot === 3) this.ults.push({ src: e.src, tick: t, any: false, hero: false });
        if (e.slot === 4) {
          this.lastTrick[e.src] = t;
          const s = this.sample(e.src);
          if (this.meta.tricks[e.src] === 'pounce' && s && s.alive && !within(s, e.x, e.y, RULES.pounceAim)) this.pounces.push({ h: e.src, tick: t, x: s.x, y: s.y, done: false });
        }
        break;
      case 'death':
        if (this.isHero(e.id)) this.onDeath(t, e.id, e.killer);
        break;
      case 'firstBlood':
        if (this.isHero(e.killer)) this.add({ type: 'firstBlood', start: t - RULES.firstBloodPre, end: t + RULES.postRoll, peak: t, base: RULES.firstBlood, funny: 0, actors: [e.killer], victims: [e.victim], side: this.teamOf(e.killer) });
        break;
      case 'shutdown':
        if (this.isHero(e.killer))
          this.add({ type: 'shutdown', start: t - RULES.shutdownPre, end: t + RULES.postRoll, peak: t, base: Math.min(RULES.shutdownCap, RULES.shutdownBase + Math.floor(e.value / 50)), funny: 0, actors: [e.killer], victims: [e.victim], side: this.teamOf(e.killer) });
        break;
      case 'kaboom': {
        const from = this.lastFire && t - this.lastFire.tick < 10 * HZ ? this.lastFire.tick : t;
        const p = this.parry;
        if (p && p.id === e.src && p.shooter === e.dst && t - p.tick <= 5 * HZ) {
          this.add({ type: 'returnToSender', start: p.tick - RULES.preRoll, end: t + RULES.postRoll, peak: t, base: RULES.returnToSenderEpic, funny: RULES.returnToSender, actors: [e.src], victims: [e.dst], side: this.teamOf(e.src) });
          this.parry = null;
        } else if (this.isHero(e.src)) this.add({ type: 'kaboom', start: from - RULES.kaboomPre, end: t + RULES.postRoll, peak: t, base: RULES.kaboom, funny: 0, actors: [e.src], victims: [e.dst], side: this.teamOf(e.src) });
        break;
      }
      case 'cannonFire':
        this.lastFire = { tick: t, id: e.id };
        this.carrier = -1;
        break;
      case 'cannonParry':
        this.parry = { tick: t, id: e.id, shooter: this.lastFire?.id ?? -1 };
        break;
      case 'cannonPick':
        this.carrier = e.id;
        if (e.steal && this.isHero(e.id))
          this.add({ type: 'steal', start: t - RULES.preRoll, end: t + RULES.postRoll, peak: t, base: RULES.stealCannon, funny: 0, actors: [e.id], victims: [], side: this.teamOf(e.id), facts: { type: 'steal', start: t, actors: [e.id], victims: [], sort: 'cannon' } });
        break;
      case 'cannonDrop':
        this.carrier = -1;
        if (e.why === 'fumble' && this.isHero(e.id)) this.funny('fumble', t, RULES.fumbleDrop, [e.id], [], { what: 'drop' });
        break;
      case 'cannonFizzle':
        if (this.isHero(this.carrier)) this.funny('fumble', t, RULES.fumbleFizzle, [this.carrier], [], { what: 'fizzle' });
        this.carrier = -1;
        break;
      case 'cannonWhiff':
        if (this.isHero(e.id)) this.funny('fumble', t, RULES.fumbleWhiff, [e.id], [], { what: 'whiff' });
        break;
      case 'boing': {
        if (!this.isHero(e.id)) break;
        const prev = this.lastBoing[e.id];
        this.lastBoing[e.id] = t;
        if (t - prev <= RULES.boingChainGap && t > this.chainUntil[e.id]) {
          this.chainUntil[e.id] = t + RULES.boingChainGap;
          this.add({ type: 'boing', start: prev - RULES.preRoll, end: t + RULES.postRoll, peak: t, base: Math.round(RULES.boingChain * RULES.funnyToScore), funny: RULES.boingChain, actors: [e.id], victims: [], side: this.teamOf(e.id), facts: { type: 'boing', start: prev, actors: [e.id], victims: [], what: 'chain' } });
        } else if (t - prev <= RULES.boingChainGap) this.chainUntil[e.id] = t + RULES.boingChainGap;
        // boinged to doom: it lands next to 2+ enemies
        let near = 0;
        const team = this.teamOf(e.id);
        this.last?.heroes.forEach((s, h) => {
          if (s.alive && !s.benched && this.teamOf(h) !== team && within(s, e.tx, e.ty, RULES.boingDoomRange)) near++;
        });
        if (near >= 2) this.dooms.push({ h: e.id, tick: t });
        break;
      }
      case 'yarnKick':
        if (this.isHero(e.id)) this.lastKick[e.id] = t;
        break;
      case 'yarnStrike':
        if (e.n >= RULES.strikeMin && this.isHero(e.id)) {
          const kick = t - this.lastKick[e.id] < 10 * HZ ? this.lastKick[e.id] : t;
          this.add({ type: 'strike', start: kick - RULES.strikePre, end: t + RULES.postRoll, peak: t, base: Math.min(80, 40 + 10 * e.n), funny: 0, actors: [e.id], victims: [], side: this.teamOf(e.id), facts: { type: 'strike', start: t, actors: [e.id], victims: [], n: e.n } });
        }
        break;
      case 'objective': {
        const recent = this.objHits.filter((h) => t - h.tick <= RULES.stealWindow);
        const total = recent.reduce((n, h) => n + h.amount, 0);
        const mine = recent.filter((h) => h.team === e.team).reduce((n, h) => n + h.amount, 0);
        if (total > 0 && mine * 100 < total * RULES.stealShare) {
          const who = this.isHero(e.slot) ? [e.slot] : [];
          this.add({ type: 'steal', start: t - RULES.preRoll - HZ, end: t + RULES.postRoll, peak: t, base: RULES.stealObjective, funny: 0, actors: who, victims: [], side: e.team, facts: { type: 'steal', start: t, actors: who, victims: [], sort: 'objective', what: e.kind } });
        }
        this.objHits = [];
        break;
      }
      case 'buffSteal':
        if (this.isHero(e.id)) this.add({ type: 'steal', start: t - RULES.preRoll, end: t + RULES.postRoll, peak: t, base: RULES.stealBuff, funny: 0, actors: [e.id], victims: [], side: this.teamOf(e.id), facts: { type: 'steal', start: t, actors: [e.id], victims: [], sort: 'buff' } });
        break;
      case 'buff':
        if (e.kind === 'nineLives' && this.isHero(e.id) && t - this.clutchCool[e.id] >= RULES.clutchCooldown && !this.clutches.some((c) => c.h === e.id)) {
          this.clutchCool[e.id] = t;
          const s = this.sample(e.id);
          this.clutches.push({ h: e.id, tick: t, min: s && s.maxHp > 0 ? Math.floor((s.hp * 100) / s.maxHp) : 10, nine: true, dead: false });
        }
        break;
      case 'clip':
        if (this.isHero(e.id)) this.funny('clipKind', t, RULES.clip[e.what] ?? RULES.clipOther, [e.id], [], { what: e.what });
        break;
      case 'ping':
        this.pings.push(t);
        this.pings = this.pings.filter((p) => t - p <= RULES.pingWindow);
        if (this.pings.length >= RULES.pingBurst && t > this.pingUntil) {
          this.pingUntil = t + RULES.pingWindow;
          this.add({ type: 'pingSpam', start: this.pings[0] - HZ, end: t + RULES.postRoll, peak: t, base: Math.round(RULES.pingSpam * RULES.funnyToScore), funny: RULES.pingSpam, actors: [this.me], victims: [], side: this.teamOf(this.me) });
        }
        break;
      case 'tower':
        this.towers[e.destroyedBy]++;
        this.timeline.push({ tick: t, k: this.kills[0] - this.kills[1], t: this.towers[0] - this.towers[1] });
        break;
      default:
        break;
    }
  }

  private onDeath(t: number, id: number, killer: number): void {
    this.alive[id] = false;
    const vTeam = this.teamOf(id);
    const kHero = this.isHero(killer) && this.teamOf(killer) !== vTeam;
    const kk: UnitKind = killer < 0 ? 'other' : this.isHero(killer) ? 'hero' : this.meta.kindOf(killer);
    const s = this.sample(id);
    // the score: every hero down is a takedown for the other side
    this.kills[(1 - vTeam) as 0 | 1]++;
    this.timeline.push({ tick: t, k: this.kills[0] - this.kills[1], t: this.towers[0] - this.towers[1] });
    if (this.meta.mutator === 'boss' && id === this.meta.teamSize) this.bossDeath = t;
    // a pending clutch on this hero did not make it
    for (const c of this.clutches) if (c.h === id) c.dead = true;
    // multikill chains (the announcer's 8 s rule)
    if (kHero) {
      this.killLog.push({ killer, tick: t });
      const ch = this.chains.find((c) => c.killer === killer);
      if (ch && t - ch.last <= RULES.multikillGap) {
        ch.last = t;
        ch.victims.push(id);
      } else {
        if (ch) this.closeChain(ch);
        this.chains = this.chains.filter((c) => c.killer !== killer);
        this.chains.push({ killer, first: t, last: t, victims: [id] });
      }
    }
    // ace: every hero of the victim's team is down (not in a 1-hero Duel)
    const mates = this.active(vTeam);
    if (this.meta.mutator !== 'duel' && mates.length >= 2 && !this.aceDone[vTeam] && mates.every((h) => !this.alive[h])) {
      this.aceDone[vTeam] = true;
      const credited = (1 - vTeam) as 0 | 1;
      const ours = credited === this.teamOf(this.me);
      const killers = this.active(credited).filter((h) => this.lastHeroDmg[h] >= t - RULES.acePre);
      this.add({ type: 'ace', start: t - RULES.acePre, end: t + RULES.postRoll, peak: t, base: ours ? RULES.aceOurs : RULES.aceTheirs, funny: 0, actors: kHero ? [killer, ...killers.filter((h) => h !== killer)] : killers, victims: mates, side: credited, facts: { type: 'ace', start: t, actors: [], victims: mates, n: mates.length, side: credited } });
    }
    // the fight it belongs to
    const f = this.fight;
    if (f && (f.parts.has(id) || (kHero && f.parts.has(killer)))) {
      f.parts.add(id);
      f.kills[(1 - vTeam) as 0 | 1]++;
      f.deaths++;
      f.victims.add(id);
      f.last = t;
      if (mates.every((h) => !this.alive[h])) f.wiped[vTeam] = true;
    }
    // dives: killed under its own tower; a diver that dies to that tower within 3 s failed
    for (const d of this.dives)
      if (!d.failed && d.killer === id && t - d.tick <= RULES.diveHold && kk === 'tower') {
        d.failed = true;
        this.funny('diveFail', t, RULES.diveFail, [id], [d.victim]);
      }
    if (kHero && s && this.last?.towers.some((tw) => tw.alive && tw.team === vTeam && within(tw, s.x, s.y, RULES.towerRange))) this.dives.push({ killer, victim: id, tick: t, failed: false });
    // funny deaths
    if (kk === 'minion') {
      const ago = this.hpHist.find((h) => h.tick >= t - RULES.minionHealthyAgo - SAMPLE_SLACK);
      const healthy = !!ago && ago.tick <= t - RULES.minionHealthyAgo + SAMPLE_SLACK && (ago.pct[id] ?? 0) >= RULES.minionHealthyPct;
      this.funny('minionDeath', t, RULES.minionDeath + (healthy ? 15 : 0), [id]);
    } else if (kk === 'tower') {
      const lonely = !this.last?.heroes.some((h, i) => i !== id && h.alive && !h.benched && this.teamOf(i) !== vTeam && s && within(h, s.x, s.y, RULES.towerLonely));
      if (lonely) this.funny('towerDeath', t, RULES.towerDeath, [id]);
    } else if (kk === 'camp' || kk === 'boss') this.funny('campDeath', t, RULES.campDeath, [id]);
    if (t - this.napAt[id] <= RULES.napWindow) {
      this.funny('napFail', t, RULES.napFail, [id]);
      this.napAt[id] = NEG;
    }
    for (const p of this.pounceCand)
      if (p.h === id && t - p.tick <= RULES.diveHold) {
        p.c.funny = Math.min(100, p.c.funny + RULES.wallPounceDeath);
        p.c.base = Math.round(p.c.funny * RULES.funnyToScore);
        p.c.end = Math.max(p.c.end, t + RULES.postRoll);
        p.tick = NEG;
      }
    const doom = this.dooms.find((d) => d.h === id && t - d.tick <= RULES.diveHold);
    if (doom) {
      this.add({ type: 'boing', start: doom.tick - RULES.preRoll, end: t + RULES.postRoll, peak: t, base: Math.round(RULES.boingDoom * RULES.funnyToScore), funny: RULES.boingDoom, actors: [id], victims: [], side: vTeam, facts: { type: 'boing', start: doom.tick, actors: [id], victims: [], what: 'doom' } });
      this.dooms = this.dooms.filter((d) => d !== doom);
    }
    // a bot that walked alone into 3 enemies
    if (this.meta.bots[id] && s && kk === 'hero') {
      let foes = 0;
      let friends = 0;
      this.last?.heroes.forEach((h, i) => {
        if (i === id || !h.alive || h.benched || !within(h, s.x, s.y, RULES.blunderRange)) return;
        if (this.teamOf(i) === vTeam) friends++;
        else foes++;
      });
      if (foes >= RULES.blunderEnemies && friends === 0) this.funny('botBlunder', t, RULES.blunder, [id], kHero ? [killer] : []);
    }
  }

  private closeChain(ch: { killer: number; first: number; last: number; victims: number[] }): void {
    const n = ch.victims.length;
    if (n < 2) return;
    const base = RULES.multikillScore[Math.min(5, n)] ?? 100;
    this.add({ type: 'multikill', start: ch.first - RULES.multikillPre, end: ch.last + RULES.postRoll, peak: ch.last, base, funny: 0, actors: [ch.killer], victims: ch.victims.slice(), side: this.teamOf(ch.killer), facts: { type: 'multikill', start: ch.first, actors: [ch.killer], victims: ch.victims, n, seconds: Math.max(1, Math.round((ch.last - ch.first) / HZ)) } });
  }

  private onProbe(tick: number, p: ProbeSample): void {
    p.heroes.forEach((h, i) => {
      this.benched[i] = h.benched;
      if (h.alive) this.alive[i] = true;
      if (h.napping) this.napAt[i] = tick;
    });
    for (const team of [0, 1] as const) if (this.active(team).some((h) => this.alive[h])) this.aceDone[team] = false;
    this.hpHist.push({ tick, pct: p.heroes.map((h) => (h.maxHp > 0 ? Math.floor((h.hp * 100) / h.maxHp) : 0)) });
    if (this.hpHist.length > 48) this.hpHist.shift();
    const sec = Math.floor(tick / HZ);
    if (sec !== this.lastSec && sec < this.secs) {
      this.lastSec = sec;
      p.heroes.forEach((h, i) => {
        this.posX[sec * this.S + i] = Math.round(h.x / 100);
        this.posY[sec * this.S + i] = Math.round(h.y / 100);
        if (p.seen) this.seen[sec * this.S + i] = p.seen[i] ? 1 : 0;
      });
    }
    // wall pounce: it barely moved between the probe before the cast and this one
    for (const q of this.pounces) {
      if (q.done || tick <= q.tick) continue;
      q.done = true;
      const h = p.heroes[q.h];
      if (h && h.alive && within(h, q.x, q.y, RULES.pounceMoved)) this.pounceCand.push({ h: q.h, tick: q.tick, c: this.funny('wallPounce', q.tick, RULES.wallPounce, [q.h]) });
    }
    this.pounces = this.pounces.filter((q) => !q.done);
    this.pounceCand = this.pounceCand.filter((q) => tick - q.tick <= RULES.diveHold);
    this.dooms = this.dooms.filter((d) => tick - d.tick <= RULES.diveHold);
    // an ult whose hits in 1.5 s landed only on minions and camps
    for (const u of this.ults)
      if (tick - u.tick > RULES.ultWindow) {
        if (u.any && !u.hero) this.funny('ultOnMinion', u.tick, RULES.ultOnMinion, [u.src]);
        u.tick = NEG;
      }
    this.ults = this.ults.filter((u) => u.tick !== NEG);
    // clutch: ≤ 15% HP, hit by a hero in the last 2 s, an enemy within 8 m ... still standing 5 s later
    p.heroes.forEach((h, i) => {
      if (!h.alive || h.benched || h.maxHp <= 0) return;
      const pct = Math.floor((h.hp * 100) / h.maxHp);
      const open = this.clutches.find((c) => c.h === i);
      if (open) {
        open.min = Math.min(open.min, pct);
        return;
      }
      if (pct > RULES.clutchPct || tick - this.lastHitTaken[i] > RULES.clutchHitWindow || tick - this.clutchCool[i] < RULES.clutchCooldown) return;
      const team = this.teamOf(i);
      if (!p.heroes.some((o, j) => j !== i && o.alive && !o.benched && this.teamOf(j) !== team && within(o, h.x, h.y, RULES.clutchEnemyRange))) return;
      this.clutchCool[i] = tick;
      this.clutches.push({ h: i, tick, min: pct, nine: false, dead: false });
    });
    this.clutches = this.clutches.filter((c) => {
      if (c.dead) return false;
      if (tick - c.tick < RULES.clutchSurvive) return true;
      this.closeClutch(c);
      return false;
    });
    // dives held for 3 s
    this.dives = this.dives.filter((d) => {
      if (tick - d.tick < RULES.diveHold) return true;
      if (!d.failed && this.alive[d.killer]) this.add({ type: 'dive', start: d.tick - RULES.preRoll - HZ, end: d.tick + RULES.postRoll + HZ, peak: d.tick, base: RULES.dive, funny: 0, actors: [d.killer], victims: [d.victim], side: this.teamOf(d.killer) });
      return false;
    });
    this.last = p;
    if (tick - this.lastFightStep >= RULES.fightEvery) {
      this.lastFightStep = tick;
      this.fightStep(tick, p);
    }
  }

  private closeClutch(c: { h: number; tick: number; min: number; nine: boolean }): void {
    let score = RULES.clutch;
    if (c.min <= RULES.clutchDeepPct) score += 20;
    // it took a hero down on the way out ("Outplay")
    const outplay = this.timelineKillsBy(c.h, c.tick - RULES.clutchHitWindow, c.tick + RULES.clutchSurvive);
    if (outplay) score += 15;
    if ((this.lastBoing[c.h] >= c.tick && this.lastBoing[c.h] <= c.tick + RULES.clutchSurvive) || (this.lastTrick[c.h] >= c.tick - 15 && this.lastTrick[c.h] <= c.tick + RULES.clutchSurvive)) score += 10;
    this.add({ type: 'clutch', start: c.tick - RULES.preRoll - HZ, end: c.tick + RULES.clutchSurvive, peak: c.tick, base: score, funny: 0, actors: [c.h], victims: [], side: this.teamOf(c.h), facts: { type: 'clutch', start: c.tick, actors: [c.h], victims: [], hpPct: Math.max(1, c.min), outplay, ...(c.nine ? { what: 'nine' } : {}) } });
  }

  /** Did `h` take a hero down between two ticks? */
  private timelineKillsBy(h: number, a: number, b: number): boolean {
    return this.killLog.some((k) => k.killer === h && k.tick >= a && k.tick <= b);
  }


  private fightStep(tick: number, p: ProbeSample): void {
    if (this.meta.mutator === 'duel') return;
    const eng: number[] = [];
    p.heroes.forEach((h, i) => {
      if (h.alive && !h.benched && tick - this.lastHeroDmg[i] <= RULES.engagedWindow) eng.push(i);
    });
    const centre = (ids: number[]): [number, number] => {
      let x = 0;
      let y = 0;
      for (const i of ids) {
        x += p.heroes[i].x;
        y += p.heroes[i].y;
      }
      return ids.length ? [x / ids.length, y / ids.length] : [0, 0];
    };
    const f = this.fight;
    if (!f) {
      if (eng.length < this.N) return;
      let [cx, cy] = centre(eng);
      let mem = eng.filter((i) => within(p.heroes[i], cx, cy, RULES.fightRadius));
      [cx, cy] = centre(mem);
      mem = eng.filter((i) => within(p.heroes[i], cx, cy, RULES.fightRadius));
      const a = mem.filter((i) => this.teamOf(i) === 0).length;
      const b = mem.length - a;
      if (mem.length < this.N || a < 2 || b < 2) return;
      this.fight = { open: tick, parts: new Set(mem), victims: new Set(), cx, cy, kills: [0, 0], dmg: [0, 0], deaths: 0, last: tick, wiped: [false, false] };
      return;
    }
    const near = eng.filter((i) => within(p.heroes[i], f.cx, f.cy, RULES.fightKeepRadius));
    for (const i of near) f.parts.add(i);
    if (near.length) [f.cx, f.cy] = centre(near);
    const a = near.filter((i) => this.teamOf(i) === 0).length;
    const b = near.length - a;
    if (tick - f.last >= RULES.fightQuiet || a === 0 || b === 0 || near.length < this.N - 1) this.closeFight();
  }

  private closeFight(): void {
    const f = this.fight;
    this.fight = null;
    if (!f) return;
    const parts = [...f.parts].sort((x, y) => x - y);
    const dur = f.last - f.open;
    const maxHp = parts.reduce((n, i) => n + (this.last?.heroes[i]?.maxHp ?? 0), 0);
    const dmg = f.dmg[0] + f.dmg[1];
    if (dur < RULES.fightMinTicks || (f.deaths < 1 && dmg * 100 < maxHp * RULES.fightDamagePct)) return;
    let side: 0 | 1 | -1 = -1;
    if (f.kills[0] !== f.kills[1]) side = f.kills[0] > f.kills[1] ? 0 : 1;
    else if (f.dmg[0] * 100 >= f.dmg[1] * (100 + RULES.fightLeadPct) && f.dmg[0] > 0) side = 0;
    else if (f.dmg[1] * 100 >= f.dmg[0] * (100 + RULES.fightLeadPct) && f.dmg[1] > 0) side = 1;
    const wipe = f.wiped[0] || f.wiped[1];
    const meIn = f.parts.has(this.me);
    const score = Math.min(95, 30 + 10 * f.deaths + (wipe ? 15 : 0) + (meIn ? 10 : 0) + (side === this.teamOf(this.me) ? 10 : 0));
    const winners = side >= 0 ? parts.filter((i) => this.teamOf(i) === side) : parts;
    const victims = [...f.victims].sort((x, y) => x - y);
    const kills: [number, number] = [f.kills[0], f.kills[1]];
    this.add({
      type: 'teamfight',
      start: f.open - RULES.fightPre,
      end: f.last + RULES.fightPost,
      peak: f.last,
      base: score,
      funny: 0,
      actors: winners.filter((i) => !victims.includes(i)),
      victims,
      group: parts,
      side,
      tags: wipe ? ['wipe'] : [],
      facts: { type: 'teamfight', start: f.open, actors: winners, victims, n: parts.length, kills, seconds: Math.max(1, Math.round(dur / HZ)), side },
    });
  }

  /** The match ended: close what is open, add the end-of-match moments, then rank, merge and pick. */
  finish(end: MatchEndFacts): HighlightReel {
    const total = Math.min(this.meta.ticks, Math.max(1, end.ticks));
    if (this.fight) this.closeFight();
    for (const ch of this.chains) this.closeChain(ch);
    this.chains = [];
    for (const c of this.clutches) if (!c.dead) this.closeClutch(c);
    this.clutches = [];
    for (const d of this.dives) if (!d.failed && this.alive[d.killer]) this.add({ type: 'dive', start: d.tick - RULES.preRoll - HZ, end: d.tick + RULES.postRoll + HZ, peak: d.tick, base: RULES.dive, funny: 0, actors: [d.killer], victims: [d.victim], side: this.teamOf(d.killer) });
    this.dives = [];
    const won = end.winner;
    if (this.meta.mutator === 'boss' && end.reason === 'goal' && this.bossDeath >= 0)
      this.add({ type: 'bossDown', start: this.bossDeath - RULES.bossPre, end: this.bossDeath + RULES.postRoll, peak: this.bossDeath, base: RULES.bossDown, funny: 0, actors: this.active(0).filter((h) => this.lastHeroDmg[h] >= this.bossDeath - RULES.bossPre), victims: [this.meta.teamSize], side: 0 });
    if (end.reason === 'core' || end.reason === 'timeUp')
      this.add({ type: 'finale', start: total - RULES.finaleLen, end: total, peak: total - HZ, base: RULES.finale, funny: 0, actors: [], victims: [], side: won === -1 ? -1 : won, facts: { type: 'finale', start: total - RULES.finaleLen, actors: [], victims: [], what: end.reason === 'timeUp' ? 'timeUp' : won === this.teamOf(this.me) ? 'won' : 'lost', side: won === -1 ? -1 : won } });
    if (won === 0 || won === 1) this.comeback(won);
    // the optional emote sidecar: 3 emotes in 5 s
    const em = (this.meta.emotes ?? []).slice().sort((a, b) => a - b);
    for (let i = 0, until = NEG; i + RULES.emoteBurst - 1 < em.length; i++)
      if (em[i + RULES.emoteBurst - 1] - em[i] <= RULES.emoteWindow && em[i] > until) {
        until = em[i] + RULES.emoteWindow;
        this.funny('emoteSpam', em[i + RULES.emoteBurst - 1], RULES.emoteSpam, [this.me]);
      }
    const short = total < RULES.shortMatch;
    const pool = this.meta.mutator === 'practice' ? [] : short ? this.cands.filter((c) => c.type === 'finale') : this.cands.slice();
    return this.pick(pool, total);
  }

  private comeback(winner: 0 | 1): void {
    const sign = winner === 0 ? 1 : -1;
    let worstK = 0;
    let trailed = false;
    for (const e of this.timeline) {
      const k = e.k * sign;
      const tw = e.t * sign;
      if (k <= -RULES.comebackKills || tw <= -1) trailed = true;
      worstK = Math.min(worstK, k);
    }
    if (!trailed) return;
    const lead = (e: { k: number; t: number }): number => (e.k + 2 * e.t) * sign;
    let flip = -1;
    for (let i = this.timeline.length - 1; i >= 0; i--) {
      if (lead(this.timeline[i]) < 0) break;
      const before = i > 0 ? lead(this.timeline[i - 1]) : 0;
      if (before < 0) {
        flip = i;
        break;
      }
    }
    if (flip < 0) return;
    const t = this.timeline[flip].tick;
    const ours = winner === this.teamOf(this.me);
    this.add({ type: 'comeback', start: t - RULES.preRoll - 2 * HZ, end: t + RULES.postRoll + HZ, peak: t, base: ours ? RULES.comebackOurs : RULES.comebackTheirs, funny: 0, actors: [], victims: [], side: winner, facts: { type: 'comeback', start: t, actors: [], victims: [], side: winner, behind: -worstK } });
  }

  // ------------------------------------------------------------------------------- ranking, merging, picking

  private mineOf(c: Pick<Cand, 'actors' | 'victims' | 'group' | 'side' | 'type'>): Highlight['mine'] {
    if (c.actors.includes(this.me)) return 'actor';
    if (c.victims.includes(this.me) || c.group.includes(this.me)) return 'involved';
    return 'none';
  }

  private finalScore(c: Cand, first: boolean, total: number): number {
    const mine = this.mineOf(c);
    const bonus = mine === 'actor' ? RULES.mineActor : mine === 'involved' ? RULES.mineInvolved : 0;
    return Math.min(100, c.base + bonus + (first ? RULES.rarity : 0) + (c.start >= total - RULES.lateTicks ? RULES.late : 0));
  }

  /** The share of 1 Hz checks in [a, b] where the player's team saw `h` (1 when unknown). */
  private seenShare(h: number, a: number, b: number): number {
    let yes = 0;
    let n = 0;
    for (let s = Math.max(0, Math.floor(a / HZ)); s <= Math.min(this.secs - 1, Math.floor(b / HZ)); s++) {
      const v = this.seen[s * this.S + h];
      if (v === 2) continue;
      n++;
      if (v === 1) yes++;
    }
    return n ? yes / n : 1;
  }

  private pick(pool: Cand[], total: number): HighlightReel {
    pool.sort((a, b) => a.start - b.start || a.peak - b.peak || a.type.localeCompare(b.type));
    // rarity: the first of its type in the match
    const seenType = new Set<HighlightType>();
    let scored = pool.map((c) => {
      const first = !seenType.has(c.type);
      seenType.add(c.type);
      return { c, score: this.finalScore(c, first, total) };
    });
    // merge overlapping moments (> 50% of the shorter one) of the same family (funny stays apart for the Funniest)
    const merged: { c: Cand; score: number; title: TitleFacts }[] = [];
    for (const s of scored) {
      const fam = CATEGORY[s.c.type] === 'funny';
      const into = merged.find((m) => (CATEGORY[m.c.type] === 'funny') === fam && overlap(m.c, s.c) > RULES.mergeOverlap * Math.min(m.c.end - m.c.start, s.c.end - s.c.start));
      if (!into) {
        merged.push({ c: { ...s.c, tags: s.c.tags.slice() }, score: s.score, title: s.c.facts });
        continue;
      }
      const winA = into.score >= s.score;
      const keep = winA ? into.c : { ...s.c, tags: s.c.tags.slice() };
      const lose = winA ? s.c : into.c;
      const tag = lose.type === 'multikill' ? `multikill:${lose.victims.length}` : lose.type;
      const tags = [...new Set([...into.c.tags, ...s.c.tags, tag])].filter((t) => t !== keep.type);
      // a teamfight with a triple inside is titled by the triple
      const title = keep.type === 'teamfight' && lose.type === 'multikill' ? { ...lose.facts } : winA ? into.title : s.c.facts;
      const c: Cand = {
        ...keep,
        start: Math.min(into.c.start, s.c.start),
        end: Math.max(into.c.end, s.c.end),
        funny: Math.max(into.c.funny, s.c.funny),
        actors: uniq([...keep.actors, ...lose.actors.filter((a) => !keep.victims.includes(a))]),
        victims: uniq([...keep.victims, ...lose.victims]),
        group: uniq([...keep.group, ...lose.group]),
        tags,
      };
      into.c = c;
      into.score = Math.min(100, Math.max(into.score, s.score) + RULES.mergeTag);
      into.title = title;
    }
    scored = [];
    // lengths 6 to 20 s, enemy-only moments the player's team could not see dropped
    const all: Highlight[] = [];
    const ctx = this.titleCtx();
    for (const m of merged) {
      const c = m.c;
      [c.start, c.end] = clampWindow(c.start, c.end, c.peak, total);
      const mine = this.mineOf(c);
      const actor = c.actors[0] ?? c.victims[0] ?? -1;
      if (mine === 'none' && actor >= 0 && this.teamOf(actor) !== this.teamOf(this.me) && this.seenShare(actor, c.start, c.end) < RULES.seenShare) continue;
      const bots = c.actors.some((a) => !!this.meta.bots[a]);
      // the title's own hero decides "Bot ..." (a merged moment may hold another hero)
      const lead = m.title.actors[0] ?? c.actors[0] ?? -1;
      const funnyBot = CATEGORY[m.title.type] === 'funny' && lead >= 0 && !!this.meta.bots[lead];
      const { title, sub } = titleFor({ ...m.title, start: c.start }, ctx, funnyBot);
      all.push({
        id: `${c.type}:${c.start}`,
        type: c.type,
        category: CATEGORY[c.type],
        start: c.start,
        end: c.end,
        peak: Math.max(c.start, Math.min(c.end, c.peak)),
        score: m.score,
        funny: c.funny,
        title,
        sub,
        actors: c.actors,
        victims: c.victims,
        side: c.side,
        mine,
        bots,
        cam: this.camFor(c, mine),
        tags: c.tags,
      });
    }
    // unique ids (two moments of one type cannot start on the same tick after a merge, but be safe)
    const ids = new Set<string>();
    const unique = all.filter((h) => (ids.has(h.id) ? false : (ids.add(h.id), true)));
    const byScore = unique.slice().sort((a, b) => b.score - a.score || a.start - b.start);
    const top: Highlight[] = [];
    for (const h of byScore) {
      if (top.length >= TOP_MAX) break;
      if (h.mine === 'none' && top.some((x) => x.mine === 'none')) continue;
      top.push(h);
    }
    // a match the player spent away from the action still shows three cards: the rest of the best fills in
    for (const h of byScore) {
      if (top.length >= TOP_MAX) break;
      if (!top.includes(h)) top.push(h);
    }
    top.sort((a, b) => b.score - a.score || a.start - b.start);
    const funniest =
      unique
        .filter((h) => h.funny >= RULES.funniestMin && !top.includes(h))
        .sort((a, b) => b.funny - a.funny || b.score - a.score || a.start - b.start)[0] ?? null;
    const listSet = new Set<Highlight>([...top, ...(funniest ? [funniest] : [])]);
    for (const h of byScore) {
      if (listSet.size >= LIST_MAX) break;
      listSet.add(h);
    }
    const list = [...listSet].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    // the montage: the top, the Funniest, then the next best; no overlaps, ≤ 5, ≤ 30 s
    const order = [...top, ...(funniest ? [funniest] : []), ...byScore.filter((h) => listSet.has(h))];
    const chosen: Highlight[] = [];
    let sum = 0;
    for (const h of order) {
      if (chosen.length >= MONTAGE_MAX || chosen.includes(h)) continue;
      const [a, b] = segmentOf(h, total, RULES.montageSegMax);
      if (chosen.some((x) => overlap(x, h) > 0)) continue;
      if (sum + (b - a) > RULES.montageMax) continue;
      chosen.push(h);
      sum += b - a;
    }
    const montage = chosen.length >= MONTAGE_MIN ? chosen.sort((a, b) => a.start - b.start).map((h) => h.id) : [];
    return { v: 1, detector: DETECTOR_V, simVersion: this.meta.simVersion, key: this.meta.key, list, top: top.map((h) => h.id), funniest: funniest?.id ?? null, montage };
  }

  private titleCtx(): TitleCtx {
    return { seed: this.meta.seed, names: this.meta.names, bots: this.meta.bots, vsBots: this.meta.vsBots, teams: this.meta.teams ?? ['Purrhaven', 'Woof'], me: this.me };
  }

  /** Camera keys every 2 s: a fight's centre and spread, or one hero's spot. */
  private camFor(c: Cand, mine: Highlight['mine']): Highlight['cam'] {
    const keys: CamKey[] = [];
    if (c.frame) {
      const who = uniq([...c.actors, ...c.victims, ...c.group]);
      for (let t = c.start; t <= c.end; t += KEY_EVERY) {
        const s = Math.min(this.secs - 1, Math.floor(t / HZ));
        const pts = (who.length ? who : allSlots(this.S)).filter((h) => !this.benched[h]).map((h) => [this.posX[s * this.S + h], this.posY[s * this.S + h]] as const);
        if (!pts.length) continue;
        // the frame leans on the living: heroes waiting at the fountain would stretch it across the map
        const cx = Math.round(median(pts.map((p) => p[0])));
        const cy = Math.round(median(pts.map((p) => p[1])));
        const close = pts.filter((p) => d2(p[0], p[1], cx, cy) <= 300 * 300);
        const r = Math.max(FRAME_MIN / 100, ...close.map((p) => Math.round(Math.sqrt(d2(p[0], p[1], cx, cy))) + FRAME_PAD / 100));
        keys.push([t, cx, cy, r]);
      }
      return { mode: 'frame', keys };
    }
    const slot = mine === 'actor' ? this.me : (c.actors[0] ?? c.victims[0] ?? this.me);
    for (let t = c.start; t <= c.end; t += KEY_EVERY) {
      const s = Math.min(this.secs - 1, Math.floor(t / HZ));
      keys.push([t, this.posX[s * this.S + slot], this.posY[s * this.S + slot], FRAME_MIN / 100]);
    }
    return { mode: 'follow', slot, keys };
  }
}

/** Probes come every SAMPLE ticks: "6 s before" matches within this. */
const SAMPLE_SLACK = 5;

const uniq = (a: number[]): number[] => [...new Set(a)];
const allSlots = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const median = (v: number[]): number => {
  const s = v.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const overlap = (a: { start: number; end: number }, b: { start: number; end: number }): number => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/** A window clamped to 6..20 s (grown around the peak, or its lead cut) inside [0, total]. Pure. */
export function clampWindow(start: number, end: number, peak: number, total: number): [number, number] {
  let a = Math.max(0, start);
  let b = Math.min(total, Math.max(end, a + 1));
  if (b - a < RULES.minTicks) {
    const need = RULES.minTicks - (b - a);
    a -= Math.ceil(need * 0.6);
    b += need - Math.ceil(need * 0.6);
    if (a < 0) {
      b -= a;
      a = 0;
    }
    if (b > total) {
      a = Math.max(0, a - (b - total));
      b = total;
    }
  }
  if (b - a > RULES.maxTicks) [a, b] = segmentOf({ start: a, end: b, peak }, total, RULES.maxTicks);
  return [a, b];
}
