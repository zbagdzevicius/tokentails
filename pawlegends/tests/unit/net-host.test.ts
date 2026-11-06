/**
 * Party play N5 (MULTIPLAYER.md §4.1, §1.4): two clients and the referee against an in-process relay room (the
 * backend's own Room class), fed the same TURN bytes: identical hashes; a command sent with x = 123.456 reaches every
 * sim as its quantised value; the NetHost never applies its own command object.
 */
import { describe, expect, it } from 'vitest';
import { Room } from '../../../backend/src/pawlegends/party/room';
import { NetCore, type CoreOut } from '../../src/net/net-core';
import { NetHost } from '../../src/net/net-host';
import { decodeTurnBody, type MatchMsg } from '../../src/net/proto';
import { decodeCommand, encodeCommand, quantize } from '../../src/sim/commands';
import { Op, type Command } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, hash, playerBotCommands, step } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';

function config(seed: number) {
  const seats = [
    { slot: 0, hero: 'clem' as const, trick: 'pounce' as const },
    { slot: 1, hero: 'sage' as const, trick: 'snack' as const },
  ];
  const { picks, tricks } = fillPicksParty(seed, seats);
  return { seed, picks: picks as string[], tricks: tricks as string[], difficulty: 'easy', humans: [0, 1] };
}

describe('net-host (N5)', { timeout: 120_000 }, () => {
  it('two clients and a referee on the same TURN bytes stay identical; commands arrive quantised', () => {
    const cfg = config(99);
    const bodies: Uint8Array[] = [];
    const room = new Room({ id: 'r', humans: [0, 1], occupied: [0, 1], difficulty: 'easy', forfeitFrom: 0, nowMs: 0, startMs: 0 }, { turn: (_f, b) => bodies.push(b), json: () => undefined, catchup: () => undefined });
    room.connect(0, 0);
    room.connect(1, 0);
    room.loaded(0);
    room.loaded(1);
    const outA: CoreOut[] = [];
    const a = new NetCore((m) => outA.push(m));
    const b = new NetCore(() => undefined);
    a.start({ config: cfg, slot: 0 });
    b.start({ config: cfg, slot: 1 });
    // the referee: a plain match fed the same turns
    const ref = createMatch({ ...cfg, picks: cfg.picks as never, tricks: cfg.tricks as never, difficulty: 'easy' });
    // "humans": player-bots thinking on client A's view of the world (any command source works)
    const brain = createMatch({ ...cfg, picks: cfg.picks as never, tricks: cfg.tricks as never, difficulty: 'easy' });
    const bots = [createPlayerBotFor(brain, 'normal', 0), createPlayerBotFor(brain, 'normal', 1)];
    const seq = [0, 0];
    let now = 0;
    const odd: Command = { op: Op.Move, x: 123.456, y: 40_000.7 };
    room.advance(0); // turn 0 opens: loaded, connected slots become human
    expect(room.intake(1, ++seq[1], encodeCommand(odd), now)).toBe('ok');
    for (let turn = 0; turn < 900; turn++) {
      now += 200 / 3;
      for (let s = 0; s < 2; s++) for (const c of playerBotCommands(brain, bots[s])) room.intake(s, ++seq[s], encodeCommand(c), now);
      for (let s = 0; s < 2; s++) room.beat(s, turn, now);
      room.advance(now + 1);
      const body = bodies[bodies.length - 1];
      const f = decodeTurnBody(body);
      for (let sub = 0; sub < 2; sub++) {
        const per: Command[][] = [[], [], []];
        for (const e of f.entries) if (e.sub === sub) per[e.slot].push(decodeCommand(e.cmd));
        step(ref, per[0], per);
        step(brain, per[0], per);
      }
      a.turns(body, true);
      b.turns(body, true);
      a.pace(now);
      b.pace(now);
    }
    // a couple of slots to drain the jitter buffers
    for (let i = 0; i < 10; i++) {
      a.pace(now + i * 70);
      b.pace(now + i * 70);
    }
    expect(a.applied).toBe(b.applied);
    expect(a.applied).toBe(bodies.length - 1);
    expect(a.worldHash).toBe(b.worldHash);
    expect(a.worldHash).toBe(hash(ref) >>> 0);
    // the odd coordinate went through the wire as its quantised value
    const first = decodeTurnBody(bodies[0]).entries.find((e) => e.slot === 1)!;
    expect(decodeCommand(first.cmd)).toEqual(quantize(odd));
    expect(outA.some((m) => m.t === 'hash')).toBe(true);
  });

  it('NetHost: own commands go only to the socket (encoded); forfeit becomes a surrender vote; slot 1 pings are social', () => {
    const sent: Uint8Array[] = [];
    const json: object[] = [];
    const socket = {
      listen: () => undefined,
      sendCmd: (b: Uint8Array) => sent.push(b),
      sendJson: (m: object) => json.push(m),
      sendHash: () => undefined,
      beatNow: () => undefined,
      rttMs: 50,
      lastTurn: 0,
    };
    const match = { t: 'match', room: 'r', config: config(5), cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: [], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 11 } as unknown as MatchMsg;
    const h = new NetHost(socket as never, match, { worker: false, visibility: false });
    h.send({ op: Op.Cast, slot: 1, x: 12_345.6, y: 777, id: 255 });
    expect(decodeCommand(sent[0])).toEqual(quantize({ op: Op.Cast, slot: 1, x: 12_345.6, y: 777, id: 255 }));
    h.send({ op: Op.Forfeit });
    h.send({ op: Op.Ping, kind: 1, x: 100, y: 200, id: 255 });
    expect(json).toEqual([
      { t: 'vote', kind: 'surrender', yes: true },
      { t: 'social', kind: 'ping', id: 1, x: 100, y: 200 },
    ]);
    expect(sent).toHaveLength(1);
    h.dispose();
  });
});
