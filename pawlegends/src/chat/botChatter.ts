/**
 * The bot chatter engine (docs/plans/moba/MATCH-CHAT.md §5): decides when a fill bot types an ordinary match line,
 * which line, and how it is typed. Pure and deterministic: no DOM, no clock (the caller passes `nowMs`), no
 * Math.random (its own PRNG), never the sim. The relay runs one per room (backend BotChat), a solo match runs one in
 * the client (app/soloChatter.ts).
 *
 * API: `observe(cue, nowMs)` for sim cues, `sample(states, nowMs)` once a second, `human(msg, nowMs)` for a human's
 * team or all chat line, `setTier(team, tier)` when seats change, `due(nowMs)` → the lines to send now.
 *
 * Frequency (§5.3): each team draws a hard budget (0: 40%, 1: 30%, 2: 20%, 3: 10%; Hearthwood +1 at 5%) and a line
 * also needs its trigger's roll, so most matches have 0–2 bot lines. Spacing: 40 s between bot lines in a room, 100 s
 * per bot, nothing within 6 s of a human message (one reaction excepted). Guards (§5.5, §6) are re-checked when a line
 * is due, and a dropped line never spends budget.
 *
 * Guardrails enforced here (§6): bank lines only (botLines.ts), never a question, no conversation (at most one
 * reaction per human message, none to the same human within 60 s, only to thanks / praise / gg / laughter), a probe
 * ("are you a bot") silences every bot in the room for the rest of the match, a quick-tier channel gets phrase ids only
 * (a line without one is dropped), pilots and humans never speak (only `setup.humans`' complement does), and
 * `setup.silent` (ranked, an account's first match, a restored room) keeps every bot quiet.
 *
 * Pure, no imports outside src/chat: vendored verbatim into backend/src/vendor/pawlegends-chat.
 */
import { Rng } from './rng';
import { FOLLOW_OF, LINES_BY_CAT, type BotCategory, type BotLine } from './botLines';
import { dress, drawPersona, normSurface, onlyEmoji, type Persona } from './personas';
import { addTypo } from './typos';
import { OMW_PINGS, type BotState, type ChatCue, type Team } from './cues';

export type ChatTier = 'text' | 'quick';
export type Channel = 'team' | 'all';

/** Timing and spacing (ms). */
export const CHATTER = Object.freeze({
  roomGapMs: 40_000,
  botGapMs: 100_000,
  /** A reaction is the one line allowed soon after a human: its own, shorter gaps. */
  reactRoomGapMs: 12_000,
  reactBotGapMs: 30_000,
  quietMs: 6_000,
  sameSurfaceMs: 30_000,
  endWindowMs: 12_000,
  reactSameHumanMs: 60_000,
  barkGapMs: 10_000,
  startFromMs: 5_000,
  startToMs: 25_000,
  /** A human's kills this close together are a multikill. */
  multiKillMs: 10_000,
  closeLowHp: 0.12,
  closeAfterMs: 4_000,
  maxChars: 40,
});

/** The budget per team (§5.3). */
export const BUDGET_WEIGHTS: readonly number[] = [0.4, 0.3, 0.2, 0.1];

/** One recipient's memory of bot lines (§5.8): the last 80 lids, the last 30 surfaces, the last 3 per common token. */
export interface BotSeen {
  l: string[];
  s: string[];
  t?: Record<string, string[]>;
}
export const SEEN_CAPS = Object.freeze({ lids: 80, surfaces: 30, perToken: 3 });

/** The union of a channel's recipients' memories. */
export interface SeenSet {
  lids: Set<string>;
  surf: Set<string>;
  tok: Map<string, Set<string>>;
}

export function mergeSeen(rings: readonly (BotSeen | null | undefined)[]): SeenSet {
  const out: SeenSet = { lids: new Set(), surf: new Set(), tok: new Map() };
  for (const r of rings) {
    if (!r) continue;
    for (const l of r.l ?? []) out.lids.add(l);
    for (const s of r.s ?? []) out.surf.add(s);
    for (const k of Object.keys(r.t ?? {})) {
      const set = out.tok.get(k) ?? new Set<string>();
      for (const s of (r.t as Record<string, string[]>)[k] ?? []) set.add(s);
      out.tok.set(k, set);
    }
  }
  return out;
}

/** A recipient's ring after the lines it saw this match (newest last, capped). Pure. */
export function pushSeen(ring: BotSeen | null | undefined, lines: readonly { lid: string; surface: string; tok?: string }[]): BotSeen {
  const l = [...(ring?.l ?? [])];
  const s = [...(ring?.s ?? [])];
  const t: Record<string, string[]> = {};
  for (const k of Object.keys(ring?.t ?? {})) t[k] = [...((ring!.t as Record<string, string[]>)[k] ?? [])];
  for (const x of lines) {
    if (x.tok) {
      const list = (t[x.tok] ??= []);
      list.push(x.surface);
      t[x.tok] = list.slice(-SEEN_CAPS.perToken);
    } else l.push(x.lid);
    s.push(x.surface);
  }
  return { l: l.slice(-SEEN_CAPS.lids), s: s.slice(-SEEN_CAPS.surfaces), t };
}

