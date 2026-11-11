import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { encodeTurnBody } from './net';
import { LoopGate } from './loop-gate';
import { TURN_MS } from './party-limits';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { Room, type RoomIO } from './room';
import { RoomScheduler } from './room-scheduler';
import { MemoryRoomStore } from './room-store';

/*
 * LATENCY-PLAN R5: nothing on the turn path awaits. The room's clock (`Room.advance`, the scheduler's `wake`) is
 * synchronous, and the TURN fan-out to sockets and the referee never touches the room store (Mongo): a checkpoint is
 * started beside the loop (`afterAdvance`, fire and forget), never inside a turn.
 */

const isThenable = (v: unknown): boolean => !!v && typeof (v as { then?: unknown }).then === 'function';

/** A room store whose every call throws while `armed` (and counts the calls). */
class TrippedStore extends MemoryRoomStore {
    armed = false;
    calls: string[] = [];
}
function trip(store: TrippedStore): TrippedStore {
    const proto = MemoryRoomStore.prototype;
    for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const orig = (store as any)[name];
        if (typeof orig !== 'function') continue;
        (store as any)[name] = (...args: unknown[]) => {
            if (store.armed) {
                store.calls.push(name);
                throw new Error(`room store ${name} called on the turn path`);
            }
            return orig.apply(store, args);
        };
    }
    return store;
}

describe('turn path never awaits (R5)', () => {
    it('Room.advance and RoomScheduler.wake return nothing (no promise to await)', () => {
        const turns: number[] = [];
        const io: RoomIO = { turn: (_f, _b, t) => void turns.push(t), json: () => undefined, catchup: () => undefined };
        const room = new Room(
            {
                id: 'r1',
                humans: [0, 1],
                occupied: [0, 1],
                difficulty: 'normal',
                forfeitFrom: 0,
                nowMs: 0,
                startMs: 1000,
            },
            io
        );
        for (const s of [0, 1]) {
            room.connect(s, 0);
            room.loaded(s);
        }
        const r = room.advance(1000 + TURN_MS * 3 + 1);
        expect(isThenable(r)).toBe(false);
        expect(r).toBeUndefined();
        expect(turns).toEqual([0, 1, 2]);
        const timers: (() => void)[] = [];
        const sched = new RoomScheduler({
            now: () => 1000 + TURN_MS * 5 + 1,
            setTimer: fn => timers.push(fn),
            clearTimer: () => undefined,
        });
        sched.add(room);
        const w = sched.wake();
        expect(isThenable(w)).toBe(false);
        expect(turns).toEqual([0, 1, 2, 3, 4]);
        sched.stop();
    });

    describe('the relay fan-out', () => {
        let server: Server;
        let relay: PartyRelay;
        let store: TrippedStore;

        beforeEach(async () => {
            process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'spec-secret-0123456789abcdef';
            server = createServer();
            await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
            void (server.address() as AddressInfo).port;
            store = trip(new TrippedStore());
            relay = new PartyRelay({
                server,
                store,
                tickets: new PartyTicketService(),
                referee: new RefereePool({ inline: true }),
                originAllowed: () => true,
                gate: new LoopGate(() => 0),
            });
        });

        afterEach(async () => {
            store.armed = false;
            await relay.shutdown();
            await new Promise(r => server.close(r));
        });

        it('a TURN goes to sockets and the referee without a room store call, synchronously', () => {
            const any = relay as any;
            any.rooms.set('r1', { room: { id: 'r1' }, seats: new Map(), party: 'p1' });
            const io = any.roomIO('r1');
            const body = encodeTurnBody({ turn: 0, modeMask: 0, acks: [], entries: [] });
            const frame = new Uint8Array(body.length + 1);
            frame.set(body, 1);
            store.armed = true;
            const r = io.turn(frame, body, 0);
            expect(isThenable(r)).toBe(false);
            expect(store.calls).toEqual([]);
            any.rooms.delete('r1');
        });

        it('the trip wire works (a store call while armed throws)', () => {
            store.armed = true;
            expect(() => store.getParty('p1')).toThrow(/turn path/);
            expect(store.calls).toEqual(['getParty']);
        });
    });
});
