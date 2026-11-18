/**
 * Clip takes (tools/clips/README.md): one seeded match of any playable mode, every human seat driven by the
 * headless player-bot (the same brain `npm run match` uses), so a take is fully deterministic from its spec. Pure sim
 * code, no DOM: `scenes.mjs` bundles it for Node (tools/lib/sim-bundle.mjs) and the browser harness imports the same
 * file, so a take plays the same ticks in both; the capture checks the browser's event hash against the scan's.
 *
 * Modes (src/ui/modeSelect/modes.ts): Blitz (crossing + mutator 'blitz'), Skirmish 3v3 (crossing) as vs Bots, Co-op
 * (party seats 0..2 driven by pilots) or PvP (leads 0 and 3 driven by pilots, mode 'pvp' on Hard), Classic 5v5
 * (hearthwood) vs Bots or PvP (leads 0 and 5). Render state (skins, camera) never reaches the sim from here.
 */
import { createMatch, createPlayerBotFor, fillPicks, hash, playerBotCommands, result, step, tickOf, type MatchHandle, type PlayerBot } from '../../src/sim/index';
import type { Command, Difficulty, HeroId, MapId, MatchResult, Mutator, SimEvent, TrickId } from '../../src/sim/api';
import type { PlayerProfile } from '../../src/data/bots';
import { FNV_OFFSET, fnvString } from '../../src/sim/hash';

export { TICK_HZ, SIM_VERSION } from '../../src/sim/index';
export { HERO_IDS, HEROES } from '../../src/data/heroes/index';
export { Kind, RANGE } from '../../src/sim/world';

export type Variant = 'bots' | 'coop' | 'pvp';

export interface ClipTake {
  seed: number;
  map?: MapId;
  mutator?: Mutator;
  variant?: Variant;
  /** Slot 0's hero (the "player"); also decides which species team 0 is. */
  hero: HeroId;
  trick?: TrickId;
  difficulty?: Difficulty;
  /** Heroes per slot (length 6 or 10; null/absent = drawn from the seed like the game does). */
  picks?: readonly (HeroId | null)[];
  /** Player-bot profile of the piloted seats (default 'normal'). */
  profile?: PlayerProfile;
}

export const slotsOf = (map: MapId | undefined): number => (map === 'hearthwood' ? 10 : 6);
export const perTeamOf = (map: MapId | undefined): number => (map === 'hearthwood' ? 5 : 3);

/** The human seats a variant pilots. */
export function humansOf(t: ClipTake): number[] {
  const per = perTeamOf(t.map);
  const v = t.variant ?? 'bots';
  if (v === 'pvp') return [0, per];
  if (v === 'coop') return Array.from({ length: per }, (_, i) => i);
  return [0];
}

/** Picks and tricks for a take: the game's own draw, then the spec's explicit heroes per slot. */
export function picksOf(t: ClipTake): { picks: HeroId[]; tricks: TrickId[] } {
  const { picks, tricks } = fillPicks(t.seed >>> 0, t.hero, t.trick ?? 'pounce', t.map ?? 'crossing');
  (t.picks ?? []).forEach((h, i) => {
    if (h && i < picks.length) picks[i] = h;
  });
  picks[0] = t.hero;
  return { picks, tricks };
}

export class ClipRun {
  readonly match: MatchHandle;
  readonly picks: HeroId[];
  readonly tricks: TrickId[];
  readonly humans: number[];
  private readonly pilots: PlayerBot[];
  private h = FNV_OFFSET;
  /** Events of the last stepped tick (all teams). */
  events: readonly SimEvent[] = [];

  constructor(readonly spec: ClipTake) {
    const { picks, tricks } = picksOf(spec);
    this.picks = picks;
    this.tricks = tricks;
    this.humans = humansOf(spec);
    const v = spec.variant ?? 'bots';
    const map = spec.map ?? 'crossing';
    const cfg: Parameters<typeof createMatch>[0] = {
      seed: spec.seed >>> 0,
      picks,
      tricks,
      difficulty: v === 'pvp' ? 'hard' : (spec.difficulty ?? 'normal'),
      ...(map !== 'crossing' ? { map } : {}),
      ...(spec.mutator && spec.mutator !== 'none' ? { mutator: spec.mutator } : {}),
      ...(v === 'pvp' ? { mode: 'pvp' as const, humans: this.humans } : {}),
      ...(v === 'coop' ? { humans: this.humans } : {}),
    };
    this.match = createMatch(cfg) as MatchHandle;
    this.pilots = this.humans.map((s) => createPlayerBotFor(this.match, spec.profile ?? 'normal', s));
  }

  get tick(): number {
    return tickOf(this.match);
  }

  get ended(): MatchResult | null {
    return result(this.match);
  }

  /** Step one tick; returns that tick's events (all teams). */
  stepOnce(): readonly SimEvent[] {
    const m = this.match;
    if (result(m)) return (this.events = []);
    const cmds: Command[][] = [];
    for (const p of this.pilots) cmds[p.slot] = playerBotCommands(m, p).slice();
    const others = this.humans.length > 1 ? cmds.map((c, s) => (s === 0 ? undefined : c)) : undefined;
    step(m, cmds[0] ?? [], others);
    this.events = m.events;
    for (const e of m.events) this.h = fnvString(this.h, JSON.stringify(e));
    return this.events;
  }

  runTo(tick: number): void {
    while (this.tick < tick && !result(this.match)) this.stepOnce();
  }

  get eventHash(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }

  get stateHash(): string {
    return (hash(this.match) >>> 0).toString(16).padStart(8, '0');
  }

  /** Raw hero facts (all teams, no fog). */
  heroes(): { slot: number; hero: HeroId; team: number; alive: boolean; x: number; y: number; hp: number; maxHp: number; level: number }[] {
    const w = this.match.world;
    const out = [];
    for (let s = 0; s < this.picks.length; s++) {
      out.push({ slot: s, hero: this.picks[s], team: w.team[s], alive: w.alive[s] === 1, x: w.x[s], y: w.y[s], hp: w.hp[s], maxHp: w.maxHp[s], level: w.level[s] });
    }
    return out;
  }
}
