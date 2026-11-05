/**
 * Objective chips (fun plan F1): the Rookie match's story beats as a chip under the score bar, each with a world
 * arrow the match session points at the beat's target (the lane, a minion, the scripted dog, Pudding, the next
 * tower). One chip at a time; a beat that comes while another is up waits in a queue. Each hides when done or when
 * its time runs out, and fires at most once a match. `lite` (matches 2 and 3) keeps only Ultimate and Pudding.
 * The DOM part is optional (null parent in node tests).
 *
 * LoL pass (lane A): there is no chip of its own any more. The standing goal is the top rail's resting `goal` line
 * (ui/notify.ts; a tap on it still names the objective), and a beat is the resting line while it runs (with its how-to
 * on desktop; on phones a short prio 4 note says the how-to first), so nothing sits under the score bar on its own.
 *
 * GAPS A4: between beats (and in every match from the fourth) the chip shows the next objective with its timer
 * ("Pudding in 0:42", "Calm Pudding!", "Escort: 1,840 HP", "Your rats 0:18", "Sunset in 1:10", "Sudden Death in
 * 0:45"), from `ObjectiveClock`: snapshots and events only, no sim change. The enemy camp's timer shows only once a
 * clear of it was seen (a `buff` 'pack' event on a hero we can see, as in WR and MLBB). The chip is tappable; the
 * tap names the objective (`onTap`) and the session sends its ping (GAPS B1, ui/pingText.ts chipPing).
 */
import { icon } from '../ui/icons';
import type { NotifyLike } from '../ui/notify';
import { savedPadMode, type PadMode } from './tips';
import type { GuideMode } from '../app/firstSession';
import type { EntitySnap, MatchClock, SimEvent } from '../sim/api';
import { RAT_CAMP_STATS } from '../data/camps';
import { MAP, mirrorX, PUDDING_SPOT, RAT_CAMP } from '../data/map';
import { PUDDING } from '../data/pudding';
import { TICK_HZ, TIMELINE } from '../data/timeline';

export type BeatId = 'lane' | 'minions' | 'dog' | 'ult' | 'pudding' | 'push' | 'sunset';

export interface BeatText {
  title: string;
  sub: string;
  icon: Parameters<typeof icon>[0];
}

export interface BeatNames {
  q: string;
  r: string;
}

const LITE: readonly BeatId[] = ['ult', 'pudding'];

/** Seconds a beat stays up when the player does not do it. */
export const BEAT_TTL: Readonly<Record<BeatId, number>> = Object.freeze({ lane: 22, minions: 16, dog: 14, ult: 14, pudding: 30, push: 9, sunset: 9 });

export function beatText(id: BeatId, touch: boolean, n: BeatNames = { q: 'Q', r: 'R' }, pad: PadMode = savedPadMode()): BeatText {
  // Same wording rule as the tips: name both buttons while Auto trackpad detection still watches.
  const click = pad === null ? 'Click or right-click' : pad ? 'Click' : 'Right-click';
  switch (id) {
    case 'lane':
      return { title: 'Run to the lane!', sub: touch ? 'Drag left to follow the arrow' : `${click} along the arrow`, icon: 'paw' };
    case 'minions':
      return { title: 'Hit minions', sub: touch ? 'Tap ATK next to the dog minions' : `${click} a dog minion`, icon: 'sword' };
    case 'dog':
      return { title: touch ? `A dog! Tap ${n.q}` : 'A dog! Press Q', sub: 'Your abilities do most of your damage', icon: 'sword' };
    case 'ult':
      return { title: 'ULTIMATE READY', sub: touch ? `Tap ${n.r} near the enemy` : 'Press R near the enemy', icon: 'crown' };
    case 'pudding':
      // damage fills his calm meter and the last hit calms him (sim/units/pudding.ts): standing near him does nothing
      return { title: 'Calm Pudding!', sub: touch ? 'Tap ATK on him in the river' : 'Hit him in the river: the last hit calms him', icon: 'heart' };
    case 'push':
      return { title: 'Push with your minions', sub: 'Walk in behind them: the tower hits them first', icon: 'shield' };
    case 'sunset':
      return { title: 'Sunset! Push their core', sub: 'Towers crumble faster now: finish them!', icon: 'sun' };
  }
}

/** A standing chip: words, an icon and (GAPS A4) the objective key a tap names. */
export interface StandingText extends BeatText {
  key?: string;
}

