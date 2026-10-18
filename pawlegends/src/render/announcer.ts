/**
 * The announcer (fun plan F2 items 3, 4, 5, 7, 8, 10, 11): turns the event stream into "moments" (First Blood,
 * streaks, multikills, shutdowns, bounties, comebacks, combos, pickups, Nine Lives) and remembers the match's best
 * moment and a few timings for the results screen and analytics. Pure: no DOM, no three, no clock of its own (it
 * reads the event ticks), so a scripted event stream drives it in a unit test. The match session turns each moment
 * into a banner, callout, slow-mo, shake and crowd sound.
 *
 * Works with or without the fun-plan sim events: First Blood, streaks, shutdowns and the bounty crown are also
 * inferred from `death` events, and a sim `firstBlood` / `shutdown` / `bounty` for the same kill is not announced twice.
 */
import type { SimEvent } from '../sim/api';
import { isCampBuff, isFun, isNineLives, tickOf, type AnyEvent, type FunEvent } from './feelEvents';

export type MomentTone = 'good' | 'bad' | 'gold' | 'info';
export type CrowdSfx = 'cheer' | 'roar' | 'gasp' | 'ooh';

export interface Moment {
  key: string;
  title: string;
  sub?: string;
  tone: MomentTone;
  /** banner = the big line at the top, callout = the word over the middle, pop = text over the player's hero. */
  size: 'banner' | 'callout' | 'pop' | 'ping';
  slowmo?: { ms: number; scale: number };
  shake?: number;
  crowd?: CrowdSfx;
  /** For the results screen's "best moment" (higher is better). */
  rank?: number;
}

/** Ticks (30 Hz). */
export const WINDOW = Object.freeze({
  /** Multikill chain: each kill within 8 s of the last. */
  multikill: 240,
  /** Ability then a basic attack on the same target. */
  comboBasic: 45,
  /** Two abilities landing. */
  comboAbility: 30,
  /** An assist: the player hit the victim in the last 10 s. */
  assist: 300,
  /** Sim shutdown / first blood events within this many ticks of an inferred one are the same kill. */
  same: 6,
});

export const STREAK_NAMES: Readonly<Record<number, string>> = Object.freeze({ 3: 'On a Roll', 4: 'Unstoppa-paw', 5: 'Legend-dairy' });
export const MULTI_NAMES: Readonly<Record<number, string>> = Object.freeze({ 2: 'Double Pounce', 3: 'Triple Pounce', 4: 'Cat-astrophe' });

const isHero = (id: number): boolean => id >= 0 && id < 6;
const teamOf = (id: number): number => (id < 3 ? 0 : 1);

export interface AnnouncerNames {
  /** Display name of a hero slot ("Sage", "Sir Brutus"). */
  (slot: number): string;
}

export class Announcer {
  private tick = 0;
  /** Kills since death, per hero slot (local streak, also drives the bounty crown without sim events). */
  private readonly streak = [0, 0, 0, 0, 0, 0];
  /** Sim bounty values per slot (0 = none). */
  private readonly bountyValue = [0, 0, 0, 0, 0, 0];
  private firstBloodAt = -1;
  private lastShutdown = { victim: -1, tick: -1e9 };
  private multi = { n: 0, last: -1e9 };
  private combo = { n: 0, last: -1e9, abilityTick: -1e9 };
  private readonly abilityOn = new Map<number, number>();
  private readonly myHitOn = new Map<number, number>();
  private best: Moment | null = null;
  private frenzySpawns = 0;
  private nineSeen = 0;

  /** First takedown (kill or assist) by the player, in ticks, or -1. */
  firstTakedownTick = -1;
  /** The tick the player reached level 4, or -1. */
  level4Tick = -1;
  takedowns = 0;
  kills = 0;
  deaths = 0;
  combos = 0;
  pickups = 0;
  biggestMulti = 0;
  shutdowns = 0;
  /** Our team calmed Pudding at least once. */
  pudding = false;

  constructor(
    readonly mySlot: number,
    readonly myTeam: number,
    private readonly name: AnnouncerNames = (s) => `Slot ${s}`,
  ) {}

  /** Bounty crown per slot: the sim value, or 1 for a 3+ streak seen locally (0 = no crown). */
  bounty(slot: number): number {
    if (!isHero(slot)) return 0;
    return this.bountyValue[slot] > 0 ? this.bountyValue[slot] : this.streak[slot] >= 3 ? 1 : 0;
  }