export interface ChatterSetup {
  seed: number;
  /** Hero slots (6, or 10 on Hearthwood). */
  slots: number;
  /** Seats per team (3 or 5). */
  teamSize: number;
  map?: string;
  /** Human seats (a pilot flying one never speaks: it is a human's seat). Every other slot is a fill bot. */
  humans: readonly number[];
  /** Each team's species ([team 0, team 1]). */
  sides?: readonly ['cat' | 'dog', 'cat' | 'dog'];
  /** No chatter at all: ranked or competitive queues, an account's first match, a room restored after a deploy. */
  silent?: boolean;
  /** Team chat tier per team ('text' only when every human on the team is a registered 16+ account). */
  tiers?: readonly [ChatTier, ChatTier];
  /** Peer-visible names per slot for `{who}` (null: none, e.g. bots and guests). */
  names?: readonly (string | null)[];
  /** The recipients' memories per team (all chat merges both). */
  seen?: readonly [SeenSet | null, SeenSet | null];
  /** The runtime chat filter (shared/chat-filter.ts): true = may be sent. Absent: every bank line is trusted. */
  filter?: (text: string) => boolean;
  /** Match time of the start (ms). */
  startMs?: number;
}

export interface Planned {
  slot: number;
  team: Team;
  ch: Channel;
  k: 't' | 'q';
  text?: string;
  id?: number;
  lid: string;
  cat: BotCategory;
  /** What recipients saw, for the memory (`q:<id>` for a phrase). */
  surface: string;
  tok?: string;
  /** A split second part or a "*word" fix (spends no budget). */
  follow: boolean;
  at: number;
}

type Guard = 'none' | 'alive' | 'dead' | 'aliveLow' | 'retreat' | 'notFight';
export type DropReason = 'budget' | 'guard' | 'filter' | 'tier' | 'memory' | 'probe' | 'end' | 'quiet' | 'gap' | 'dup';

interface Pending {
  uid: number;
  slot: number;
  team: Team;
  ch: Channel;
  line: BotLine;
  k: 't' | 'q';
  surface: string;
  dueAt: number;
  guard: Guard;
  follow: boolean;
  parent: number;
  reaction: boolean;
  end: boolean;
  postponed: boolean;
}

export interface ChatterStats {
  budget: [number, number];
  sent: [number, number];
  byCat: Record<string, number>;
  drops: Record<string, number>;
  reactions: number;
  probe: boolean;
  personas: string[];
  filterRejects: number;
}

const PHRASE_INTENT: Readonly<Record<number, string>> = Object.freeze({ 29: 'thanks', 28: 'praise', 27: 'praise', 39: 'praise', 25: 'gg', 26: 'gg', 37: 'lol' });

/** Fold a human line for the probe and intent checks: lowercase, diacritics and leet folded, punctuation to spaces. */
export function foldHuman(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/[^a-zÀ-ɏ\uD800-\uDFFF]+/g, ' ')
    .trim();
}

const PROBE_RE = /\b(bot|bots|botas|robot|robots|ai|npc|npcs|script|scripted)\b|\breal (person|human|player|people)\b|\bare (you|u|ya|yall) (all )?(real|human|humans|a person)\b|\bafk bot\b|\bar tu zmogus\b|\bzmogus\b/;

/** True when a human line asks (or hints) whether someone is a bot (§5.6): every bot goes silent for the match. */
export function isProbe(text: string): boolean {
  if (/human\s*\?/i.test(text)) return true;
  const f = foldHuman(text);
  // spaced-out letters ("n p c", "b o t") read as one word too
  const joined = f.replace(/\b([a-z]) (?=[a-z]\b)/g, '$1');
  return PROBE_RE.test(f) || PROBE_RE.test(joined);
}

/** The safe intent of a human line a bot may react to, or null (questions, requests, names, numbers: silence). */
export function humanIntent(text: string): 'thanks' | 'praise' | 'gg' | 'lol' | null {
  if (/[?\d@]/.test(text)) return null;
  const raw = text.trim();
  if (/^(😹|😂|🤣)+$/.test(raw)) return 'lol';
  const t = foldHuman(raw).replace(/(.)\1{2,}/g, '$1$1');
  if (/^(ty|thx|thanks|thank you|thank u|tyty|ty ty|tysm|thanks a lot)$/.test(t)) return 'thanks';
  if (/^(nice|nicee|nice one|gj|gj gj|good job|wp|well played|nice play|sick|clean)$/.test(t)) return 'praise';
  if (/^(gg|ggs|gg wp|ggwp|gg all|good game)$/.test(t)) return 'gg';
  if (/^(lol|lool|lmao|haha|hahaha|hah|xd|kek)$/.test(t)) return 'lol';
  return null;
}

