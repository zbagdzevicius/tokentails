/**
 * Chat cues (docs/plans/moba/MATCH-CHAT.md §5.1, §5.5): what the bot chatter may react to, read out of the sim's events
 * and state WITHOUT touching the sim. Two readers:
 *
 * - `cuesFromEvents(events)`: the sim's per-tick `SimEvent`s (the raw match handle's `events` on the relay's referee,
 *   or a snapshot's `events` in a solo match). Read only; never mutates the array or its objects.
 * - `botStates(...)`: once a second, each bot's alive, HP share, nearby heroes and a coarse intent (dead → base,
 *   enemies within 9 m → fight, under 30% HP → retreat, else lane), from the raw world arrays (relay) or a snapshot's
 *   hero entities (solo).
 *
 * The relay reads the match handle through `readHandleCues` (duck-typed: a bundle whose handle has no `events` array
 * yields no event cues, and the chatter still has start, end and human-message cues). Reading never changes a hash:
 * tests/unit/bot-chat-determinism.test.ts and the backend referee spec compare hash trails with and without it.
 *
 * Pure, no imports: vendored verbatim into backend/src/vendor/pawlegends-chat (TypeScript 4.8 compatible).
 */

export type Team = 0 | 1;
export type Intent = 'lane' | 'base' | 'objective' | 'cannon' | 'help' | 'retreat' | 'fight';

export type ChatCue =
  /** A hero died; `killer` is a hero slot, or −1 (tower, minion, camp). `assists`: hero slots that got assist XP. */
  | { k: 'death'; id: number; killer: number; assists: number[] }
  | { k: 'firstBlood'; killer: number; victim: number }
  | { k: 'shutdown'; killer: number; victim: number }
  /** A tower fell; `by` is the team that destroyed it. */
  | { k: 'tower'; by: Team }
  | { k: 'objective'; team: Team; kind: string; slot: number }
  | { k: 'objectiveSpawn'; kind: string }
  | { k: 'comeback'; team: Team }
  | { k: 'sunset' }
  | { k: 'suddenDeath' }
  /** A human pinged and `took` allied bots took it as an order. */
  | { k: 'ping'; team: Team; kind: string; took: number }
  /** Sim v21 (Kibble Cannon): a cannon shot hit `team`, fired by `by` (when known). */
  | { k: 'cannonHit'; team: Team; by: Team | -1 }
  | { k: 'cannonSpawn' }
  | { k: 'end'; winner: Team };

export interface BotState {
  slot: number;
  alive: boolean;
  /** HP share 0..1. */
  hp: number;
  intent: Intent;
  /** Enemy heroes within 9 m. */
  enemies: number;
  allies: number;
  x?: number;
  y?: number;
  /** The bot's lane word, when known ({lane} lines are skipped otherwise). */
  lane?: string;
}

/** Sim units are millimetres: 9 m is a fight. */
export const FIGHT_RANGE = 9000;
/** Ping kinds a bot answers with "omw" when it took the order. */
export const OMW_PINGS: readonly string[] = ['group', 'defend', 'goHere', 'pudding', 'grizzlechop', 'fallBack'];

type AnyEvent = { type?: unknown; [k: string]: unknown };
const num = (v: unknown, d = -1): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const teamOf = (slot: number, teamSize: number): Team => (slot >= teamSize ? 1 : 0);

/**
 * Compact cues from one tick's sim events. `slots`: hero slots of the match (6 or 10); `teamSize` 3 or 5. Unknown
 * event types are ignored (an older or newer bundle never breaks the reader).
 */
