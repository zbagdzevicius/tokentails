/*
 * The referee's per-room logic (docs/plans/moba/MULTIPLAYER.md §3.3, §6): steps a room's match from its TURN frames,
 * exactly like every client does, flies the pilots of piloted slots, reports the hash trail and the end. Pure (no
 * worker globals): the worker (referee.worker.ts) and the in-process pool used by specs both drive it.
 *
 * Relative imports only: the worker loads this file by path, without the `src/` alias.
 */
import { partySimFor, simFor } from '../../vendor/pawlegends-sim';
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

export interface RefereeConfig {
    seed: number;
    picks: string[];
    tricks: string[];
    difficulty: string;
    humans: number[];
    /** Casual PvP (sim v16+): humans on both teams; the record is a PvpReplayRecord (v: 3). */
    mode?: 'pvp';
    fillDifficulty?: [string, string];
}

export interface RefereeEnd {
    winner: number;
    outcome: 'won' | 'lost';
    reason: string;
    ticks: number;
    finalHash: string;
    stats: PawlegendsSlotStats[];
    record: PawlegendsPartyReplayRecord | PawlegendsPvpReplayRecord | null;
}

export interface TurnOutcome {
    /** Trail hashes reached in this turn (every 30 ticks). */
    hashes: { tick: number; hash: number }[];
    /** Pilot commands produced while stepping, per slot (to inject into the open turn). */
    pilot: { slot: number; cmds: Uint8Array[] }[];
    aliveMask: number;
    end?: RefereeEnd;
}

/** The profile a pilot flies (§3.2: the strongest non-pinger player profile). */
export const PILOT_PROFILE = 'normal';

/** The party sim for a pinned {simVersion, simHash}, or null. */
export function refereeSim(simVersion: number, simHash: string): PawlegendsPartySim | null {
    return partySimFor(simVersion, simHash)?.party ?? null;
}

/** The live party sim (specs, the relay's default). */
export function liveSim(): PawlegendsPartySim {
    const versions = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    for (let i = versions.length - 1; i >= 0; i--) {
        const s = simFor(versions[i]);
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

    constructor(readonly sim: PawlegendsPartySim, readonly config: RefereeConfig, private readonly flyPilots = true) {
        this.m = sim.createMatch(config);
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
        const pilotOut: Uint8Array[][] = Array.from({ length: MAX_HUMANS }, () => []);
        for (let sub = 0; sub < TURN_TICKS; sub++) {
            const per: PawlegendsCommand[][] = Array.from({ length: MAX_HUMANS }, () => []);
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
                per[e.slot].push(c);
            }
            if (this.flyPilots) {
                for (let s = 0; s < MAX_HUMANS; s++) {
                    if (!this.config.humans.includes(s) || ((f.modeMask >>> s) & 1) === 0) continue;
                    if (!this.pilots[s]) this.pilots[s] = this.sim.createPlayerBotFor(this.m, PILOT_PROFILE, s);
                    for (const c of this.sim.playerBotCommands(this.m, this.pilots[s]!))
                        pilotOut[s].push(this.sim.encodeCommand(c));
                }
            }
            this.sim.step(this.m, per[0], per);
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
                };
                out.end = this.ended;
                break;
            }
        }
        for (let s = 0; s < MAX_HUMANS; s++) if (pilotOut[s].length) out.pilot.push({ slot: s, cmds: pilotOut[s] });
        out.aliveMask = this.sim.humanAliveMask(this.m);
        return out;
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