  /** The best moment of the match so far (results screen), or null. */
  get bestMoment(): Moment | null {
    return this.best;
  }

  private note(m: Moment): Moment {
    if ((m.rank ?? 0) > 0 && (!this.best || (m.rank ?? 0) > (this.best.rank ?? 0))) this.best = m;
    return m;
  }

  /** Feed one event; returns the moments to show (often none). */
  feed(e: AnyEvent | { type: string; tick?: number }): Moment[] {
    this.tick = tickOf(e as { tick?: number }, this.tick);
    const ev = e as AnyEvent;
    if (isFun(ev)) return this.fun(ev);
    switch (ev.type) {
      case 'hit':
        return this.hit(ev);
      case 'death':
        return this.death(ev);
      case 'levelup':
        if (ev.id === this.mySlot && ev.level >= 4 && this.level4Tick < 0) this.level4Tick = this.tick;
        return [];
      case 'pudding':
        if (ev.what === 'calmed' && ev.team === this.myTeam) {
          this.pudding = true;
          this.note({ key: 'pudding', title: 'Pudding calmed', tone: 'good', size: 'banner', rank: 12 });
        }
        return [];
      default:
        return [];
    }
  }

  private hit(e: Extract<SimEvent, { type: 'hit' }>): Moment[] {
    if (e.src !== this.mySlot || !isHero(e.dst) || teamOf(e.dst) === this.myTeam) return [];
    this.myHitOn.set(e.dst, this.tick);
    if (e.kind !== 'ability' && e.kind !== 'basic') return [];
    let up = false;
    if (e.kind === 'ability') {
      // one landing per tick (an area ability hitting two heroes is one landing)
      if (this.tick !== this.combo.abilityTick) {
        // two abilities within 1 s, or an ability that keeps a running combo going
        if (this.tick - this.combo.abilityTick <= WINDOW.comboAbility || (this.combo.n >= 2 && this.tick - this.combo.last <= WINDOW.comboBasic)) up = true;
        this.combo.abilityTick = this.tick;
      }
      this.abilityOn.set(e.dst, this.tick);
    } else {
      const at = this.abilityOn.get(e.dst);
      if (at !== undefined && this.tick - at <= WINDOW.comboBasic) {
        up = true;
        this.abilityOn.delete(e.dst);
      }
    }
    if (!up) {
      if (this.tick - this.combo.last > WINDOW.comboBasic) this.combo.n = 1;
      return [];
    }
    this.combo.n = this.tick - this.combo.last <= WINDOW.comboBasic ? this.combo.n + 1 : 2;
    this.combo.last = this.tick;
    this.combos++;
    return [{ key: `combo${this.combo.n}`, title: `Combo x${this.combo.n}`, tone: 'gold', size: 'pop', shake: 0.06 }];
  }