export function cuesFromEvents(events: readonly unknown[] | null | undefined, slots: number, _teamSize?: number): ChatCue[] {
  if (!events || !events.length) return [];
  const out: ChatCue[] = [];
  const isHero = (s: number): boolean => s >= 0 && s < slots;
  // assist XP of this tick, by the victim's tick (an assist pays on the tick of the takedown)
  const assistByTick = new Map<number, number[]>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as AnyEvent;
    if (e && e.type === 'xp' && e.reason === 'assist') {
      const t = num(e.tick);
      const id = num(e.id);
      if (!isHero(id)) continue;
      const list = assistByTick.get(t) ?? [];
      list.push(id);
      assistByTick.set(t, list);
    }
  }
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as AnyEvent;
    if (!e || typeof e.type !== 'string') continue;
    switch (e.type) {
      case 'death': {
        const id = num(e.id);
        if (!isHero(id)) break;
        const killer = num(e.killer);
        out.push({ k: 'death', id, killer: isHero(killer) ? killer : -1, assists: (assistByTick.get(num(e.tick)) ?? []).slice() });
        break;
      }
      case 'firstBlood': {
        const killer = num(e.killer);
        const victim = num(e.victim);
        if (isHero(victim)) out.push({ k: 'firstBlood', killer: isHero(killer) ? killer : -1, victim });
        break;
      }
      case 'shutdown': {
        const killer = num(e.killer);
        const victim = num(e.victim);
        if (isHero(killer) && isHero(victim)) out.push({ k: 'shutdown', killer, victim });
        break;
      }
      case 'tower': {
        const by = num(e.destroyedBy);
        if (by === 0 || by === 1) out.push({ k: 'tower', by });
        break;
      }
      case 'objective': {
        const team = num(e.team);
        if (team === 0 || team === 1) out.push({ k: 'objective', team, kind: String(e.kind ?? ''), slot: num(e.slot) });
        break;
      }
      case 'objectiveSpawn':
        out.push({ k: 'objectiveSpawn', kind: String(e.kind ?? '') });
        break;
      case 'pudding': {
        // Crossing's Pudding: a spawn, and a team that calmed it (took it)
        if (e.what === 'spawn') out.push({ k: 'objectiveSpawn', kind: 'pudding' });
        else if (e.what === 'calmed') {
          const team = num(e.team);
          if (team === 0 || team === 1) out.push({ k: 'objective', team, kind: 'pudding', slot: -1 });
        }
        break;
      }
      case 'comeback': {
        const team = num(e.team);
        if (team === 0 || team === 1) out.push({ k: 'comeback', team });
        break;
      }
      case 'sunset':
        out.push({ k: 'sunset' });
        break;
      case 'suddenDeath':
        out.push({ k: 'suddenDeath' });
        break;
      case 'ping': {
        const took = num(e.took, 0);
        const team = num(e.team, 0);
        if (took > 0) out.push({ k: 'ping', team: team === 1 ? 1 : 0, kind: String(e.kind ?? ''), took });
        break;
      }
      // sim v21 (Kibble Cannon, feat/pawlegends-v21-fun): read by shape, so the chatter is ready when the sim ships
      case 'cannon': {
        if (e.what === 'spawn' || e.what === 'warn') out.push({ k: 'cannonSpawn' });
        else if (e.what === 'hit') {
          const team = num(e.team);
          const by = num(e.by);
          if (team === 0 || team === 1) out.push({ k: 'cannonHit', team, by: by === 0 || by === 1 ? by : -1 });
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** The world arrays the relay's sampler reads (sim/world.ts World; typed arrays indexed by entity id = hero slot). */
export interface WorldLike {
  alive?: ArrayLike<number>;
  hp?: ArrayLike<number>;
  maxHp?: ArrayLike<number>;
  team?: ArrayLike<number>;
  x?: ArrayLike<number>;
  y?: ArrayLike<number>;
}

/** One hero as a sampler sees it. */
export interface HeroLike {
  slot: number;
  alive: boolean;
  hp: number;
  maxHp: number;
  team: Team;
  x: number;
  y: number;
}

/** A coarse intent from what the bot is doing now (never the sim's own order: that stays inside the sim). */
export function intentOf(h: HeroLike, enemies: number): Intent {
  if (!h.alive) return 'base';
  if (enemies > 0) return 'fight';
  if (h.maxHp > 0 && h.hp / h.maxHp < 0.3) return 'retreat';
  return 'lane';
}

/** Bot states from hero rows (`bots` = the slots to report). */
export function statesFromHeroes(heroes: readonly HeroLike[], bots: readonly number[]): BotState[] {
  const out: BotState[] = [];
  for (const slot of bots) {
    const h = heroes.find((x) => x.slot === slot);
    if (!h) continue;
    let enemies = 0;
    let allies = 0;
    if (h.alive)
      for (const o of heroes) {
        if (o.slot === slot || !o.alive) continue;
        const dx = o.x - h.x;
        const dy = o.y - h.y;
        if (dx * dx + dy * dy > FIGHT_RANGE * FIGHT_RANGE) continue;
        if (o.team === h.team) allies++;
        else enemies++;
      }
    out.push({ slot, alive: h.alive, hp: h.maxHp > 0 ? Math.max(0, Math.min(1, h.hp / h.maxHp)) : 0, intent: intentOf(h, enemies), enemies, allies, x: h.x, y: h.y });
  }
  return out;
}

/** Hero rows from the raw world arrays (the relay's referee). Null when the arrays are missing. */
export function heroesFromWorld(w: WorldLike | null | undefined, slots: number, teamSize: number): HeroLike[] | null {
  if (!w || !w.alive || !w.hp || !w.maxHp || !w.x || !w.y) return null;
  const out: HeroLike[] = [];
  for (let s = 0; s < slots; s++)
    out.push({ slot: s, alive: w.alive[s] === 1, hp: w.hp[s], maxHp: w.maxHp[s], team: w.team ? (w.team[s] === 1 ? 1 : 0) : teamOf(s, teamSize), x: w.x[s], y: w.y[s] });
  return out;
}

/** Hero rows from a snapshot's entities (a solo match). Heroes the viewer cannot see are missing. */
export function heroesFromSnapshot(entities: readonly { kind: string; slot: number; team: unknown; hp: number; maxHp: number; x: number; y: number; respawnIn?: number }[], teamSize: number): HeroLike[] {
  const out: HeroLike[] = [];
  for (const e of entities) {
    if (e.kind !== 'hero') continue;
    const team: Team = e.team === 1 ? 1 : e.team === 0 ? 0 : teamOf(e.slot, teamSize);
    out.push({ slot: e.slot, alive: e.respawnIn === undefined && e.hp > 0, hp: e.hp, maxHp: e.maxHp, team, x: e.x, y: e.y });
  }
  return out;
}

/** What the relay's referee reads off an opaque match handle: this tick's events and the world (both read only). */
export function readHandle(m: unknown): { events: readonly unknown[] | null; world: WorldLike | null } {
  const h = m as { events?: unknown; world?: unknown } | null;
  const events = h && Array.isArray(h.events) ? (h.events as readonly unknown[]) : null;
  const world = h && h.world && typeof h.world === 'object' ? (h.world as WorldLike) : null;
  return { events, world };
}