export class Objectives {
  private active: { id: BeatId; left: number } | null = null;
  private readonly fired = new Set<BeatId>();
  private readonly done = new Set<BeatId>();
  private queue: BeatId[] = [];
  readonly completed: BeatId[] = [];
  touch = false;
  names: BeatNames = { q: 'Q', r: 'R' };
  /** 0..1 progress (Pudding), or null for none: drawn as a percentage on the resting line. */
  private progress: number | null = null;
  /** The active beat's words (the resting line while it runs). */
  private beatTitle = '';
  private beatDone = false;
  private beatSub = '';

  /** Round 1 standing goal: shown whenever no beat is up ("between them the HUD goal was often blank"). */
  private standingText: StandingText | null = null;
  private standingKey = '';
  /** GAPS A4: a tap on the standing goal, with its objective key (GAPS B1: the session sends the matching ping). */
  onTap: ((key: string) => void) | null = null;

  constructor(
    /** The top rail (null in node tests). */
    private readonly notify: (NotifyLike & { onRestTap?: ((key: string) => void) | null }) | null,
    readonly mode: GuideMode,
  ) {
    if (notify && 'onRestTap' in notify) {
      notify.onRestTap = (key) => {
        if (!this.active) this.onTap?.(key);
      };
    }
  }

  get enabled(): boolean {
    return this.mode !== 'off';
  }

  allows(id: BeatId): boolean {
    return this.mode === 'rookie' || (this.mode === 'lite' && LITE.includes(id));
  }

  /** The beat on screen, or null. */
  get current(): BeatId | null {
    return this.active?.id ?? null;
  }

  get shown(): BeatId[] {
    return [...this.fired];
  }

  isDone(id: BeatId): boolean {
    return this.done.has(id);
  }

  /** Show `id` (once a match); queued behind the beat on screen. */
  start(id: BeatId): void {
    if (!this.allows(id) || this.fired.has(id) || this.done.has(id)) return;
    if (this.active) {
      if (this.active.id !== id && !this.queue.includes(id)) this.queue.push(id);
      return;
    }
    this.show(id);
  }

  /** The standing goal (null: none). Drawn at once when no beat is up; a beat replaces it while it runs. */
  standing(t: StandingText | null): void {
    const key = t ? `${t.title}|${t.sub}|${t.key ?? ''}` : '';
    if (key === this.standingKey) return;
    this.standingKey = key;
    this.standingText = t;
    if (!this.active) this.drawStanding();
  }

  /** The standing goal on screen now (tests, e2e), or null. */
  get standingTitle(): string | null {
    return this.active ? null : (this.standingText?.title ?? null);
  }

  /** The words on the resting goal line now (tests), or null. */
  get line(): string | null {
    if (this.active) return this.beatLine();
    return this.standingText?.title ?? null;
  }

  private drawStanding(): void {
    const t = this.standingText;
    this.notify?.rest('goal', t ? t.title : null, undefined, t?.key);
  }

  private beatLine(): string {
    const pct = this.progress !== null ? ` ${Math.round(this.progress * 100)}%` : '';
    const sub = !this.touch && this.beatSub && !this.beatDone ? ` · ${this.beatSub}` : '';
    return `${this.beatTitle}${pct}${this.beatDone ? ' ✓' : ''}${sub}`;
  }

  private drawBeat(): void {
    this.notify?.rest('goal', this.beatLine(), this.beatDone ? 'good' : 'gold');
  }

  private show(id: BeatId): void {
    this.fired.add(id);
    this.active = { id, left: BEAT_TTL[id] };
    this.progress = null;
    this.beatDone = false;
    const t = beatText(id, this.touch, this.names);
    this.beatTitle = t.title;
    // the announcement (with the how-to on desktop), then the resting line holds the beat while it runs
    // phones drop a note's sub, so a short note says the how-to and the resting line the goal (launch finding ftue-4);
    // desktop's resting line has room for both, so no note there (it would hold the rail a coaching tip needs)
    this.beatSub = t.sub;
    if (this.touch) this.notify?.push({ key: `goal:${id}`, prio: 4, title: t.sub, tone: 'gold', icon: icon(t.icon), ttl: 3000 });
    this.drawBeat();
    setGoalAttr(id);
  }

