/**
 * Party play N7 (MULTIPLAYER.md §4.5, §12 N7): delta catch-up after a drop, full catch-up after a reload, the same
 * CATCHUP twice gives the same hash; and the fast-forward speed (perf-ff: 19,800 ticks < 1.5 s on Node).
 */
import { describe, expect, it } from 'vitest';
import { NetCore, type CoreOut } from '../../src/net/net-core';
import { encodeTurnBody, type TurnEntry } from '../../src/net/proto';
import { encodeCommand } from '../../src/sim/commands';
import { createMatch, createPlayerBotFor, playerBotCommands, step, result } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';
import { decodeCommand } from '../../src/sim/commands';
import type { Command } from '../../src/sim/api';

function cfg(seed: number) {
  const seats = [
    { slot: 0, hero: 'gabe' as const, trick: 'hiss' as const },
    { slot: 1, hero: 'clem' as const, trick: 'pounce' as const },
  ];
  const { picks, tricks } = fillPicksParty(seed, seats);
  return { seed, picks: picks as string[], tricks: tricks as string[], difficulty: 'normal', humans: [0, 1] };
}

/** A whole room log: two pilot-flown humans (any command source). */
function roomLog(seed: number): Uint8Array[] {
  const c = cfg(seed);
  const m = createMatch({ ...c, picks: c.picks as never, tricks: c.tricks as never, difficulty: 'normal' });
  const bots = [createPlayerBotFor(m, 'normal', 0), createPlayerBotFor(m, 'easy', 1)];
  const out: Uint8Array[] = [];
  for (let turn = 0; !result(m); turn++) {
    const entries: TurnEntry[] = [];
    for (let sub = 0 as 0 | 1; sub < 2; sub = (sub + 1) as 0 | 1) {
      const per: Command[][] = [[], [], []];
      for (let s = 0; s < 2; s++) {
        const cmds = playerBotCommands(m, bots[s]).slice(-1);
        for (const cmd of cmds) {
          entries.push({ slot: s, sub, pilot: false, cmd: encodeCommand(cmd) });
          per[s].push(decodeCommand(encodeCommand(cmd)));
        }
      }
      step(m, per[0], per);
    }
    out.push(encodeTurnBody({ turn, modeMask: 0, acks: [], entries }));
  }
  return out;
}

const concat = (parts: Uint8Array[]) => {
  const a = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    a.set(p, at);
    at += p.length;
  }
  return a;
};

function drain(core: NetCore, now = 0) {
  for (let i = 0; i < 100_000 && core.applied < core['queued' as never]; i++) core.pace(now + i * 70);
}

describe('net rejoin (N7)', { timeout: 300_000 }, () => {
  const log = roomLog(2026);
  const c = cfg(2026);

  it('live, delta catch-up after a drop, full catch-up after a reload and a duplicate CATCHUP all end on the same hash', () => {
    const live = new NetCore(() => undefined);
    live.start({ config: c, slot: 0 });
    for (const b of log) {
      live.turns(b, true);
      live.pace(0);
    }
    drain(live);
    expect(live.ended).not.toBeNull();

    const drop = new NetCore(() => undefined);
    drop.start({ config: c, slot: 1 });
    const cut = 3000;
    for (const b of log.slice(0, cut)) {
      drop.turns(b, true);
      drop.pace(0);
    }
    drain(drop);
    drop.turns(concat(log.slice(cut)));
    drop.turns(concat(log.slice(cut))); // the same CATCHUP twice
    drain(drop);
    expect(drop.worldHash).toBe(live.worldHash);

    const reload = new NetCore(() => undefined);
    reload.start({ config: c, slot: 1 });
    reload.turns(concat(log));
    drain(reload);
    expect(reload.worldHash).toBe(live.worldHash);
    expect(reload.ended!.finalHash).toBe(live.ended!.finalHash);
  });

  it('a resync rebuild from turn 0 converges to the same hash', () => {
    const core = new NetCore(() => undefined);
    core.start({ config: c, slot: 0 });
    core.turns(concat(log.slice(0, 2000)));
    drain(core);
    core.rebuild();
    core.turns(concat(log));
    drain(core);
    const ref = new NetCore(() => undefined);
    ref.start({ config: c, slot: 0 });
    ref.turns(concat(log));
    drain(ref);
    expect(core.worldHash).toBe(ref.worldHash);
  });

  // a wall-clock budget: skipped where the cores are shared and slow (the OTA publish gate on GitHub runners)
  it.skipIf(process.env.PAWLEGENDS_SKIP_TIMING === '1')('perf-ff: fast-forward runs at least 19,800 ticks in 1.5 s on Node, without snapshots or HASH posts', async () => {
    // timed on the bundled core (as the worker ships it): vitest's transform runs the sim ~2.5x slower (perf-sim.test.ts)
    const { importSim } = await import('../../tools/lib/sim-bundle.mjs');
    const mod = (await importSim('src/net/net-core.ts')) as { NetCore: typeof NetCore };
    const out: CoreOut[] = [];
    const core = new mod.NetCore((m) => out.push(m));
    core.start({ config: c, slot: 0 });
    out.length = 0;
    const t0 = performance.now();
    core.turns(concat(log));
    drain(core);
    const ms = performance.now() - t0;
    const ticks = core.tick;
    const perTick = ms / ticks;
    console.log(`perf-ff: ${ticks} ticks in ${ms.toFixed(0)} ms (${(perTick * 19_800).toFixed(0)} ms per 19,800 ticks)`);
    expect(perTick * 19_800).toBeLessThan(1500);
    expect(out.filter((m) => m.t === 'hash')).toHaveLength(0);
    expect(out.filter((m) => m.t === 'snap').length).toBeLessThanOrEqual(2);
    expect(out.some((m) => m.t === 'progress' && m.done)).toBe(true);
  });
});