/** Typing time of a line (§5.6): chars / cps × u, plus think time for lines over 10 characters. Pure. */
export function typingMs(chars: number, cps: number, u: number, think: number): number {
  return (chars / cps) * 1000 * u + (chars > 10 ? think : 0);
}

const MOOD: Readonly<Partial<Record<BotCategory, 'up' | 'down' | 'neutral'>>> = {
  fb_ours: 'up',
  praise: 'up',
  thanks: 'up',
  tower_ours: 'up',
  obj_ours: 'up',
  kaboom: 'up',
  gg_win: 'up',
  close: 'down',
  death: 'down',
  fb_theirs: 'down',
  tower_lost: 'down',
  cannon_hurt: 'down',
  gg_lose: 'down',
};

export class BotChatter {
  private readonly rng: Rng;
  readonly personas = new Map<number, Persona>();
  private readonly bots: number[] = [];
  private readonly budget: [number, number] = [0, 0];
  private readonly spent: [number, number] = [0, 0];
  private readonly reserved: [number, number] = [0, 0];
  private readonly hasHuman: [boolean, boolean] = [false, false];
  private tiers: [ChatTier, ChatTier];
  private readonly states = new Map<number, BotState>();
  private pending: Pending[] = [];
  private uid = 0;
  private readonly emitted = new Set<number>();
  private readonly sentLog: Planned[] = [];
  /** Due times of budgeted lines (planned or sent), per slot: the spacing rules read them. */
  private readonly times: { at: number; slot: number; reaction: boolean; end: boolean; uid: number }[] = [];
  private readonly usedLids = new Set<string>();
  private readonly recent: { at: number; surf: string }[] = [];
  private lastHumanAt = -Infinity;
  private readonly reactedTo = new Map<number, number>();
  private readonly humanKills = new Map<number, number[]>();
  private readonly praisedAt = new Map<number, number>();
  private readonly diedOnce = new Set<number>();
  private readonly lowSince = new Map<number, number>();
  private readonly backDone = new Set<number>();
  private readonly lastBark = new Map<number, number>();
  private endAt = -1;
  private silenced: boolean;
  private probeHit = false;
  readonly stats: ChatterStats;

  constructor(private readonly setup: ChatterSetup) {
    this.rng = new Rng(setup.seed);
    this.tiers = [setup.tiers?.[0] ?? 'quick', setup.tiers?.[1] ?? 'quick'];
    for (let s = 0; s < setup.slots; s++) {
      const p = drawPersona(this.rng);
      if (setup.humans.indexOf(s) !== -1) {
        this.hasHuman[this.teamOf(s)] = true;
        continue;
      }
      this.bots.push(s);
      this.personas.set(s, p);
    }
    for (const t of [0, 1] as const) {
      let b = BUDGET_WEIGHTS.length ? this.rng.weighted(BUDGET_WEIGHTS) : 0;
      if (setup.map === 'hearthwood' && this.rng.chance(0.05)) b = Math.min(4, b + 1);
      this.budget[t] = setup.silent ? 0 : b;
    }
    this.silenced = !!setup.silent;
    this.stats = {
      budget: [this.budget[0], this.budget[1]],
      sent: [0, 0],
      byCat: {},
      drops: {},
      reactions: 0,
      probe: false,
      personas: this.bots.map((s) => this.personas.get(s)!.kind),
      filterRejects: 0,
    };
    if (!this.silenced) this.planStart(setup.startMs ?? 0);
  }

  // ------------------------------------------------------------------------------------------------ inputs

  teamOf(slot: number): Team {
    return slot >= this.setup.teamSize ? 1 : 0;
  }

  isBot(slot: number): boolean {
    return this.personas.has(slot);
  }

  get quiet(): boolean {
    return this.silenced;
  }

  /** A seat change moved a team's tier (a claim, a drop, a pilot): pending text lines turn into phrases or drop. */
  setTier(team: Team, tier: ChatTier): void {
    this.tiers[team] = tier;
  }

  /** A bark was shown over `slot` (solo): it does not also type within 10 s. */
  bark(slot: number, nowMs: number): void {
    this.lastBark.set(slot, nowMs);
  }

  /** Bot states, once a second (relay referee or the solo snapshot). Unknown slots keep their last state. */
  sample(states: readonly BotState[], nowMs: number): void {
    for (const st of states) {
      if (!this.isBot(st.slot)) continue;
      this.states.set(st.slot, st);
      const team = this.teamOf(st.slot);
      // close escape: under 12% HP from a fight, still alive 4 s later
      if (st.alive && st.hp < CHATTER.closeLowHp) {
        if (!this.lowSince.has(st.slot)) this.lowSince.set(st.slot, nowMs);
      } else if (!st.alive) this.lowSince.delete(st.slot);
      const low = this.lowSince.get(st.slot);
      if (low !== undefined && st.alive && nowMs - low >= CHATTER.closeAfterMs) {
        this.lowSince.delete(st.slot);
        if (st.hp < 0.5) this.plan(team, 'close', nowMs, { p: 0.15, prefer: st.slot, only: st.slot, guard: 'aliveLow' });
      }
      // low-HP retreat, once per low spell
      if (st.alive && st.intent === 'retreat' && st.hp < 0.3) {
        if (!this.backDone.has(st.slot)) {
          this.backDone.add(st.slot);
          this.plan(team, 'back', nowMs, { p: 0.06, only: st.slot, guard: 'retreat' });
        }
      } else if (st.hp > 0.6 || !st.alive) this.backDone.delete(st.slot);
    }
  }

