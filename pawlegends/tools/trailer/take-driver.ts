/**
 * Trailer takes (tools/trailer/README.md): one seeded match with slot 0 played by the headless player-bot
 * (`createPlayerBot(m, 'normal')`, the same brain `npm run match` uses) plus scripted commands at fixed ticks. Pure sim
 * code, no DOM: `seed-search.mjs` bundles it for Node (tools/lib/sim-bundle.mjs) and the browser harness imports the
 * same file, so a take plays the same ticks in both. The event log is folded into an FNV-1a hash; the capture checks
 * the browser's hash against the one seed-search wrote to takes.json.
 *
 * Render side never reaches the sim from here: no card, skin or camera state is an input (Wave C rule).
 */
import { createMatch, createPlayerBot, fillPicks, hash, Op, playerBotCommands, result, step, tickOf, type MatchHandle, type PlayerBot } from '../../src/sim/index';
import type { Command, Difficulty, HeroId, MatchResult, SimEvent, TrickId } from '../../src/sim/api';
import type { PlayerProfile } from '../../src/data/bots';
import { FNV_OFFSET, fnvString } from '../../src/sim/hash';

export { Buff, G, Kind, RANGE } from '../../src/sim/world';
export { NO_TARGET, Op } from '../../src/sim/api';
export { TICK_HZ, SIM_VERSION } from '../../src/sim/index';
export { PING_KIND, PING } from '../../src/data/pings';
export { MAP, BUSHES, PUDDING_SPOT, TOWER_SPOTS, CORE } from '../../src/data/map';

/** One scripted command. `add` keeps the player-bot's own command of that tick (a ping may share a tick, sim v10). */
export interface ScriptCmd {
  tick: number;
  cmd: Command;
  mode?: 'replace' | 'add';
}

export interface TakeSpec {
  seed: number;
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
  /** The player-bot profile for slot 0 (default 'normal'). */
  profile?: PlayerProfile;
  script?: readonly ScriptCmd[];
}

/** Hero facts for the search predicates (raw world arrays, all teams: the search may see through the fog). */
export interface HeroFact {
  slot: number;
  hero: HeroId;
  team: number;
  alive: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  buffs: number;
  level: number;
}

export class TakeRun {
  readonly match: MatchHandle;
  readonly picks: HeroId[];
  readonly tricks: TrickId[];
  private readonly bot: PlayerBot;
  private readonly script = new Map<number, ScriptCmd[]>();
  private h = FNV_OFFSET;
  /** Events of the last stepped tick (all teams). */
  events: readonly SimEvent[] = [];

  constructor(readonly spec: TakeSpec) {
    const { picks, tricks } = fillPicks(spec.seed >>> 0, spec.hero, spec.trick);
    this.picks = picks;
    this.tricks = tricks;
    this.match = createMatch({ seed: spec.seed >>> 0, picks, tricks, difficulty: spec.difficulty }) as MatchHandle;
    this.bot = createPlayerBot(this.match, spec.profile ?? 'normal');
    for (const s of spec.script ?? []) {
      const list = this.script.get(s.tick) ?? [];
      list.push(s);
      this.script.set(s.tick, list);
    }
  }

  get tick(): number {
    return tickOf(this.match);
  }

  get ended(): MatchResult | null {
    return result(this.match);
  }

  /** The commands slot 0 sends this tick: the bot's, replaced (or joined) by the script's. */
  commandsFor(tick: number, botCmds: readonly Command[]): Command[] {
    const s = this.script.get(tick);
    if (!s) return botCmds.slice();
    const add = s.filter((c) => c.mode === 'add' || (c.mode === undefined && c.cmd.op === Op.Ping)).map((c) => c.cmd);
    const rep = s.filter((c) => !(c.mode === 'add' || (c.mode === undefined && c.cmd.op === Op.Ping))).map((c) => c.cmd);
    return [...(rep.length ? rep : botCmds), ...add];
  }

  /** Step one tick; returns that tick's events (all teams). */
  stepOnce(): readonly SimEvent[] {
    const m = this.match;
    if (result(m)) return (this.events = []);
    const t = this.tick;
    // the bot always thinks (its memory stays the same whether or not the script overrides this tick)
    const botCmds = playerBotCommands(m, this.bot);
    step(m, this.commandsFor(t, botCmds));
    this.events = m.events;
    for (const e of m.events) this.h = fnvString(this.h, JSON.stringify(e));
    return this.events;
  }

  /** Step until `tick` (or the end). */
  runTo(tick: number): void {
    while (this.tick < tick && !result(this.match)) this.stepOnce();
  }

  /** FNV-1a of every event so far (8 hex digits). */
  get eventHash(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }

  /** FNV-1a of the world now (8 hex digits). */
  get stateHash(): string {
    return (hash(this.match) >>> 0).toString(16).padStart(8, '0');
  }

  heroes(): HeroFact[] {
    const w = this.match.world;
    const out: HeroFact[] = [];
    for (let s = 0; s < 6; s++) {
      out.push({ slot: s, hero: this.picks[s], team: w.team[s], alive: w.alive[s] === 1, x: w.x[s], y: w.y[s], hp: w.hp[s], maxHp: w.maxHp[s], buffs: w.buffs[s], level: w.level[s] });
    }
    return out;
  }
}