  private death(e: Extract<SimEvent, { type: 'death' }>): Moment[] {
    if (!isHero(e.id)) return [];
    const out: Moment[] = [];
    const victimStreak = this.streak[e.id];
    const hadBounty = this.bounty(e.id) > 0;
    this.streak[e.id] = 0;
    this.bountyValue[e.id] = 0;
    if (e.id === this.mySlot) {
      this.deaths++;
      this.multi.n = 0;
    }
    const killerHero = isHero(e.killer) && teamOf(e.killer) !== teamOf(e.id);
    const mine = e.killer === this.mySlot;
    const assist = !mine && teamOf(e.id) !== this.myTeam && this.tick - (this.myHitOn.get(e.id) ?? -1e9) <= WINDOW.assist;
    if (mine || assist) {
      this.takedowns++;
      if (this.firstTakedownTick < 0) this.firstTakedownTick = this.tick;
    }
    if (killerHero) this.streak[e.killer]++;
    // First Blood: the match's first hero knockout, when a hero made it (round 1: "First Blood!" at 2:15 with the
    // score already 3 to 2, because the earlier knockouts were by towers and minions)
    if (this.firstBloodAt < 0) {
      this.firstBloodAt = this.tick;
      if (killerHero) out.push(this.firstBlood(e.killer));
    }
    if (killerHero && hadBounty && victimStreak >= 3) {
      this.lastShutdown = { victim: e.id, tick: this.tick };
      out.push(this.shutdown(e.killer, e.id, 0));
    }
    if (mine) {
      this.kills++;
      // multikill chain
      this.multi.n = this.tick - this.multi.last <= WINDOW.multikill ? this.multi.n + 1 : 1;
      this.multi.last = this.tick;
      if (this.multi.n >= 2) {
        const n = Math.min(4, this.multi.n);
        this.biggestMulti = Math.max(this.biggestMulti, this.multi.n);
        out.push(
          this.note({
            key: `multi${n}`,
            title: MULTI_NAMES[n],
            tone: 'gold',
            size: 'banner',
            shake: 0.4,
            crowd: n >= 3 ? 'roar' : 'cheer',
            slowmo: n >= 3 ? { ms: 600, scale: 0.3 } : undefined,
            rank: n >= 4 ? 50 : n === 3 ? 40 : 25,
          }),
        );
      }
      // streak (First Blood already covers a streak of 1)
      const s = this.streak[this.mySlot];
      if (s >= 3) {
        const k = Math.min(5, s);
        out.push(this.note({ key: `streak${k}`, title: STREAK_NAMES[k], sub: s > 5 ? `${s} in a row` : undefined, tone: 'gold', size: 'callout', crowd: 'cheer', rank: k === 5 ? 35 : k === 4 ? 28 : 22 }));
      }
      if (!out.some((m) => m.key.startsWith('multi') || m.key === 'firstBlood')) out.push({ key: 'takedown', title: 'Takedown!', tone: 'gold', size: 'callout', crowd: 'cheer' });
    } else if (killerHero && teamOf(e.killer) === this.myTeam && !out.length) {
      out.push({ key: 'allyTakedown', title: assist ? 'Assist!' : 'Takedown', tone: 'good', size: 'callout', crowd: 'cheer' });
    }
    if (killerHero && teamOf(e.killer) !== this.myTeam && this.streak[e.killer] === 3) {
      out.push({ key: 'enemyStreak', title: `${this.name(e.killer)} is on a roll`, sub: 'Take them down for a bounty.', tone: 'bad', size: 'banner' });
    }
    return out;
  }

  private firstBlood(killer: number): Moment {
    const mine = killer === this.mySlot;
    const ours = teamOf(killer) === this.myTeam;
    return this.note({
      key: 'firstBlood',
      title: 'First Blood!',
      sub: mine ? 'You drew first blood.' : ours ? `${this.name(killer)} drew first blood.` : 'They drew first blood.',
      tone: mine ? 'gold' : ours ? 'good' : 'bad',
      size: 'banner',
      slowmo: { ms: 400, scale: 0.4 },
      shake: mine ? 0.3 : 0.15,
      crowd: ours ? 'cheer' : 'gasp',
      rank: mine ? 20 : 0,
    });
  }

  private shutdown(killer: number, victim: number, value: number): Moment {
    const mine = killer === this.mySlot;
    // killer −1: a tower or minion ended it (sim v4), on the victim's enemies' side
    const ours = killer >= 0 ? teamOf(killer) === this.myTeam : teamOf(victim) !== this.myTeam;
    if (mine) this.shutdowns++;
    return this.note({
      key: 'shutdown',
      title: 'Shut down!',
      sub: mine ? (value > 0 ? `+${value} XP` : `You stopped ${this.name(victim)}.`) : ours ? `${this.name(killer)} stopped ${this.name(victim)}.` : victim === this.mySlot ? 'They ended your streak.' : `${this.name(victim)} was stopped.`,
      tone: ours ? 'gold' : 'bad',
      size: 'banner',
      crowd: ours ? 'roar' : 'gasp',
      shake: mine ? 0.3 : 0,
      rank: mine ? 30 : 0,
    });
  }

