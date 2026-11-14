/**
 * NetHost in spectate mode (SPECTATE.md §4), inline (no Worker in node): it asks for the stream from turn 0, draws
 * snapshots as delayed turns arrive, sends nothing that could reach the match (no command, hash, vote, social, chat,
 * away or back), asks again after a reconnect and leaves with `spectate.leave`.
 */
import { describe, expect, it } from 'vitest';
import { NetHost } from '../../src/net/net-host';
import { encodeCatchup, encodeTurnBody, decodeServerBinary, type MatchMsg, type ServerJson, type ServerBinary } from '../../src/net/proto';
import { fillPicksParty } from '../../src/sim/party';
import { Op, type Snapshot } from '../../src/sim/api';
import type { PartySocket, SocketListener } from '../../src/net/socket';

function match(): MatchMsg {
  const { picks, tricks } = fillPicksParty(7, [
    { slot: 0, hero: 'gabe', trick: 'hiss' },
    { slot: 1, hero: 'clem', trick: 'pounce' },
  ]);
  return { t: 'match', room: 'abcdef123456', config: { seed: 7, picks: picks as string[], tricks: tricks as string[], difficulty: 'normal', humans: [0, 1] }, cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: ['Mira', 'Tom', null, null, null, null], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 0, watch: { delayMs: 15000, follow: 0, viewers: 1, max: 20, kind: 'party' } };
}

function fakeSocket() {
  const sent: unknown[] = [];
  let l: SocketListener = {};
  const s = {
    listen: (x: SocketListener) => void (l = x),
    tap: () => undefined,
    sendJson: (m: unknown) => void sent.push(m),
    sendCmd: (b: Uint8Array) => (sent.push({ cmd: b }), 1),
    sendHash: (tick: number) => void sent.push({ hash: tick }),
    beatNow: () => undefined,
    rttStats: () => ({ p50: 0, p95: 0, jitterP95: 0, n: 0 }),
    lastTurn: 0,
    rttMs: 0,
    serverOffsetMs: 0,
    reconnects: 0,
    open: true,
    backlogged: false,
  };
  return { sent, socket: s as unknown as PartySocket, emit: () => l };
}

describe('NetHost spectate mode', () => {
  it('streams from turn 0, draws turns, never plays, resyncs on a reconnect, leaves with spectate.leave', async () => {
    const { sent, socket, emit } = fakeSocket();
    const snaps: Snapshot[] = [];
    const h = new NetHost(socket, match(), { worker: false, visibility: false, spectate: { snap: (s) => snaps.push(s) } });
    let welcomed = -1;
    h.listen({ welcome: (w) => (welcomed = w.slot) });
    h.join();
    await new Promise((r) => setTimeout(r, 5));
    expect(welcomed).toBe(1);
    expect(sent).toContainEqual({ t: 'sync', fromTurn: 0 });
    const bodies = Array.from({ length: 60 }, (_, turn) => encodeTurnBody({ turn, modeMask: 0, acks: [], entries: [] }));
    const flat = new Uint8Array(bodies.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of bodies) {
      flat.set(b, at);
      at += b.length;
    }
    const raw = encodeCatchup(0, 60, true, flat);
    emit().binary?.(decodeServerBinary(raw) as ServerBinary, raw);
    for (let i = 0; i < 400 && !snaps.some((s) => s.clock.tick === 120); i++) await new Promise((r) => setTimeout(r, 10));
    expect(Math.max(...snaps.map((s) => s.clock.tick))).toBe(120);
    h.send({ op: Op.Stop } as never);
    h.vote('surrender', true);
    expect(h.social('emote', 0)).toBe(false);
    expect(h.chat('team', { k: 'q', id: 1 })).toBe(false);
    const played = sent.filter((m) => { const t = (m as { t?: string }).t; return t !== 'sync'; });
    expect(played).toEqual([]);
    emit().json?.({ ...match(), you: { slot: -1 } } as ServerJson);
    expect(sent[sent.length - 1]).toMatchObject({ t: 'sync' });
    h.leave();
    expect(sent[sent.length - 1]).toEqual({ t: 'spectate.leave' });
    h.dispose();
  });
});