  /** The player did it: a tick mark, then the next queued beat. */
  complete(id: BeatId): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.completed.push(id);
    this.queue = this.queue.filter((q) => q !== id);
    if (this.active?.id === id) {
      this.beatDone = true;
      this.notify?.drop(`goal:${id}`);
      this.drawBeat();
      this.active.left = Math.min(this.active.left, 0.9);
    }
  }

  /** The beat is over without the player doing it (the other team calmed Pudding): just hide it. */
  dismiss(id: BeatId): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.queue = this.queue.filter((q) => q !== id);
    if (this.active?.id === id) this.active.left = 0;
  }

  /**
   * Take a situational beat back without counting it as seen (the player died, or the dog it named walked off): it
   * hides now and may show again when its trigger comes back (feel QA: "A dog! Tap Q" stayed up in the fountain).
   */
  retract(id: BeatId): void {
    if (this.active?.id !== id || this.done.has(id)) return;
    this.fired.delete(id);
    this.active = null;
    this.notify?.drop(`goal:${id}`);
    setGoalAttr('');
    const next = this.queue.shift();
    if (next) this.show(next);
    else this.drawStanding();
  }

  setProgress(p: number | null): void {
    const v = p === null ? null : Math.round(Math.max(0, Math.min(1, p)) * 100) / 100;
    if (v === this.progress) return;
    this.progress = v;
    if (this.active) this.drawBeat();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.active.left -= dt;
    if (this.active.left > 0) return;
    this.notify?.drop(`goal:${this.active.id}`);
    this.active = null;
    setGoalAttr('');
    this.queue = this.queue.filter((q) => !this.done.has(q) && !this.fired.has(q));
    const next = this.queue.shift();
    if (next) this.show(next);
    else this.drawStanding();
  }

  dispose(): void {
    if (this.active) this.notify?.drop(`goal:${this.active.id}`);
    this.notify?.rest('goal', null);
    setGoalAttr('');
  }
}

function setGoalAttr(id: string): void {
  try {
    const d = document.documentElement.dataset;
    if (id) d.goal = id;
    else delete d.goal;
  } catch {
    /* node */
  }
}

// ---------------------------------------------------------------------------------------------------------------
// GAPS A4: the next objective and its timers, from snapshots and events (no sim change)

/** What the chip is about: the key B1's ping will carry. */
export type ObjectiveKey = 'calm' | 'escort' | 'pudding' | 'rats' | 'theirRats' | 'gates' | 'sunset' | 'suddenDeath';

export interface ObjectiveChip extends StandingText {
  key: ObjectiveKey;
  /** Whole seconds left on its countdown, or null for a live objective. */
  secs: number | null;
  /** Where it is (sim mm): the ping's point. */
  x: number;
  y: number;
}

/** A countdown ring on the minimap: ticks left of `total`, at (x, y) mm. */
export interface ObjectiveTimer {
  key: 'pudding' | 'rats' | 'theirRats';
  x: number;
  y: number;
  left: number;
  total: number;
}

type PudState = 'away' | 'wild' | 'waiting' | 'escort';

interface CampTrack {
  /** Tick the rats come back, or null while they are up (or unknown). */
  upAt: number | null;
  total: number;
  /** Shown on the chip and the minimap: own camp always, the enemy camp once a clear was seen. */
  known: boolean;
  dead: Set<number>;
  clearTick: number;
}

/** m:ss for whole seconds. */
export const fmtSecs = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const secsOf = (ticks: number): number => Math.max(0, Math.ceil(ticks / TICK_HZ));
/** Within this many ticks, a phase change beats the other timers on the chip (it changes the whole map). */
const PHASE_FIRST = 60 * TICK_HZ;
const PACK_LINE = `+${RAT_CAMP_STATS.packDmgBp / 100}% damage for ${Math.round(RAT_CAMP_STATS.packTicks / TICK_HZ)} s`;

const SUDDEN_DEATH_CHIP: ObjectiveChip = Object.freeze({ key: 'suddenDeath', title: 'Sudden Death!', sub: 'Cores burn every second: finish theirs', icon: 'sun', secs: null, x: MAP.width / 2, y: MAP.height / 2 });

/** Camp `c`'s centre (sim mm): 0 is Purrhaven's side, 1 Woof's. */
export const campPoint = (c: number): { x: number; y: number } => ({ x: c === 0 ? RAT_CAMP.x : mirrorX(RAT_CAMP.x), y: RAT_CAMP.y });

