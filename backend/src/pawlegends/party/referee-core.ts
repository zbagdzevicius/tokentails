/*
 * The referee's per-room logic (docs/plans/moba/MULTIPLAYER.md §3.3, §6): steps a room's match from its TURN frames,
 * exactly like every client does, flies the pilots of piloted slots, reports the hash trail and the end. Pure (no
 * worker globals): the worker (referee.worker.ts) and the in-process pool used by specs both drive it.
 *
 * Relative imports only: the worker loads this file by path, without the `src/` alias.
 */
import { partySimFor, simFor, SIM_VERSIONS } from '../../vendor/pawlegends-sim';
import type {
    PawlegendsCommand,
    PawlegendsMatchHandle,
    PawlegendsPartyReplayRecord,
    PawlegendsPartySim,
    PawlegendsPilot,
    PawlegendsPvpReplayRecord,
    PawlegendsSlotStats,
} from '../../vendor/pawlegends-sim';
import { MAX_HUMANS, TURN_TICKS, decodeTurnBody, encodeTurnBody, splitTurnBodies } from './net';
import { IntelCounter, type SlotIntel } from './referee-intel';
import {
    cuesFromEvents,
    heroesFromWorld,
    readHandle,
    statesFromHeroes,
    type BotState,
    type ChatCue,
} from '../../vendor/pawlegends-chat/cues';

/**
 * The optional read-only sight export (SOCIAL-RANKED.md §9.1): ships with the next SIM_VERSION bump; frozen bundles
 * have none, and their rooms carry no `intel`.
 */
type HeroSight = (m: PawlegendsMatchHandle, out: Int32Array) => void;
const heroSightOf = (sim: PawlegendsPartySim): HeroSight | null => {
    const f = (sim as { heroSight?: HeroSight }).heroSight;
    return typeof f === 'function' ? f : null;
};

export interface RefereeConfig {
    seed: number;
    picks: string[];
    tricks: string[];
    difficulty: string;
    humans: number[];
    /** Casual PvP (sim v16+): humans on both teams; the record is a PvpReplayRecord (v: 3). */
    mode?: 'pvp';
    fillDifficulty?: [string, string];
    /** 5v5 Classic (sim v19+, MAP-5V5.md §9.1): 'hearthwood' plays 10 slots. Absent: Crossing (6). */
    map?: 'crossing' | 'hearthwood';
}

/** Hero slots of a room on `map` (the wire carries up to MAX_HUMANS). */
export const slotsOfConfig = (config: Pick<RefereeConfig, 'map'>): number => (config.map === 'hearthwood' ? 10 : 6);

export interface RefereeEnd {
    winner: number;
    outcome: 'won' | 'lost';
    reason: string;
    ticks: number;
    finalHash: string;
    stats: PawlegendsSlotStats[];
    record: PawlegendsPartyReplayRecord | PawlegendsPvpReplayRecord | null;
    /** PvP on a sim with `heroSight`: the "acts on hidden" counts per human slot (SOCIAL-RANKED.md §9.2). */
    intel?: SlotIntel[];
}

export interface TurnOutcome {
    /** Trail hashes reached in this turn (every 30 ticks). */
    hashes: { tick: number; hash: number }[];
    /** Pilot commands produced while stepping, per slot (to inject into the open turn). */
    pilot: { slot: number; cmds: Uint8Array[] }[];
    aliveMask: number;
    end?: RefereeEnd;
    /** In-match bot chatter (MATCH-CHAT.md §5.1): this turn's cues and, once a second, the fill bots' states. */
    cues?: ChatCue[];
    states?: BotState[];
}

/** What a room's referee reads for the bot chatter: the fill bots to sample (never a human's or a pilot's seat). */
export interface RefereeChat {
    bots: number[];
}

/** The profile a pilot flies (§3.2: the strongest non-pinger player profile). */
export const PILOT_PROFILE = 'normal';

/** The party sim for a pinned {simVersion, simHash}, or null. */
export function refereeSim(simVersion: number, simHash: string): PawlegendsPartySim | null {
    return partySimFor(simVersion, simHash)?.party ?? null;
}