  observe(cue: ChatCue, nowMs: number): void {
    if (this.silenced && cue.k !== 'end') return;
    switch (cue.k) {
      case 'death':
        return this.onDeath(cue, nowMs);
      case 'firstBlood': {
        if (cue.killer < 0) return;
        const t = this.teamOf(cue.killer);
        if (this.isHumanSlot(cue.killer)) {
          this.praisedAt.set(cue.killer, nowMs);
          this.plan(t, 'praise', nowMs, { p: 0.3, who: cue.killer });
        } else this.plan(t, 'fb_ours', nowMs, { p: 0.25, prefer: cue.killer });
        this.plan((1 - t) as Team, 'fb_theirs', nowMs, { p: 0.12, exclude: cue.victim });
        return;
      }
      case 'shutdown': {
        if (!this.isHumanSlot(cue.killer)) return;
        const last = this.praisedAt.get(cue.killer);
        if (last !== undefined && nowMs - last < 2000) return;
        this.praisedAt.set(cue.killer, nowMs);
        this.plan(this.teamOf(cue.killer), 'praise', nowMs, { p: 0.3, who: cue.killer });
        return;
      }
      case 'tower':
        this.plan(cue.by, 'tower_ours', nowMs, { p: 0.1 });
        this.plan((1 - cue.by) as Team, 'tower_lost', nowMs, { p: 0.08, guard: 'notFight' });
        return;
      case 'objective':
        this.plan(cue.team, 'obj_ours', nowMs, { p: 0.15, tag: cue.kind });
        return;
      case 'objectiveSpawn':
        for (const t of [0, 1] as const) this.plan(t, 'obj_go', nowMs, { p: 0.1, tag: cue.kind, guard: 'notFight', calm: true });
        return;
      case 'cannonHit':
        if (cue.by === 0 || cue.by === 1) this.plan(cue.by, 'kaboom', nowMs, { p: 0.35 });
        this.plan(cue.team, 'cannon_hurt', nowMs, { p: 0.15 });
        return;
      case 'cannonSpawn':
        for (const t of [0, 1] as const) this.plan(t, 'cannon_go', nowMs, { p: 0.1, guard: 'notFight', calm: true });
        return;
      case 'ping':
        if (OMW_PINGS.indexOf(cue.kind) !== -1) this.plan(cue.team, 'omw', nowMs, { p: 0.2, guard: 'alive' });
        return;
      case 'comeback':
        this.plan(cue.team, 'comeback', nowMs, { p: 0.08 });
        return;
      case 'sunset':
      case 'suddenDeath': {
        const teams = ([0, 1] as const).filter((t) => this.hasHuman[t]);
        if (teams.length) this.plan(this.rng.pick(teams), 'last_push', nowMs, { p: 0.1 });
        return;
      }
      case 'end':
        return this.onEnd(cue.winner, nowMs);
      default:
        return;
    }
  }

  /**
   * A human's chat line (team or all). It quiets the bots for 6 s; a probe silences them for the match; a thanks,
   * praise, gg or laugh in team chat may get one reaction (p 0.25, needs budget). `k: 'q'` lines (a quick-tier human)
   * only ever get a phrase back.
   */
  human(m: { slot: number; ch: Channel; k: 't' | 'q'; text?: string; id?: number }, nowMs: number): void {
    this.lastHumanAt = nowMs;
    if (m.k === 't' && typeof m.text === 'string' && isProbe(m.text)) {
      this.silence(nowMs);
      return;
    }
    if (this.silenced || m.ch !== 'team') return;
    const intent = m.k === 't' ? humanIntent(m.text ?? '') : (PHRASE_INTENT[m.id ?? -1] ?? null);
    if (!intent) return;
    const last = this.reactedTo.get(m.slot);
    if (last !== undefined && nowMs - last < CHATTER.reactSameHumanMs) return;
    const team = this.teamOf(m.slot);
    if (this.plan(team, 'reaction', nowMs, { p: 0.25, tag: intent, reaction: true, quickOnly: m.k === 'q' })) {
      this.reactedTo.set(m.slot, nowMs);
      this.stats.reactions++;
    }
  }

