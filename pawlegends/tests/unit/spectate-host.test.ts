/**
 * The spectate host (SPECTATE.md §4): a MatchHost over the relay's delayed TURN stream, inline (no Worker in node).
 * It asks for the stream from turn 0, draws snapshots as turns arrive, never sends a command, asks again after a
 * reconnect, and hands the end to the session after the relay's `end`.
 */
import { describe, expect, it } from 'vitest';
import { SpectateHost } from '../../src/spectate/host';
import { encodeCatchup, encodeTurnBody, Frame, type MatchMsg, type ServerBinary } from '../../src/net/proto';
import { fillPicksParty } from '../../src/sim/party';
import { Op } from '../../src/sim/api';
import type { PartySocket } from '../../src/net/socket';

function match(): MatchMsg {
  const { picks, tricks } = fillPicksParty(7, [
    { slot: 0, hero: 'gabe', trick: 'hiss' },
    { slot: 1, hero: 'clem', trick: 'pounce' },
  ]);
  return { t: 'match', room: 'abcdef123456', config: { seed: 7, picks: picks as string[], tricks: tricks as string[], difficulty: 'normal', humans: [0, 1] }, cosmetics: { heroSkins: [] }, you: { slot: -1 }, names: ['Mira', 'Tom', null, null, null, null], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 0, watch: { delayMs: 15000, follow: 0, viewers: 1, max: 20, kind: 'party' } };
}

const sock = () => {
  const sent: Record<string, unknown>[] = [];
  return { sent, s: { sendJson: (m: Record<string, unknown>) => sent.push(m), lastTurn: 0 } as unknown as PartySocket };
};

describe('SpectateHost', () => {
  it('starts the sim on the followed slot, asks for turn 0, draws turns, sends no command, resyncs on a reconnect', async () => {
    const { sent, s } = sock();
    const h = new SpectateHost(s, match(), 1, { worker: false });
    const snaps: number[] = [];
    let welcomed = -1;
    h.listen({ welcome: (w) => (welcomed = w.slot), snap: (x) => snaps.push(x.clock.tick) });
    h.join();
    await new Promise((r) => setTimeout(r, 5));
    expect(welcomed).toBe(1);
    expect(sent[0]).toEqual({ t: 'sync', fromTurn: 0 });
    expect(snaps[0]).toBe(0);
    // a CATCHUP of 60 empty turns, then live TURNs
    const bodies = Array.from({ length: 60 }, (_, turn) => encodeTurnBody({ turn, modeMask: 0, acks: [], entries: [] }));
    const flat = new Uint8Array(bodies.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of bodies) {
      flat.set(b, at);
      at += b.length;
    }
    const raw = encodeCatchup(0, 60, true, flat);
    h.binary({ type: Frame.CATCHUP, f: { fromTurn: 0, toTurn: 60, last: true, turns: [] } } as unknown as ServerBinary, raw);
    for (let i = 0; i < 400 && h.lastTurn < 59; i++) await new Promise((r) => setTimeout(r, 10));
    expect(h.lastTurn).toBe(59);
    expect(Math.max(...snaps)).toBe(120);
    h.send({ op: Op.Stop } as never);
    expect(sent.filter((m) => m.t !== 'sync')).toHaveLength(0);
    h.json({ ...match(), t: 'match' });
    expect(sent[sent.length - 1]).toEqual({ t: 'sync', fromTurn: 60 });
    h.leave();
    expect(sent[sent.length - 1]).toEqual({ t: 'spectate.leave' });
    h.dispose();
  });
});
