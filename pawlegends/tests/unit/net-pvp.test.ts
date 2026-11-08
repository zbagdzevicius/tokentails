/**
 * Casual PvP on the client's net core (docs/plans/moba/V16.md §4.3, §5): a full PvP room log with pilot-flown humans on
 * both teams (slots 0, 1, 3, 4) replays on a team-1 seat to the same end as the source match, ends with a PvP record
 * (v 3), and the seat's snapshots are team 1's view.
 */
import { describe, expect, it } from 'vitest';
import { NetCore, viewTeamOf, type CoreOut } from '../../src/net/net-core';
import { encodeTurnBody, splitTurnBodies, type TurnEntry } from '../../src/net/proto';
import { decodeCommand, encodeCommand } from '../../src/sim/commands';
import { createMatch, createPlayerBotFor, playerBotCommands, result, step, hash } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';
import type { Command } from '../../src/sim/api';
import { decodeSnap } from '../../src/host/protocol';

const HUMANS = [0, 1, 3, 4];

function cfg(seed: number) {
  const seats = [
    { slot: 0, hero: 'gabe' as const, trick: 'hiss' as const },
    { slot: 1, hero: 'clem' as const, trick: 'pounce' as const },
    { slot: 3, hero: 'brutus' as const, trick: 'hiss' as const },
    { slot: 4, hero: 'duchess' as const, trick: 'pounce' as const },
  ];
  const { picks, tricks } = fillPicksParty(seed, seats);
  return { seed, picks: picks as string[], tricks: tricks as string[], difficulty: 'hard', humans: HUMANS, mode: 'pvp' as const, fillDifficulty: ['normal', 'normal'] as [string, string] };
}

/** A PvP room log: four pilot-flown humans, two per team, stepped exactly as the referee does. */
function roomLog(seed: number): { bodies: Uint8Array[]; finalHash: number; winner: number } {
  const c = cfg(seed);
  const m = createMatch({ ...c, picks: c.picks as never, tricks: c.tricks as never, difficulty: 'hard', fillDifficulty: c.fillDifficulty as never });
  const bots = HUMANS.map((s) => createPlayerBotFor(m, 'normal', s));
  const out: Uint8Array[] = [];
  for (let turn = 0; !result(m) && turn < 9000; turn++) {
    const entries: TurnEntry[] = [];
    for (let sub = 0 as 0 | 1; sub < 2 && !result(m); sub = (sub + 1) as 0 | 1) {
      const per: Command[][] = [[], [], [], [], [], []];
      HUMANS.forEach((s, i) => {
        for (const cmd of playerBotCommands(m, bots[i]).slice(-1)) {
          entries.push({ slot: s, sub, pilot: false, cmd: encodeCommand(cmd) });
          per[s].push(decodeCommand(encodeCommand(cmd)));
        }
      });
      step(m, per[0], per);
    }
    out.push(encodeTurnBody({ turn, modeMask: 0, acks: [], entries }));
  }
  return { bodies: out, finalHash: hash(m) >>> 0, winner: result(m)?.winner ?? -1 };
}

describe('net core: casual PvP', () => {
  it('a team-1 seat replays a PvP log to the same end and posts a v 3 record; its snapshots are team 1', () => {
    const log = roomLog(4242);
    expect(log.winner === 0 || log.winner === 1).toBe(true);
    const posts: CoreOut[] = [];
    const core = new NetCore((m) => posts.push(m), () => 0);
    const start = { config: cfg(4242), slot: 3 };
    expect(viewTeamOf(start)).toBe(1);
    expect(viewTeamOf({ ...start, slot: 1 })).toBe(0);
    core.start(start);
    const all = new Uint8Array(log.bodies.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of log.bodies) {
      all.set(b, at);
      at += b.length;
    }
    expect(splitTurnBodies(all)).toHaveLength(log.bodies.length);
    core.turns(all, false, true);
    for (let i = 0; i < 200_000 && !core.ended; i++) core.pace(i * 70);
    expect(core.ended?.winner).toBe(log.winner);
    expect(core.worldHash).toBe(log.finalHash);
    const end = posts.find((p): p is Extract<CoreOut, { t: 'end' }> => p.t === 'end')!;
    expect(end.record).toMatchObject({ v: 3, mode: 'pvp' });
    const snap = posts.filter((p): p is Extract<CoreOut, { t: 'snap' }> => p.t === 'snap').pop()!;
    expect(decodeSnap(snap.buf).team).toBe(1);
  }, 120_000);
});