  /** Every bot stops for the rest of the match (a probe). */
  silence(_nowMs: number): void {
    this.silenced = true;
    this.probeHit = true;
    this.stats.probe = true;
    for (const p of this.pending) this.drop(p, 'probe');
    this.pending = [];
    this.budget[0] = this.spent[0];
    this.budget[1] = this.spent[1];
  }

  // ------------------------------------------------------------------------------------------------ output

  /** The lines whose time has come, after their guards are re-checked. */
  due(nowMs: number): Planned[] {
    if (!this.pending.length) return [];
    this.pending.sort((a, b) => a.dueAt - b.dueAt || a.uid - b.uid);
    const out: Planned[] = [];
    const keep: Pending[] = [];
    for (const p of this.pending) {
      if (p.dueAt > nowMs) {
        keep.push(p);
        continue;
      }
      const why = this.check(p, nowMs);
      if (why === 'postpone') {
        keep.push(p);
        continue;
      }
      if (why) {
        this.drop(p, why);
        continue;
      }
      out.push(this.emit(p, nowMs));
    }
    this.pending = keep;
    return out;
  }

  /** Lines planned and not yet sent. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Every line sent this match. */
  get sent(): readonly Planned[] {
    return this.sentLog;
  }

  /** What `team`'s humans saw from bots this match (their memory update at the end). */
  seenBy(team: Team): { lid: string; surface: string; tok?: string }[] {
    return this.sentLog
      .filter((l) => l.ch === 'all' || l.team === team)
      .map((l) => ({ lid: l.lid, surface: l.surface, ...(l.tok ? { tok: l.tok } : {}) }));
  }

  get probed(): boolean {
    return this.probeHit;
  }

  // ------------------------------------------------------------------------------------------------ planning

  private isHumanSlot(slot: number): boolean {
    return this.setup.humans.indexOf(slot) !== -1;
  }

  private planStart(startMs: number): void {
    for (const t of [0, 1] as const) {
      if (!this.hasHuman[t]) continue;
      const at = startMs + this.rng.range(CHATTER.startFromMs, CHATTER.startToMs);
      this.plan(t, 'start', at, { p: 0.3, guard: 'alive', calm: true });
    }
    // all chat gl hf: an enemy team's bot first (in co-op the enemies are all bots)
    const at = startMs + this.rng.range(CHATTER.startFromMs, CHATTER.startToMs);
    const teams = ([0, 1] as const).filter((t) => this.botsOf(t).length);
    const t = teams.find((x) => !this.hasHuman[x]) ?? (teams.length ? this.rng.pick(teams) : undefined);
    if (t !== undefined) this.plan(t, 'start_all', at, { p: 0.1, ch: 'all', guard: 'alive' });
  }

  private onDeath(cue: Extract<ChatCue, { k: 'death' }>, nowMs: number): void {
    const vTeam = this.teamOf(cue.id);
    if (this.isBot(cue.id)) {
      const st = this.states.get(cue.id);
      this.states.set(cue.id, { ...(st ?? { slot: cue.id, hp: 0, intent: 'base', enemies: 0, allies: 0 }), alive: false, hp: 0, intent: 'base', slot: cue.id });
    }
    if (cue.killer < 0) return;
    const kTeam = this.teamOf(cue.killer);
    if (kTeam === vTeam) return;
    // a bot's own death by a hero, once a match
    if (this.isBot(cue.id) && !this.diedOnce.has(cue.id)) {
      this.diedOnce.add(cue.id);
      this.plan(vTeam, 'death', nowMs, { p: 0.12, only: cue.id, guard: 'dead' });
    }
    if (this.isHumanSlot(cue.killer)) {
      const kills = (this.humanKills.get(cue.killer) ?? []).filter((t) => nowMs - t <= CHATTER.multiKillMs);
      kills.push(nowMs);
      this.humanKills.set(cue.killer, kills);
      const last = this.praisedAt.get(cue.killer);
      if (last !== undefined && nowMs - last < 2000) return;
      this.praisedAt.set(cue.killer, nowMs);
      this.plan(kTeam, 'praise', nowMs, { p: kills.length >= 2 ? 0.3 : 0.06, who: cue.killer });
    } else if (this.isBot(cue.killer) && cue.assists.some((a) => this.isHumanSlot(a) && this.teamOf(a) === kTeam)) {
      this.plan(kTeam, 'thanks', nowMs, { p: 0.1, only: cue.killer });
    }
  }

  private onEnd(winner: Team, nowMs: number): void {
    if (this.endAt >= 0) return;
    this.endAt = nowMs;
    // pending lines that are not end lines are moot now
    for (const p of this.pending) if (!p.end && !p.follow) this.drop(p, 'end');
    this.pending = this.pending.filter((p) => p.end || p.follow);
    if (this.silenced) return;
    for (const t of [0, 1] as const) {
      const cat: BotCategory = this.hasHuman[t] ? (winner === t ? 'gg_win' : 'gg_lose') : 'gg_all';
      const first = this.plan(t, cat, nowMs, { p: 0.45, end: true, ch: this.hasHuman[t] ? 'team' : 'all' });
      if (first) this.plan(t, cat, nowMs, { p: 0.15, end: true, ch: this.hasHuman[t] ? 'team' : 'all', exclude: first.slot });
    }
  }