/** The live party sim (specs, the relay's default). */
export function liveSim(): PawlegendsPartySim {
    // newest vendored version with a party API (sim v21: a hard-coded list stopped at v20)
    for (let i = SIM_VERSIONS.length - 1; i >= 0; i--) {
        const s = simFor(SIM_VERSIONS[i]);
        if (s?.party) return s.party;
    }
    throw new Error('no vendored party sim');
}

export class RefereeRoom {
    readonly m: PawlegendsMatchHandle;
    private readonly pilots: (PawlegendsPilot | null)[] = new Array(MAX_HUMANS).fill(null);
    nextTurn = 0;
    ended: RefereeEnd | null = null;
    private trailSeen = 0;
    /** Hero slots of this room (6, or 10 on Hearthwood). */
    private readonly slots: number;
    /**
     * Sim v19: an idle pilot whose `playerBotCommands` rebinds the sim's map to this match (an O(1) no-op when it is
     * bound already). A worker steps rooms of both maps, and `decodeCommand` reads the bound map's bounds (a Hearthwood
     * move to y = 100 m is out of Crossing's 60 m), so every decode runs with this room's map bound.
     */
    private readonly binder: PawlegendsPilot | null;
    /** The map-hack signal (PvP rooms on a sim with `heroSight` only, and never in a log re-check). */
    private readonly intel: IntelCounter | null;

    /** The chat cue reader (only for live rooms with fill bots, never in a log re-check). Read only: no hash moves. */
    private readonly chat: RefereeChat | null;
    private readonly teamSize: number;

    constructor(
        readonly sim: PawlegendsPartySim,
        readonly config: RefereeConfig,
        private readonly flyPilots = true,
        chat?: RefereeChat | null
    ) {
        this.chat = flyPilots && chat && chat.bots.length ? chat : null;
        this.teamSize = config.map === 'hearthwood' ? 5 : 3;
        this.m = sim.createMatch(config);
        this.slots = slotsOfConfig(config);
        this.binder = sim.MAP_IDS ? sim.createPlayerBotFor(this.m, 'idle', 0) : null;
        const sight = config.mode === 'pvp' && flyPilots ? heroSightOf(sim) : null;
        this.intel = sight
            ? new IntelCounter(this.slots, this.slots / 2, config.humans, out => sight(this.m, out), config.picks)
            : null;
    }

    /** Bind this room's map before any decode outside `step` (sim v19+; older bundles have one map). */
    private bindMap(): void {
        if (this.binder) this.sim.playerBotCommands(this.m, this.binder);
    }

    get tick(): number {
        return this.sim.tickOf(this.m);
    }

    /** Apply the stored body of turn `nextTurn`. Out-of-order or duplicate turns are refused (the room orders them). */
    applyTurn(body: Uint8Array): TurnOutcome {
        const f = decodeTurnBody(body);
        if (f.turn !== this.nextTurn) throw new Error(`referee: turn ${f.turn}, expected ${this.nextTurn}`);
        this.nextTurn++;
        const out: TurnOutcome = { hashes: [], pilot: [], aliveMask: 0 };
        if (this.ended) return out;
        const pilotOut: Uint8Array[][] = Array.from({ length: this.slots }, () => []);
        for (let sub = 0; sub < TURN_TICKS; sub++) {
            this.bindMap();
            const per: PawlegendsCommand[][] = Array.from({ length: this.slots }, () => []);
            for (const e of f.entries) {
                if (e.sub !== sub) continue;
                // defence in depth: the relay decodes every command before a TURN; an entry that still does not
                // decode is skipped here exactly as every client skips it (net-core.ts), never thrown on
                let c: PawlegendsCommand;
                try {
                    c = this.sim.decodeCommand(e.cmd);
                } catch {
                    continue;
                }
                if (e.slot < this.slots) per[e.slot].push(c);
            }
            if (this.flyPilots) {
                for (let s = 0; s < this.slots; s++) {
                    if (!this.config.humans.includes(s) || ((f.modeMask >>> s) & 1) === 0) continue;
                    if (!this.pilots[s]) this.pilots[s] = this.sim.createPlayerBotFor(this.m, PILOT_PROFILE, s);
                    for (const c of this.sim.playerBotCommands(this.m, this.pilots[s]!))
                        pilotOut[s].push(this.sim.encodeCommand(c));
                }
            }
            const tick = this.intel ? this.sim.tickOf(this.m) : 0;
            this.intel?.beforeStep(tick, per, f.modeMask);
            this.sim.step(this.m, per[0], per);
            this.intel?.afterStep(tick + 1);
            if (this.chat) this.readChat(out);
            this.collectTrail(out);
            const r = this.sim.result(this.m);
            if (r) {
                this.ended = {
                    winner: r.winner,
                    outcome: r.outcome,
                    reason: r.reason,
                    ticks: r.ticks,
                    finalHash: r.finalHash,
                    stats: r.stats,
                    record:
                        this.config.mode === 'pvp'
                            ? this.sim.pvpReplayRecord?.(this.m) ?? null
                            : this.sim.partyReplayRecord(this.m),
                    ...(this.intel ? { intel: this.intel.result() } : {}),
                };
                out.end = this.ended;
                break;
            }
        }
        for (let s = 0; s < this.slots; s++) if (pilotOut[s].length) out.pilot.push({ slot: s, cmds: pilotOut[s] });
        out.aliveMask = this.sim.humanAliveMask(this.m);
        return out;
    }

