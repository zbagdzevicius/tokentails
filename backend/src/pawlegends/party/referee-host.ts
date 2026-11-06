/*
 * The referee's message handler (MULTIPLAYER.md §3.3), shared by the worker thread (referee.worker.ts) and the
 * in-process backend the specs and the e2e harness may use. Many rooms share one isolate: the sim's module scratch
 * state is reset before each use and every step is synchronous (§1.4; referee.spec.ts interleaves rooms).
 * Relative imports only (loaded by path in the worker).
 */
import type { PawlegendsPartySim, PawlegendsSlotStats } from '../../vendor/pawlegends-sim';
import { RefereeRoom, checkRoomLog, refereeSim, type RefereeConfig, type RefereeEnd } from './referee-core';

export type RefereeIn =
    | { t: 'open'; room: string; simVersion: number; simHash: string; config: RefereeConfig }
    | { t: 'turn'; room: string; body: Uint8Array }
    | { t: 'close'; room: string }
    | {
          t: 'verify';
          id: number;
          simVersion: number;
          simHash: string;
          config: RefereeConfig;
          log: Uint8Array;
          verdict: { finalHash: string; ticks: number; outcome: string };
      };

export type RefereeOut =
    | { t: 'hash'; room: string; tick: number; hash: number; alive: number }
    | { t: 'pilot'; room: string; slot: number; cmds: Uint8Array[] }
    | { t: 'progress'; room: string; turn: number; tick: number }
    | { t: 'end'; room: string; end: RefereeEnd }
    | { t: 'error'; room: string; message: string }
    | { t: 'verified'; id: number; ok: boolean; why?: string; stats?: PawlegendsSlotStats[]; reason?: string };

export class RefereeHost {
    private readonly rooms = new Map<string, RefereeRoom>();

    constructor(
        private readonly post: (m: RefereeOut) => void,
        private readonly simOf: (v: number, h: string) => PawlegendsPartySim | null = refereeSim
    ) {}

    get roomCount(): number {
        return this.rooms.size;
    }

    handle(msg: RefereeIn): void {
        switch (msg.t) {
            case 'open': {
                const sim = this.simOf(msg.simVersion, msg.simHash);
                if (!sim) {
                    this.post({ t: 'error', room: msg.room, message: 'no sim for this version' });
                    return;
                }
                this.rooms.set(msg.room, new RefereeRoom(sim, msg.config));
                return;
            }
            case 'turn': {
                const r = this.rooms.get(msg.room);
                if (!r) return;
                let out;
                try {
                    out = r.applyTurn(msg.body);
                } catch (e) {
                    this.post({ t: 'error', room: msg.room, message: String((e as Error)?.message || e) });
                    this.rooms.delete(msg.room);
                    return;
                }
                for (const h of out.hashes)
                    this.post({ t: 'hash', room: msg.room, tick: h.tick, hash: h.hash, alive: out.aliveMask });
                for (const p of out.pilot) this.post({ t: 'pilot', room: msg.room, slot: p.slot, cmds: p.cmds });
                if (r.nextTurn % 15 === 0) this.post({ t: 'progress', room: msg.room, turn: r.nextTurn, tick: r.tick });
                if (out.end) this.post({ t: 'end', room: msg.room, end: out.end });
                return;
            }
            case 'close':
                this.rooms.delete(msg.room);
                return;
            case 'verify': {
                const sim = this.simOf(msg.simVersion, msg.simHash);
                if (!sim) {
                    this.post({ t: 'verified', id: msg.id, ok: false, why: 'no sim' });
                    return;
                }
                try {
                    const c = checkRoomLog(sim, msg.config, msg.log, msg.verdict);
                    this.post({
                        t: 'verified',
                        id: msg.id,
                        ok: c.ok,
                        why: c.why,
                        stats: c.verdict?.stats,
                        reason: c.verdict?.reason,
                    });
                } catch (e) {
                    this.post({ t: 'verified', id: msg.id, ok: false, why: String((e as Error)?.message || e) });
                }
                return;
            }
        }
    }
}