/**
 * The next objective and its timers for one team (GAPS A4). `feed` every event, `frame` every snapshot; `chip` and
 * `timers` read the state. Pudding's next spawn is TIMELINE.pudding, then the `leave` event + PUDDING.respawn; a camp
 * is due at TIMELINE.campsUp, then RAT_CAMP_STATS.respawn after its last rat's `death` event. Pure (no DOM).
 */
export class ObjectiveClock {
  tick = 0;
  phase: MatchClock['phase'] = 'gate';
  nextPhaseIn = 0;
  /** `seen` is the tick of the last snapshot that showed a living Pudding: the chip shows his HP only on that tick. */
  pud: { state: PudState; at: number; total: number; team: number; hp: number; maxHp: number; seen: number; x: number; y: number } = {
    state: 'away',
    at: TIMELINE.pudding,
    total: TIMELINE.pudding,
    team: 2,
    hp: 0,
    maxHp: 0,
    seen: -1,
    x: PUDDING_SPOT.x,
    y: PUDDING_SPOT.y,
  };
  readonly camps: [CampTrack, CampTrack];
  /** Rat ids seen in snapshots → their camp. */
  private ratCamp = new Map<number, number>();
  private packTick = -1;

  constructor(readonly myTeam: number) {
    const camp = (c: number): CampTrack => ({ upAt: TIMELINE.campsUp, total: TIMELINE.campsUp, known: c === myTeam, dead: new Set(), clearTick: -1 });
    this.camps = [camp(0), camp(1)];
  }

  feed(ev: SimEvent): void {
    if (ev.type === 'pudding') {
      const p = this.pud;
      // a new phase of Pudding: the last HP seen belongs to the old one (wild 300 HP is not the escort's HP)
      if (ev.what !== 'spawn') p.hp = p.maxHp = 0;
      if (ev.what === 'spawn') p.state = 'wild';
      else if (ev.what === 'calmed') {
        p.state = 'waiting';
        p.team = ev.team ?? 2;
      } else if (ev.what === 'escort') {
        p.state = 'escort';
        p.team = ev.team ?? p.team;
      } else if (ev.what === 'leave') {
        p.state = 'away';
        p.at = ev.tick + PUDDING.respawn;
        p.total = PUDDING.respawn;
        p.team = 2;
      }
    } else if (ev.type === 'death') {
      const c = this.ratCamp.get(ev.id);
      if (c === undefined) return;
      const t = this.camps[c];
      t.dead.add(ev.id);
      if (t.dead.size < RAT_CAMP_STATS.rats) return;
      t.dead.clear();
      t.upAt = ev.tick + RAT_CAMP_STATS.respawn;
      t.total = RAT_CAMP_STATS.respawn;
      t.clearTick = ev.tick;
      // the enemy camp: only when we saw who cleared it (the Pack buff lands on a hero we can see, same tick)
      t.known = c === this.myTeam || this.packTick === ev.tick;
    } else if (ev.type === 'buff' && ev.kind === 'pack') {
      this.packTick = ev.tick;
      for (const t of this.camps) if (t.clearTick === ev.tick) t.known = true;
    }
  }

  frame(entities: readonly EntitySnap[], clock: MatchClock): void {
    this.tick = clock.tick;
    this.phase = clock.phase;
    this.nextPhaseIn = clock.nextPhaseIn;
    const p = this.pud;
    for (const e of entities) {
      if (e.kind === 'camp') {
        const c = Math.floor(e.slot / RAT_CAMP_STATS.rats);
        if (c !== 0 && c !== 1) continue;
        this.ratCamp.set(e.id, c);
        if (e.state !== 'dead' && e.hp > 0) {
          const t = this.camps[c];
          t.upAt = null;
          t.dead.delete(e.id);
        }
      } else if (e.kind === 'pudding' && e.state !== 'dead' && e.hp > 0) {
        p.hp = e.hp;
        p.maxHp = e.maxHp;
        p.seen = clock.tick;
        p.x = e.x;
        p.y = e.y;
        if (e.team === 2) p.state = 'wild';
        else {
          p.state = 'escort';
          p.team = e.team;
        }
      }
    }
    // a timer that ran out without a snapshot showing the spawn (out of sight): the spawn happened
    if (p.state === 'away' && this.tick >= p.at) p.state = 'wild';
    for (const t of this.camps) if (t.upAt !== null && this.tick >= t.upAt) t.upAt = null;
  }