    /**
     * The bot chatter's cues (MATCH-CHAT.md §5.1): this tick's sim events, and every 30 ticks the fill bots' states.
     * Reads the match handle's `events` and `world` arrays only; never writes, never steps, never draws randomness.
     */
    private readChat(out: TurnOutcome): void {
        const h = readHandle(this.m);
        const cues = cuesFromEvents(h.events, this.slots, this.teamSize);
        if (cues.length) (out.cues ??= []).push(...cues);
        if (this.sim.tickOf(this.m) % 30 === 0) {
            const heroes = heroesFromWorld(h.world, this.slots, this.teamSize);
            if (heroes) out.states = statesFromHeroes(heroes, this.chat!.bots);
        }
    }

    private collectTrail(out: TurnOutcome): void {
        const trail = this.sim.hashTrail(this.m);
        while (this.trailSeen < trail.length) {
            out.hashes.push({ tick: (this.trailSeen + 1) * 30, hash: trail[this.trailSeen] >>> 0 });
            this.trailSeen++;
        }
    }
}

export interface ScoreCheck {
    ok: boolean;
    why?: string;
    verdict?: RefereeEnd;
}

/**
 * §6 item 1: the stored room log re-simmed (raw TURN bodies, no pilots: pilot commands are in the log) must equal the
 * referee's verdict, and `verifyPartyReplay` of the record built from the post-gate logs must equal both.
 */
export function checkRoomLog(
    sim: PawlegendsPartySim,
    config: RefereeConfig,
    log: Uint8Array,
    verdict: { finalHash: string; ticks: number; outcome: string }
): ScoreCheck {
    const r = new RefereeRoom(sim, config, false);
    for (const f of splitTurnBodies(log)) {
        if (r.ended) break;
        r.applyTurn(encodeTurnBody(f));
    }
    const end = r.ended;
    if (!end) return { ok: false, why: 'log does not end the match' };
    if (end.finalHash !== verdict.finalHash || end.ticks !== verdict.ticks || end.outcome !== verdict.outcome)
        return { ok: false, why: 'log re-sim differs from the verdict' };
    if (!end.record) return { ok: false, why: 'no record' };
    const v =
        config.mode === 'pvp'
            ? sim.verifyPvpReplay?.(end.record) ?? { ok: false as const, code: 'PAWLEGENDS_SIM_VERSION' }
            : sim.verifyPartyReplay(end.record);
    if (!v.ok) return { ok: false, why: `record: ${v.code}` };
    if (v.finalHash !== verdict.finalHash || v.ticks !== verdict.ticks || v.outcome !== verdict.outcome)
        return { ok: false, why: 'record verify differs from the verdict' };
    return { ok: true, verdict: end };
}