  private botsOf(team: Team): number[] {
    return this.bots.filter((s) => this.teamOf(s) === team);
  }

  private inFight(slot: number): boolean {
    const st = this.states.get(slot);
    return !!st && st.alive && (st.intent === 'fight' || st.enemies > 0);
  }

  private guardOk(slot: number, g: Guard): boolean {
    const st = this.states.get(slot);
    if (!st) return g !== 'dead' && g !== 'aliveLow' && g !== 'retreat';
    switch (g) {
      case 'alive':
        return st.alive;
      case 'dead':
        return !st.alive;
      case 'aliveLow':
        return st.alive && st.hp < 0.5;
      case 'retreat':
        return st.alive && (st.intent === 'retreat' || st.hp < 0.3);
      case 'notFight':
        return !st.alive || (st.intent !== 'fight' && st.enemies === 0);
      default:
        return true;
    }
  }

  /**
   * Plan one line of `cat` for `team`, if its roll passes and a bot, a line and a time fit. Returns what it planned
   * (or null). Never spends budget: that happens when the line is sent.
   */
  private plan(
    team: Team,
    cat: BotCategory,
    nowMs: number,
    o: {
      p: number;
      prefer?: number;
      only?: number;
      exclude?: number;
      who?: number;
      tag?: string;
      guard?: Guard;
      ch?: Channel;
      reaction?: boolean;
      end?: boolean;
      calm?: boolean;
      quickOnly?: boolean;
    },
  ): Pending | null {
    if (this.silenced) return null;
    const free = this.budget[team] - this.spent[team] - this.reserved[team];
    if (free <= 0) return null;
    const ch: Channel = o.ch ?? 'team';
    // a team without humans has nobody to talk to: its bots only say all-chat phrases (start and end)
    if (ch === 'team' && !this.hasHuman[team]) return null;
    if (!this.rng.chance(o.p)) return null;
    // the bot: the relevant one when it can talk, else a random talker on the team
    let cands = this.botsOf(team).filter((s) => s !== o.exclude);
    if (o.only !== undefined) cands = cands.filter((s) => s === o.only);
    cands = cands.filter((s) => {
      const k = this.personas.get(s)!.kind;
      // a silent persona says at most "gg" at the end (p 0.25)
      return k !== 'silent' || (o.end === true && this.rng.chance(0.25));
    });
    if (o.guard) cands = cands.filter((s) => this.guardOk(s, o.guard!));
    // calm lines (start, objective calls) come from a bot that is not mid-fight
    if (o.calm) cands = cands.filter((s) => !this.inFight(s));
    if (!cands.length) return null;
    const slot = o.prefer !== undefined && cands.indexOf(o.prefer) !== -1 ? o.prefer : this.rng.pick(cands);
    const persona = this.personas.get(slot)!;
    const silentGg = persona.kind === 'silent';
    // the channel's tier now (all chat is phrases only for everyone)
    const tier: ChatTier = ch === 'all' || o.quickOnly ? 'quick' : this.tiers[team];
    const seen = ch === 'all' ? this.mergedSeen() : (this.setup.seen?.[team] ?? null);
    const fight = this.inFight(slot);
    const side = this.setup.sides?.[team];
    const whoName = o.who !== undefined ? this.firstName(o.who) : null;
    let lines = (LINES_BY_CAT[cat] ?? []).filter((l) => {
      if (o.tag && l.tag && l.tag !== o.tag) return false;
      if (cat === 'reaction' && l.tag !== o.tag) return false;
      if (l.side && l.side !== side) return false;
      if (l.text.indexOf('{who}') !== -1 && !whoName) return false;
      if (l.text.indexOf('{lane}') !== -1 && !this.states.get(slot)?.lane) return false;
      if (tier === 'quick' && l.q === undefined) return false;
      if (silentGg && l.tok !== 'gg') return false;
      if (!l.tok && this.usedLids.has(l.lid)) return false;
      if (!l.tok && seen?.lids.has(l.lid)) return false;
      return true;
    });
    // flavour (cats vs dogs) only at the persona's own small rate; {who} at most 5% of praise
    lines = lines.filter((l) => (!l.side || this.rng.chance(persona.flavour * 4)) && (l.text.indexOf('{who}') === -1 || this.rng.chance(0.05 * 4)));
    if (!lines.length) {
      this.count('memory');
      return null;
    }
    // pick and dress (a few tries for a surface the recipients have not seen)
    const mood = MOOD[cat] ?? 'neutral';
    let chosen: { line: BotLine; surface: string; k: 't' | 'q'; typo: { word: string } | null } | null = null;
    for (let tries = 0; tries < 6 && !chosen; tries++) {
      const line = this.rng.pick(lines);
      if (tier === 'quick') {
        const surface = `q:${line.q}`;
        if (seen?.surf.has(surface) && !line.tok) continue;
        if (line.tok && seen?.tok.get(line.tok)?.has(surface)) continue;
        if (line.tok && this.sentLog.some((x) => x.tok === line.tok && x.surface === surface)) continue;
        if (this.recentSurface(surface, nowMs)) continue;
        chosen = { line, surface, k: 'q', typo: null };
        break;
      }
      let base = line.text;
      if (whoName) base = base.replace('{who}', whoName);
      const lane = this.states.get(slot)?.lane;
      if (lane) base = base.replace('{lane}', lane);
      let surface = dress(base, persona, this.rng, { mood, max: CHATTER.maxChars });
      if (fight && surface.length >= 6) surface = base.length < 6 ? base : '';
      if (!surface) continue;
      const norm = normSurface(surface);
      if (seen?.surf.has(norm)) continue;
      if (line.tok && seen?.tok.get(line.tok)?.has(norm)) continue;
      if (line.tok && this.sentLog.some((x) => x.tok === line.tok && normSurface(x.surface) === norm)) continue;
      if (this.recentSurface(norm, nowMs)) continue;
      // at most one typo, never in a fight line, filtered again (a refused typo falls back to the clean line)
      let typo: { word: string } | null = null;
      if (!fight && !onlyEmoji(surface) && this.rng.chance(persona.typo)) {
        const t = addTypo(surface, this.rng, whoName ? [whoName] : []);
        if (t && this.passes(t.text)) {
          surface = t.text;
          typo = { word: t.word };
        }
      }
      if (!this.passes(surface)) {
        this.stats.filterRejects++;
        surface = base;
        typo = null;
        if (!this.passes(surface)) {
          this.count('filter');
          continue;
        }
      }
      chosen = { line, surface, k: 't', typo };
    }
    if (!chosen) {
      this.count('memory');
      return null;
    }
    // when: a human-like reaction, then the typing
    const reactMs = chosen.k === 'q' ? this.rng.range(800, 2000) : Math.max(1500, Math.min(6000, this.rng.lognormal(2800, 0.35)));
    const len = chosen.k === 'q' ? 0 : chosen.surface.length;
    const type = len ? typingMs(len, persona.cps, this.rng.range(0.85, 1.25), this.rng.range(300, 800)) : 0;
    const dueAt = nowMs + reactMs + type;
    if (!this.spacingOk(slot, dueAt, !!o.reaction, !!o.end)) {
      this.count('gap');
      return null;
    }
    const p: Pending = {
      uid: ++this.uid,
      slot,
      team,
      ch,
      line: chosen.line,
      k: chosen.k,
      surface: chosen.surface,
      dueAt,
      guard: o.guard ?? 'none',
      follow: false,
      parent: 0,
      reaction: !!o.reaction,
      end: !!o.end,
      postponed: false,
    };
    this.pending.push(p);
    this.reserved[team]++;
    this.times.push({ at: dueAt, slot, reaction: p.reaction, end: p.end, uid: p.uid });
    if (!chosen.line.tok) this.usedLids.add(chosen.line.lid);
    // chatty habits: a split second part, or a "*word" fix (text only; spend no budget)
    if (chosen.k === 't' && persona.kind === 'chatty') {
      if (chosen.typo && this.rng.chance(persona.fixRate)) this.follow(p, `*${chosen.typo.word}`, this.rng.range(1500, 3000), persona);
      else if (FOLLOW_OF[cat] && !fight && this.rng.chance(0.15)) {
        const group = FOLLOW_OF[cat];
        const opts = (LINES_BY_CAT.follow ?? []).filter((l) => l.tag === group && !this.usedLids.has(l.lid) && !seen?.lids.has(l.lid));
        if (opts.length) {
          const fl = this.rng.pick(opts);
          this.usedLids.add(fl.lid);
          const s = dress(fl.text, persona, this.rng, { mood, max: CHATTER.maxChars });
          this.follow(p, s, this.rng.range(1000, 2200) + typingMs(s.length, persona.cps, this.rng.range(0.85, 1.25), 0), persona, fl);
        }
      }
    }
    return p;
  }

