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
import { SLOT_COUNT, SLOTS_PER_TEAM, type HeroId, type PingKind, type SimEvent } from '../sim/api';
import { HEAL_BARK, PING_TEXT } from '../ui/pingText';
import { FISH } from '../data/fish';
import { TOY_TIERS } from '../data/toys';
import { gearedLine, toyToast } from '../ui/toyText';
import { isCampBuff, isFun, isNineLives, tickOf, type AnyEvent, type FunEvent } from './feelEvents';
import { bountyLine, onRollLine, type VoiceKey } from '../audio/voiceLines';

export type MomentTone = 'good' | 'bad' | 'gold' | 'info';
export type CrowdSfx = 'cheer' | 'roar' | 'gasp' | 'ooh';

export interface Moment {
  key: string;
  title: string;
  sub?: string;
  tone: MomentTone;
  /**
   * banner = the big line at the top, callout = the word over the middle, pop = text over the player's hero, bark = an
   * allied bot's line over that bot (`slot`).
   */
  size: 'banner' | 'callout' | 'pop' | 'ping' | 'bark';
  /** bark: the allied bot slot that says it (the session tries the other ally when this one is down or off screen). */
  slot?: number;
  /** GAPS B1 ping: where it points (mm), for the minimap and ground markers, and its marker colour. */
  at?: { x: number; y: number; color: string };
  slowmo?: { ms: number; scale: number };
  shake?: number;
  crowd?: CrowdSfx;
  /** For the results screen's "best moment" (higher is better). */
  rank?: number;
  /** LoL pass (lane B): drawn big on the rail on desktop (a crest and a light sweep). */
  big?: boolean;
  /** LoL pass (lane B): the hero slot whose portrait is the rail badge ("You have been slain" shows the killer). */
  face?: number;
  /** LoL pass (lane B): the announcer voice line (audio/voice.ts), said after the sting. */
  voice?: VoiceKey;
  /** Lane F: the match tick it happened on (the progression rail merges a buy and a level-up by it). */
  tick?: number;
  /** Lane F (buy): the Toy tier bought and its parts for the progression rail. */
  toy?: { tier: number; name: string; head: string; sub: string };
}

/** LoL pass (lane B): the voice lines (audio/voiceLines.ts). Recorded clips live in public/voice/<key>.mp3. */
export type { VoiceKey };
const MULTI_VOICE: Readonly<Record<number, VoiceKey>> = Object.freeze({ 2: 'double', 3: 'triple', 4: 'catastrophe' });

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
  /** GAPS A6: at most one ally bark in this many ticks (8 s), so a teamfight is not a wall of text. */
  bark: 240,
  /** "They took the Frenzy" is said at most once in this many ticks (90 s). */
  frenzyVoice: 2700,
});

/** GAPS A6: allied bots cheer the player's takedowns and assists (fixed lines, chosen in turn: no randomness). */
export const BARKS = Object.freeze({
  kill: ['Nice one!', 'Great paws!', 'Purr-fect!', 'Go, go, go!', 'What a play!'],
  assist: ['Thanks for the help!', 'Teamwork!', 'Got your back!', 'We did it together!'],
});

/** Lane F (F4): a streak of 5 is "On the Prowl"; 6 and more "Legend-dairy". */
export const STREAK_NAMES: Readonly<Record<number, string>> = Object.freeze({ 3: 'On a Roll', 4: 'Unstoppa-paw', 5: 'On the Prowl', 6: 'Legend-dairy' });
/** The highest STREAK_NAMES step. */
const STREAK_TOP = 6;
export const MULTI_NAMES: Readonly<Record<number, string>> = Object.freeze({ 2: 'Double Pounce', 3: 'Triple Pounce', 4: 'Cat-astrophe' });

// sim v19: the bound map's slot counts (app/mapBinding.ts useMap: 3 a side, or 5 on Hearthwood)
const isHero = (id: number): boolean => id >= 0 && id < SLOT_COUNT;
const teamOf = (id: number): number => (id < SLOTS_PER_TEAM ? 0 : 1);

export interface AnnouncerNames {
  /** Display name of a hero slot ("Sage", "Sir Brutus"). */
  (slot: number): string;
}

/**
 * LoL pass (lane B): an Ace is all three heroes of a team down at once. `victim` just died; `down(slot)` says whether
 * another hero of that team is out right now (the snapshot's `state === 'dead'`). Pure; exported for tests.
 */
export function isAce(victim: number, down: (slot: number) => boolean): boolean {
  if (!isHero(victim)) return false;
  const base = teamOf(victim) * SLOTS_PER_TEAM;
  for (let s = base; s < base + SLOTS_PER_TEAM; s++) if (s !== victim && !down(s)) return false;
  return true;
}