  /** The minimap's countdown rings: Pudding's spawn, the own camp, and the enemy camp once a clear was seen. */
  timers(): ObjectiveTimer[] {
    const out: ObjectiveTimer[] = [];
    const p = this.pud;
    if (p.state === 'away' && p.at > this.tick) out.push({ key: 'pudding', x: PUDDING_SPOT.x, y: PUDDING_SPOT.y, left: p.at - this.tick, total: p.total });
    for (const c of [0, 1]) {
      const t = this.camps[c];
      if (!t.known || t.upAt === null || t.upAt <= this.tick) continue;
      const at = campPoint(c);
      out.push({ key: c === this.myTeam ? 'rats' : 'theirRats', x: at.x, y: at.y, left: t.upAt - this.tick, total: t.total });
    }
    return out;
  }

  /** The chip: a live Pudding first, then a phase change within a minute, then the soonest timer, then the phase. */
  chip(): ObjectiveChip {
    const p = this.pud;
    const ours = p.team === this.myTeam;
    if (p.state === 'wild') return { key: 'calm', title: 'Calm Pudding!', sub: 'Hit him in the river: he marches with the team that calms him', icon: 'heart', secs: null, x: p.x, y: p.y };
    if (p.state === 'escort') {
      // only a live reading: out of sight, the last HP seen would pass for the current one
      const hp = p.hp > 0 && p.seen === this.tick ? p.hp.toLocaleString('en-US') : null;
      return ours
        ? { key: 'escort', title: hp ? `Escort: ${hp} HP` : 'Escort Pudding', sub: 'Push behind him: he burns towers', icon: 'heart', secs: null, x: p.x, y: p.y }
        : { key: 'escort', title: hp ? `Their escort: ${hp} HP` : 'Their Pudding is coming', sub: 'Hit him together to send him home', icon: 'heart', secs: null, x: p.x, y: p.y };
    }
    if (p.state === 'waiting')
      return { key: 'escort', title: ours ? 'Pudding joins your next wave' : 'Pudding joins their next wave', sub: ours ? 'Walk out with that wave' : 'Meet their wave together', icon: 'heart', secs: null, x: p.x, y: p.y };
    if (this.phase === 'suddenDeath') return SUDDEN_DEATH_CHIP;
    const phase = this.phaseChip();
    if (phase && this.nextPhaseIn <= PHASE_FIRST) return phase;
    const cands: ObjectiveChip[] = [];
    if (p.at > this.tick) cands.push({ key: 'pudding', title: `Pudding in ${fmtSecs(secsOf(p.at - this.tick))}`, sub: 'Calm him and he marches with your wave', icon: 'heart', secs: secsOf(p.at - this.tick), x: PUDDING_SPOT.x, y: PUDDING_SPOT.y });
    for (const c of [0, 1]) {
      const t = this.camps[c];
      if (!t.known || t.upAt === null || t.upAt <= this.tick) continue;
      const s = secsOf(t.upAt - this.tick);
      const at = campPoint(c);
      cands.push(
        c === this.myTeam
          ? { key: 'rats', title: `Your rats ${fmtSecs(s)}`, sub: `Clear your camp: ${PACK_LINE}`, icon: 'paw', secs: s, x: at.x, y: at.y }
          : { key: 'theirRats', title: `Their rats ${fmtSecs(s)}`, sub: `Take their camp: ${PACK_LINE}`, icon: 'paw', secs: s, x: at.x, y: at.y },
      );
    }
    if (phase) cands.push(phase);
    let best: ObjectiveChip | null = null;
    for (const c of cands) if (!best || (c.secs ?? Infinity) < (best.secs ?? Infinity)) best = c;
    return best ?? SUDDEN_DEATH_CHIP;
  }

  private phaseChip(): ObjectiveChip | null {
    if (this.nextPhaseIn <= 0) return null;
    const s = secsOf(this.nextPhaseIn);
    const mid = { x: MAP.width / 2, y: MAP.height / 2 };
    if (this.phase === 'gate') return { key: 'gates', title: `Gates open in ${fmtSecs(s)}`, sub: 'Get ready to run to your lane', icon: 'paw', secs: s, ...mid };
    if (this.phase === 'play') return { key: 'sunset', title: `Sunset in ${fmtSecs(s)}`, sub: 'Towers crumble faster at Sunset', icon: 'sun', secs: s, ...mid };
    if (this.phase === 'sunset') return { key: 'suddenDeath', title: `Sudden Death in ${fmtSecs(s)}`, sub: 'Then both cores start to burn', icon: 'sun', secs: s, ...mid };
    return null;
  }
}