  private follow(parent: Pending, text: string, afterMs: number, _persona: Persona, line?: BotLine): void {
    if (!this.passes(text)) return;
    this.pending.push({
      uid: ++this.uid,
      slot: parent.slot,
      team: parent.team,
      ch: parent.ch,
      line: line ?? { lid: `${parent.line.lid}*`, cat: 'follow', text },
      k: 't',
      surface: text,
      dueAt: parent.dueAt + afterMs,
      guard: 'none',
      follow: true,
      parent: parent.uid,
      reaction: false,
      end: parent.end,
      postponed: false,
    });
  }

  private spacingOk(slot: number, at: number, reaction: boolean, end: boolean): boolean {
    for (const t of this.times) {
      const d = Math.abs(t.at - at);
      if (end || t.end) {
        // the end lines only keep a short gap between themselves
        if (end && t.end && d < 2000) return false;
        continue;
      }
      const room = reaction || t.reaction ? CHATTER.reactRoomGapMs : CHATTER.roomGapMs;
      const bot = reaction || t.reaction ? CHATTER.reactBotGapMs : CHATTER.botGapMs;
      if (d < room) return false;
      if (t.slot === slot && d < bot) return false;
    }
    return true;
  }

  private recentSurface(norm: string, nowMs: number): boolean {
    return this.recent.some((r) => r.surf === norm && Math.abs(nowMs - r.at) < CHATTER.sameSurfaceMs) || this.pending.some((p) => normSurface(p.surface) === norm && Math.abs(p.dueAt - nowMs) < CHATTER.sameSurfaceMs);
  }