/** LoL pass (lane B): an ally's knockout is not called when one of ours took a hero down this close to it (ticks). */
export const ALLY_SLAIN_QUIET = 45;
/** LoL pass (lane B): without a snapshot, a hero counts as down for this long after its death (ticks; the shortest respawn). */
export const DOWN_FALLBACK = 180;

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
  /** The last tick "They took the Frenzy" was said (the callout shows every time). */
  private frenzyVoiceAt = -1e9;
  private nineSeen = 0;
  private barkAt = -1e9;
  private barks = 0;
  /** GAPS B1: the kind of the last ping (the `bark` that answers it follows in the same tick). */
  private pingKind: PingKind = 'goHere';
  /** Pings sent and allied answers that took one (results, analytics). */
  pings = 0;
  pingsTaken = 0;

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
  /** Aces seen per team (0 ours wiped, 1 theirs) for the results. */
  aces = 0;
  /**
   * LoL pass (lane B): is hero `slot` out right now (the session reads the latest snapshot)? Without it, a death in
   * the last DOWN_FALLBACK ticks counts.
   */
  down: ((slot: number) => boolean) | null = null;
  private readonly diedAt = [-1e9, -1e9, -1e9, -1e9, -1e9, -1e9];
  /** An Ace was called for this team and not all of it has been back since. */
  private readonly aced = [false, false];
  /** The last tick one of ours took an enemy hero down (the ally-slain line keeps quiet near it). */
  private ourTakedownAt = -1e9;

  constructor(
    readonly mySlot: number,
    readonly myTeam: number,
    private readonly name: AnnouncerNames = (s) => `Slot ${s}`,
    /** Lane F: the hero in a slot (Toy names); without it the buy line is skipped. */
    private readonly heroOf: (slot: number) => HeroId | undefined = () => undefined,
  ) {}

  /** Lane F (F4): enemy knockouts the player took part in, each within WINDOW.multikill of the last (Clean Sweep). */
  private sweep = { n: 0, last: -1e9, ids: 0 };
  /** Toy buys seen (results). */
  toysBought = 0;

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
      case 'buy':
        return this.buy(ev);
      case 'pudding':
        if (ev.what === 'calmed' && ev.team === this.myTeam) {
          this.pudding = true;
          this.note({ key: 'pudding', title: 'Pudding calmed', tone: 'good', size: 'banner', rank: 12 });
        }
        return [];
      // GAPS B1: the player's ping (a minimap and ground marker), and the allies' answers (text chosen here)
      case 'ping': {
        this.pingKind = ev.kind;
        this.pings++;
        const t = PING_TEXT[ev.kind];
        return [{ key: 'ping', title: t.label, tone: 'info', size: 'ping', at: { x: ev.x, y: ev.y, color: t.color }, slot: ev.target }];
      }
      case 'bark': {
        const heal = ev.what === 'heal';
        if (!heal) this.pingsTaken++;
        return [{ key: heal ? 'barkHeal' : 'barkPing', title: heal ? HEAL_BARK : PING_TEXT[this.pingKind].ack, tone: heal ? 'bad' : 'good', size: 'bark', slot: ev.id }];
      }
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
    this.diedAt[e.id] = this.tick;
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
    // First Blood, inferred: the match's first hero knockout by a hero. A knockout by a tower or minion does not use it
    // up here: the sim's own `firstBlood` event (credited to a hero that helped, or to the victim's enemies) calls it,
    // so the line is never skipped (audio fix: 2 of 4 matches never said "First Blood")
    if (this.firstBloodAt < 0 && killerHero) {
      this.firstBloodAt = this.tick;
      out.push(this.firstBlood(e.killer, e.id));
    }
    if (killerHero && teamOf(e.killer) === this.myTeam) this.ourTakedownAt = this.tick;
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
            big: true,
            voice: MULTI_VOICE[n],
          }),
        );
      }
      // streak (First Blood already covers a streak of 1)
      const s = this.streak[this.mySlot];
      if (s >= 3) {
        const k = Math.min(STREAK_TOP, s);
        // LoL pass (lane B): the killing-spree tiers are announcer lines (rail prio 2, big), not personal callouts
        out.push(this.note({ key: `streak${k}`, title: STREAK_NAMES[k], sub: s > STREAK_TOP ? `${s} in a row` : undefined, tone: 'gold', size: 'banner', big: true, crowd: 'cheer', rank: k >= 5 ? 35 : k === 4 ? 28 : 22, voice: `streak${k}` as VoiceKey }));
      }
      if (!out.some((m) => m.key.startsWith('multi') || m.key === 'firstBlood')) out.push({ key: 'takedown', title: 'Takedown!', tone: 'gold', size: 'callout', crowd: 'cheer' });
    } else if (killerHero && teamOf(e.killer) === this.myTeam && !out.length) {
      out.push({ key: 'allyTakedown', title: assist ? 'Assist!' : 'Takedown', tone: 'good', size: 'callout', crowd: 'cheer' });
    }
    if (mine || assist) {
      const b = this.bark(mine, e.killer);
      if (b) out.push(b);
    }
    if (killerHero && teamOf(e.killer) !== this.myTeam && this.streak[e.killer] === 3) {
      const hero = this.heroOf(e.killer);
      out.push({ key: 'enemyStreak', title: `${this.name(e.killer)} is on a roll`, sub: 'Take them down for a bounty.', tone: 'bad', size: 'banner', ...(hero ? { voice: onRollLine(hero) } : {}) });
    }
    // LoL pass (lane B): the slain lines ("Enemy slain" is the Takedown callout's job)
    if (e.id === this.mySlot) {
      out.push({ key: 'slain', title: 'You have been slain', sub: killerHero ? `${this.name(e.killer)} got you.` : undefined, tone: 'bad', size: 'banner', ...(killerHero ? { face: e.killer } : {}), voice: 'slain' });
    } else if (teamOf(e.id) === this.myTeam && this.tick - this.ourTakedownAt > ALLY_SLAIN_QUIET) {
      out.push({ key: 'allySlain', title: 'An ally has been slain', sub: `${this.name(e.id)} is down.`, tone: 'bad', size: 'banner', face: e.id, voice: 'allySlain' });
    }
    // Lane F (F4): the player took part (a kill or an assist) in all three enemy knockouts, each within the multikill
    // window of the last: "Clean Sweep!" (a personal line beside the team's ACE)
    if ((mine || assist) && teamOf(e.id) !== this.myTeam) {
      if (this.tick - this.sweep.last > WINDOW.multikill) this.sweep = { n: 0, last: this.tick, ids: 0 };
      this.sweep.n++;
      this.sweep.last = this.tick;
      this.sweep.ids |= 1 << e.id;
      const all = ((1 << SLOTS_PER_TEAM) - 1) << (teamOf(e.id) * SLOTS_PER_TEAM);
      if ((this.sweep.ids & all) === all) {
        this.sweep.ids = 0;
        out.push(this.note({ key: 'cleanSweep', title: 'Clean Sweep!', sub: SLOTS_PER_TEAM === 5 ? 'You took all five down in a row.' : 'You took all three down in a row.', tone: 'gold', size: 'callout', crowd: 'roar', rank: 46, voice: 'cleanSweep' }));
      }
    }
    const ace = this.aceCheck(e.id);
    if (ace) out.push(ace);
    return out;
  }

  /** Is hero `slot` out now: the session's snapshot read, else a death in the last DOWN_FALLBACK ticks. */
  private isDown(slot: number): boolean {
    // a death in the last few ticks counts even when the snapshot read still shows the hero up (same-tick kills)
    const ago = this.tick - this.diedAt[slot];
    if (ago <= WINDOW.same) return true;
    return this.down ? this.down(slot) : ago <= DOWN_FALLBACK;
  }

  /** LoL pass (lane B): all three of the victim's team are down: "ACE!" (theirs) or "Enemy team ACE" (ours). Once per wipe. */
  private aceCheck(victim: number): Moment | null {
    const team = teamOf(victim);
    if (!isAce(victim, (s) => this.isDown(s))) {
      this.aced[team] = false;
      return null;
    }
    if (this.aced[team]) return null;
    this.aced[team] = true;
    this.aces++;
    const theirs = team !== this.myTeam;
    return this.note(
      theirs
        ? { key: 'ace', title: 'ACE!', sub: 'Their whole team is down: push!', tone: 'gold', size: 'banner', big: true, crowd: 'roar', shake: 0.3, rank: 45, voice: 'ace' }
        : { key: 'aceThem', title: 'Enemy team ACE', sub: 'Our whole team is down: hold on.', tone: 'bad', size: 'banner', big: true, crowd: 'gasp', voice: 'aceUs' },
    );
  }

  /**
   * GAPS A6: an allied bot's cheer on the player's takedown (an ally speaks, in turn) or assist (the ally who made the
   * kill thanks the player). At most one per WINDOW.bark; never on an enemy's takedown.
   */
  private bark(mine: boolean, killer: number): Moment | null {
    if (this.tick - this.barkAt < WINDOW.bark) return null;
    const allies = Array.from({ length: SLOTS_PER_TEAM }, (_, k) => this.myTeam * SLOTS_PER_TEAM + k).filter((s) => s !== this.mySlot);
    if (!allies.length) return null;
    const ally = !mine && allies.includes(killer) ? killer : allies[this.barks % allies.length];
    const lines = mine ? BARKS.kill : BARKS.assist;
    const title = lines[this.barks % lines.length];
    this.barks++;
    this.barkAt = this.tick;
    return { key: mine ? 'barkKill' : 'barkAssist', title, tone: 'good', size: 'bark', slot: ally };
  }

  /** `killer` may be a tower or minion (or −1): then the team that knocked `victim` out drew first blood. */
  private firstBlood(killer: number, victim: number): Moment {
    const mine = killer === this.mySlot;
    const byHero = isHero(killer);
    const ours = byHero ? teamOf(killer) === this.myTeam : isHero(victim) && teamOf(victim) !== this.myTeam;
    return this.note({
      key: 'firstBlood',
      // Lane F (F4): the player's First Blood says what it paid (the kill and its bonus, from data/fish.ts)
      title: mine ? `First Blood! +${FISH.kill + FISH.firstBlood} Fish` : 'First Blood!',
      sub: mine ? 'You drew first blood.' : ours ? (byHero ? `${this.name(killer)} drew first blood.` : 'We drew first blood.') : 'They drew first blood.',
      tone: mine ? 'gold' : ours ? 'good' : 'bad',
      size: 'banner',
      slowmo: { ms: 400, scale: 0.4 },
      shake: mine ? 0.3 : 0.15,
      crowd: ours ? 'cheer' : 'gasp',
      rank: mine ? 20 : 0,
      big: true,
      voice: 'firstBlood',
    });
  }

  private shutdown(killer: number, victim: number, value: number, fish = 0): Moment {
    const mine = killer === this.mySlot;
    // killer −1: a tower or minion ended it (sim v4), on the victim's enemies' side
    const ours = killer >= 0 ? teamOf(killer) === this.myTeam : teamOf(victim) !== this.myTeam;
    if (mine) this.shutdowns++;
    return this.note({
      key: 'shutdown',
      title: mine && fish > 0 ? `Shut down! +${fish} Fish` : 'Shut down!',
      sub: mine ? (value > 0 ? `+${value} XP` : `You stopped ${this.name(victim)}.`) : ours ? `${this.name(killer)} stopped ${this.name(victim)}.` : victim === this.mySlot ? 'They ended your streak.' : `${this.name(victim)} was stopped.`,
      tone: ours ? 'gold' : 'bad',
      size: 'banner',
      crowd: ours ? 'roar' : 'gasp',
      shake: mine ? 0.3 : 0,
      rank: mine ? 30 : 0,
      big: true,
      voice: 'shutdown',
    });
  }

  /**
   * Lane F (F2): a Toy bought. The player's own: a 'buy' moment for the progression rail (merged with a level-up), a
   * ring burst and the buy sound. An enemy's last tier: "Rex is fully geared up". Other buys show only as scoreboard
   * pips (the snapshot's `toy`).
   */
  private buy(e: Extract<SimEvent, { type: 'buy' }>): Moment[] {
    if (!isHero(e.id)) return [];
    const hero = this.heroOf(e.id);
    if (e.id === this.mySlot) {
      this.toysBought++;
      if (!hero) return [];
      const t = toyToast(hero, e.tier);
      return [{ key: 'buy', title: t.title, sub: t.sub, tone: 'gold', size: 'banner', tick: this.tick, toy: { tier: e.tier, name: t.name, head: t.head, sub: t.sub }, rank: e.tier >= TOY_TIERS ? 10 : 0 }];
    }
    if (teamOf(e.id) !== this.myTeam && e.tier >= TOY_TIERS) return [{ key: 'geared', title: gearedLine(this.name(e.id)), tone: 'bad', size: 'banner', tick: this.tick, voice: 'geared' }];
    return [];
  }

  private fun(e: FunEvent): Moment[] {
    switch (e.type) {
      case 'firstBlood':
        if (this.firstBloodAt >= 0) return [];
        this.firstBloodAt = this.tick;
        return [this.firstBlood(e.killer, e.victim)];
      case 'shutdown': {
        if (this.lastShutdown.victim === e.victim && Math.abs(this.tick - this.lastShutdown.tick) <= WINDOW.same) {
          // already announced from the death: only the XP and (sim v12) Fish are new. The Fish goes onto the same rail
          // item ("Shut down! +160 Fish", key 'shutdown'), the XP over the hero.
          const out: Moment[] = [];
          const fish = (e as { fish?: number }).fish ?? 0;
          if (e.killer === this.mySlot && fish > 0) out.push({ key: 'shutdownFish', title: `Shut down! +${fish} Fish`, tone: 'gold', size: 'banner', big: true });
          if (e.killer === this.mySlot && e.value > 0) out.push({ key: 'shutdownXp', title: `+${e.value} XP`, tone: 'gold', size: 'pop' });
          return out;
        }
        this.lastShutdown = { victim: e.victim, tick: this.tick };
        return [this.shutdown(e.killer, e.victim, e.value, (e as { fish?: number }).fish ?? 0)];
      }
      case 'bounty': {
        if (!isHero(e.id)) return [];
        const had = this.bountyValue[e.id] > 0 || this.streak[e.id] >= 3;
        this.bountyValue[e.id] = Math.max(0, e.value);
        if (had) return [];
        if (e.id === this.mySlot) return [{ key: 'bountyMe', title: 'You have a bounty!', sub: 'Stay alive: they want your crown.', tone: 'gold', size: 'banner', voice: 'bountyMe' }];
        if (teamOf(e.id) !== this.myTeam) {
          const hero = this.heroOf(e.id);
          return [{ key: 'bounty', title: `Bounty on ${this.name(e.id)}!`, sub: e.value > 0 ? `Take them down: +${e.value} XP` : 'Take them down for extra XP.', tone: 'gold', size: 'banner', ...(hero ? { voice: bountyLine(hero) } : {}) }];
        }
        return [];
      }
      case 'comeback':
        // no rank: the rubber-band waves are not the player's best moment (it showed on 4-15 losses)
        return e.team === this.myTeam
          ? // Fun pass (playtest #8): "COMEBACK!" read as a promise while the team was down 4-13; the phone title says
            // what happens (phones drop the sub)
            [{ key: 'comeback', title: 'Our waves get stronger', sub: 'We are behind on towers: our next 2 waves hit harder.', tone: 'gold', size: 'banner', voice: 'comebackUs' }]
          : [{ key: 'comebackThem', title: 'Their waves get stronger', sub: 'Their next 2 waves hit harder. Hold the line.', tone: 'bad', size: 'banner', voice: 'comebackThem' }];
      case 'pickupSpawn':
        // the first spawn of a match is a banner; later ones only ping the minimap (24 of 68 banners were Frenzy)
        if (e.kind !== 'frenzy') return [];
        return this.frenzySpawns++ === 0
          ? [{ key: 'frenzySpawn', title: 'Frenzy Catnip spawned!', sub: 'In the river: more damage and speed.', tone: 'gold', size: 'banner', voice: 'frenzySpawn' }]
          : [{ key: 'frenzySpawn', title: 'Frenzy Catnip', tone: 'gold', size: 'ping' }];
      case 'pickup':
        if (e.id === this.mySlot) {
          this.pickups++;
          return [{ key: `pickup-${e.kind}`, title: e.kind === 'frenzy' ? '+FRENZY' : '+SNACK', tone: e.kind === 'frenzy' ? 'gold' : 'good', size: 'pop', crowd: e.kind === 'frenzy' ? 'cheer' : undefined }];
        }
        if (e.kind === 'frenzy' && teamOf(e.id) !== this.myTeam) {
          // audio fix (Nov 9): said 9 to 15 times a match it crowded out bounty and core lines; the callout stays
          const say = this.tick - this.frenzyVoiceAt >= WINDOW.frenzyVoice;
          if (say) this.frenzyVoiceAt = this.tick;
          return [{ key: 'frenzyThem', title: 'They took the Frenzy!', tone: 'bad', size: 'callout', ...(say ? { voice: 'frenzyThem' as const } : {}) }];
        }
        return [];
      case 'buff':
        if (isNineLives(e) && e.id === this.mySlot) {
          // Round 2: a centre "Nine Lives" banner just before a death read like a save that did not work, and the word
          // meant nothing to a new player. Now a plain verb over the hero (and the white rim flash): never a banner.
          return [{ key: 'nineLives', title: this.nineSeen++ === 0 ? 'Big hits softened: run!' : 'Run!', tone: 'gold', size: 'pop', crowd: 'ooh' }];
        }
        if (isCampBuff(e) && e.id === this.mySlot) return [{ key: 'pack', title: 'Pack power!', sub: 'The rat camp gives your team +15% damage.', tone: 'good', size: 'banner', crowd: 'cheer', voice: 'packPower' }];
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