  private fun(e: FunEvent): Moment[] {
    switch (e.type) {
      case 'firstBlood':
        if (this.firstBloodAt >= 0) return [];
        this.firstBloodAt = this.tick;
        return [this.firstBlood(e.killer)];
      case 'shutdown': {
        if (this.lastShutdown.victim === e.victim && Math.abs(this.tick - this.lastShutdown.tick) <= WINDOW.same) {
          // already announced from the death: only the XP line is new
          if (e.killer === this.mySlot && e.value > 0) return [{ key: 'shutdownXp', title: `+${e.value} XP`, tone: 'gold', size: 'pop' }];
          return [];
        }
        this.lastShutdown = { victim: e.victim, tick: this.tick };
        return [this.shutdown(e.killer, e.victim, e.value)];
      }
      case 'bounty': {
        if (!isHero(e.id)) return [];
        const had = this.bountyValue[e.id] > 0 || this.streak[e.id] >= 3;
        this.bountyValue[e.id] = Math.max(0, e.value);
        if (had) return [];
        if (e.id === this.mySlot) return [{ key: 'bountyMe', title: 'You have a bounty!', sub: 'Stay alive: they want your crown.', tone: 'gold', size: 'banner' }];
        if (teamOf(e.id) !== this.myTeam) return [{ key: 'bounty', title: `Bounty on ${this.name(e.id)}!`, sub: e.value > 0 ? `Take them down: +${e.value} XP` : 'Take them down for extra XP.', tone: 'gold', size: 'banner' }];
        return [];
      }
      case 'comeback':
        // no rank: the rubber-band waves are not the player's best moment (it showed on 4-15 losses)
        return e.team === this.myTeam
          ? [{ key: 'comeback', title: 'COMEBACK!', sub: 'Our next waves hit harder.', tone: 'gold', size: 'banner', crowd: 'roar', shake: 0.25 }]
          : [{ key: 'comebackThem', title: 'They are rallying', sub: 'Their next waves hit harder. Hold the line.', tone: 'bad', size: 'banner' }];
      case 'pickupSpawn':
        // the first spawn of a match is a banner; later ones only ping the minimap (24 of 68 banners were Frenzy)
        if (e.kind !== 'frenzy') return [];
        return this.frenzySpawns++ === 0
          ? [{ key: 'frenzySpawn', title: 'Frenzy Catnip in the river!', sub: 'Grab it: more damage and speed.', tone: 'gold', size: 'banner' }]
          : [{ key: 'frenzySpawn', title: 'Frenzy Catnip', tone: 'gold', size: 'ping' }];
      case 'pickup':
        if (e.id === this.mySlot) {
          this.pickups++;
          return [{ key: `pickup-${e.kind}`, title: e.kind === 'frenzy' ? '+FRENZY' : '+SNACK', tone: e.kind === 'frenzy' ? 'gold' : 'good', size: 'pop', crowd: e.kind === 'frenzy' ? 'cheer' : undefined }];
        }
        if (e.kind === 'frenzy' && teamOf(e.id) !== this.myTeam) return [{ key: 'frenzyThem', title: 'They grabbed the Frenzy Catnip', tone: 'bad', size: 'callout' }];
        return [];
      case 'buff':
        if (isNineLives(e) && e.id === this.mySlot) {
          // Round 2: a centre "Nine Lives" banner just before a death read like a save that did not work, and the word
          // meant nothing to a new player. Now a plain verb over the hero (and the white rim flash): never a banner.
          return [{ key: 'nineLives', title: this.nineSeen++ === 0 ? 'Big hits softened: run!' : 'Run!', tone: 'gold', size: 'pop', crowd: 'ooh' }];
        }
        if (isCampBuff(e) && e.id === this.mySlot) return [{ key: 'pack', title: 'Pack power!', sub: 'The rat camp gives your team +15% damage.', tone: 'good', size: 'banner', crowd: 'cheer' }];
        return [];
      default:
        return [];
    }
  }
}

/**
 * "+N XP" pops (F2 item 7): the player's own `xp` events, merged when several land within 8 ticks (≈ 250 ms).
 * `add` collects, `flush(tick)` returns the totals that are due.
 */
export class XpPops {
  private group: { tick: number; amount: number } | null = null;
  total = 0;

  add(amount: number, tick: number): void {
    if (!(amount > 0)) return;
    this.total += amount;
    if (this.group && tick - this.group.tick <= 8) this.group.amount += amount;
    else {
      const prev = this.group;
      this.group = { tick, amount };
      if (prev) this.ready.push(prev.amount);
    }
  }

  private ready: number[] = [];

  /** Totals to show now (group older than 8 ticks at render tick `tick`). */
  flush(tick: number): number[] {
    if (this.group && tick - this.group.tick > 8) {
      this.ready.push(this.group.amount);
      this.group = null;
    }
    const out = this.ready;
    this.ready = [];
    return out;
  }
}