  private passes(text: string): boolean {
    return !this.setup.filter || this.setup.filter(text);
  }

  private mergedSeen(): SeenSet | null {
    const a = this.setup.seen?.[0];
    const b = this.setup.seen?.[1];
    if (!a && !b) return null;
    const out: SeenSet = { lids: new Set([...(a?.lids ?? []), ...(b?.lids ?? [])]), surf: new Set([...(a?.surf ?? []), ...(b?.surf ?? [])]), tok: new Map() };
    for (const m of [a?.tok, b?.tok])
      if (m)
        m.forEach((v, k) => {
          const set = out.tok.get(k) ?? new Set<string>();
          v.forEach((x) => set.add(x));
          out.tok.set(k, set);
        });
    return out;
  }

  private firstName(slot: number): string | null {
    const n = this.setup.names?.[slot];
    if (!n) return null;
    const w = n.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    return /^[a-z]{2,12}$/.test(w) ? w : null;
  }

  // ------------------------------------------------------------------------------------------------ sending

  private check(p: Pending, nowMs: number): DropReason | 'postpone' | null {
    if (this.silenced) return 'probe';
    if (p.follow) return this.emitted.has(p.parent) ? null : 'guard';
    if (p.end) {
      if (nowMs - this.endAt > CHATTER.endWindowMs) return 'end';
    } else if (this.endAt >= 0) return 'end';
    if (!this.guardOk(p.slot, p.guard)) return 'guard';
    // in a fight only a very short line gets typed
    if (p.k === 't' && this.inFight(p.slot) && p.surface.length >= 6) return 'guard';
    if (!p.reaction && nowMs - this.lastHumanAt < CHATTER.quietMs) return 'quiet';
    const bark = this.lastBark.get(p.slot);
    if (bark !== undefined && nowMs - bark < CHATTER.barkGapMs) {
      if (p.postponed) return 'gap';
      p.postponed = true;
      p.dueAt = bark + CHATTER.barkGapMs;
      return 'postpone';
    }
    if (this.recent.some((r) => r.surf === normSurface(p.surface) && nowMs - r.at < CHATTER.sameSurfaceMs)) return 'dup';
    if (this.spent[p.team] >= this.budget[p.team]) return 'budget';
    // the tier may have dropped since the plan (an under-16 took a seat): a phrase, or nothing
    if (p.k === 't' && (p.ch === 'all' || this.tiers[p.team] === 'quick')) {
      if (p.line.q === undefined) return 'tier';
      p.k = 'q';
      p.surface = `q:${p.line.q}`;
    }
    return null;
  }

  private drop(p: Pending, why: DropReason): void {
    if (!p.follow) {
      this.reserved[p.team] = Math.max(0, this.reserved[p.team] - 1);
      const i = this.times.findIndex((t) => t.uid === p.uid);
      if (i >= 0) this.times.splice(i, 1);
      if (!p.line.tok) this.usedLids.delete(p.line.lid);
    }
    this.count(why);
  }

  private count(why: DropReason): void {
    this.stats.drops[why] = (this.stats.drops[why] ?? 0) + 1;
  }

  private emit(p: Pending, nowMs: number): Planned {
    if (!p.follow) {
      this.reserved[p.team] = Math.max(0, this.reserved[p.team] - 1);
      this.spent[p.team]++;
      this.stats.sent[p.team]++;
      this.stats.byCat[p.line.cat] = (this.stats.byCat[p.line.cat] ?? 0) + 1;
    }
    this.emitted.add(p.uid);
    const surface = p.k === 'q' ? `q:${p.line.q}` : normSurface(p.surface);
    this.recent.push({ at: nowMs, surf: surface });
    const out: Planned = {
      slot: p.slot,
      team: p.team,
      ch: p.ch,
      k: p.k,
      ...(p.k === 'q' ? { id: p.line.q } : { text: p.surface }),
      lid: p.line.lid,
      cat: p.line.cat,
      surface,
      ...(p.line.tok ? { tok: p.line.tok } : {}),
      follow: p.follow,
      at: nowMs,
    };
    this.sentLog.push(out);
    return out;
  }
}
