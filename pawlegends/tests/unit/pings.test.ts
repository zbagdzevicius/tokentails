/**
 * Sim v10, GAPS B1: command pings (Op.Ping), the ping gate (one per 45 ticks, 60 a match, its own budget), the bot
 * orders with their TTLs and refusals, enemy bots never seeing a ping, the lane swap and the +600 B input budget in
 * all three copies.
 */
import { describe, expect, it } from 'vitest';
import { MAX_INPUT_BYTES, MAX_INPUT_CHARS, MOVE_MIN_GAP } from '../../src/data/limits';
import { LANE_SWAP, PING, PING_KIND, PING_KINDS } from '../../src/data/pings';
import { NO_TARGET, Op, type Command, type SimEvent } from '../../src/sim/api';
import { DecodeError, decodeCommand, decodeStream, encodeCommand, encodeStream, fromBase64 } from '../../src/sim/commands';
import { createGate, gateCommand } from '../../src/sim/input';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, replayRecord, result, snapshot, step, type MatchHandle } from '../../src/sim/index';
import { laneRole, orderOf } from '../../src/sim/bots';
import { runReplay } from '../../src/sim/replay';
import { verifyReplay } from '../../src/sim/server';
import { G } from '../../src/sim/world';
import * as sharedCaps from '../../../shared/caps';
import * as backendCaps from '../../../backend/src/shared-contracts/caps';
import { putHero, quietMatch } from './sim-helpers';

const ping = (kind: number, x = 50000, y = 30000, id = NO_TARGET): Command => ({ op: Op.Ping, kind, x, y, id });
const mv = (x: number): Command => ({ op: Op.Move, x, y: 30000 });

/** Step `m` once with `cmds`; returns the events of that tick (all teams). */
function stepEvents(m: MatchHandle, cmds: Command[] = []): SimEvent[] {
  step(m, cmds);
  return m.events.slice();
}

describe('Op.Ping encoding (GAPS B1)', () => {
  it('is opcode 9, 7 bytes: kind, x, y (250 mm), id', () => {
    expect(Op.Ping).toBe(9);
    const bytes = encodeCommand(ping(PING_KIND.Focus, 40100, 20000, 4));
    expect(bytes.length).toBe(7);
    expect(decodeCommand(bytes)).toEqual({ op: Op.Ping, kind: PING_KIND.Focus, x: 40000, y: 20000, id: 4 });
    for (let k = 0; k < PING_KINDS.length; k++) expect(decodeCommand(encodeCommand(ping(k))).op).toBe(Op.Ping);
  });

  it('refuses an unknown kind', () => {
    const bytes = encodeCommand(ping(0));
    bytes[1] = PING_KINDS.length;
    expect(() => decodeCommand(bytes)).toThrow(DecodeError);
  });

  it('eight kinds in the GAPS order', () => {
    expect(PING_KINDS).toEqual(['goHere', 'group', 'pudding', 'pushSunny', 'pushPuddle', 'defend', 'fallBack', 'focus']);
  });
});

describe('ping gate (GAPS B1)', () => {
  it('one ping every PING.minGap ticks; a ping inside the gap is dropped', () => {
    const g = createGate();
    gateCommand(g, 0, [ping(0)]);
    expect(g.ping).not.toBeNull();
    gateCommand(g, PING.minGap - 1, [ping(1)]);
    expect(g.ping).toBeNull();
    gateCommand(g, PING.minGap, [ping(1)]);
    expect(g.ping).toMatchObject({ op: Op.Ping, kind: 1 });
  });

  it('at most PING.maxPerMatch pings a match', () => {
    const g = createGate();
    let applied = 0;
    for (let t = 0; t < PING.minGap * (PING.maxPerMatch + 20); t += PING.minGap) {
      gateCommand(g, t, [ping(t % 8)]);
      if (g.ping) applied++;
    }
    expect(applied).toBe(PING.maxPerMatch);
  });

  it('a ping and another command share a tick, and a ping never drops a waiting move', () => {
    const g = createGate();
    expect(gateCommand(g, 0, [mv(1000)])).toEqual(mv(1000));
    // A move inside the move gap waits; the ping of the next tick applies and the move still waits.
    expect(gateCommand(g, 1, [mv(2000)])).toBeNull();
    expect(gateCommand(g, 2, [ping(0)])).toBeNull();
    expect(g.ping).not.toBeNull();
    expect(gateCommand(g, MOVE_MIN_GAP, [])).toEqual(mv(2000));
    // Both in one tick: the latest of each kind.
    const g2 = createGate();
    expect(gateCommand(g2, 0, [mv(1000), ping(2), mv(3000)])).toEqual(mv(3000));
    expect(g2.ping).toMatchObject({ kind: 2 });
  });

  it('logs the ping before the tick’s other command, and the replay verifies', () => {
    const { picks, tricks } = fillPicks(11, 'clem', 'pounce');
    const m = createMatch({ seed: 11, picks, tricks, difficulty: 'normal' });
    const bot = createPlayerBot(m, 'normal');
    let t = 0;
    while (!result(m)) {
      const cmds = playerBotCommands(m, bot);
      if (t % 200 === 100) cmds.unshift(ping(t % 8, 30000 + t, 30000, 4));
      step(m, cmds);
      t++;
    }
    const rec = replayRecord(m)!;
    const log = decodeStream(fromBase64(rec.inputs));
    const pings = log.filter((c) => c.cmd.op === Op.Ping);
    expect(pings.length).toBeGreaterThan(10);
    expect(pings.length).toBeLessThanOrEqual(PING.maxPerMatch);
    for (let i = 0; i + 1 < log.length; i++) if (log[i].tick === log[i + 1].tick) expect(log[i].cmd.op).toBe(Op.Ping);
    expect(verifyReplay(rec)).toMatchObject({ ok: true, finalHash: rec.finalHash });
    expect(runReplay(rec).trail).toEqual(m.trail);
  }, 30_000);
});

describe('input budget (GAPS B1, Your call 17)', () => {
  it('MAX_INPUT_BYTES and MAX_INPUT_CHARS are +600 B (30,600 and 40,800) and equal in all three copies', () => {
    expect(MAX_INPUT_BYTES).toBe(30600);
    expect(MAX_INPUT_CHARS).toBe(40800);
    expect(MAX_INPUT_CHARS).toBe((MAX_INPUT_BYTES / 3) * 4);
    for (const caps of [sharedCaps, backendCaps]) {
      expect(caps.PAWLEGENDS_MAX_INPUT_CHARS).toBe(MAX_INPUT_CHARS);
      expect(caps.PAWLEGENDS_MAX_INPUT_BYTES).toBe(MAX_INPUT_BYTES);
    }
  });

  it('60 pings fit in the 600 B: a joystick stream at the move gap plus 60 pings stays under the budget', () => {
    const list: { tick: number; cmd: Command }[] = [];
    let pings = 0;
    for (let t = 0; t < 19800; t += MOVE_MIN_GAP) {
      if (pings < PING.maxPerMatch && t % 300 === 0) {
        list.push({ tick: t, cmd: ping(pings % 8) });
        pings++;
      }
      list.push({ tick: t, cmd: mv(10000 + (t % 80000)) });
    }
    const pingBytes = encodeStream(list).length - encodeStream(list.filter((c) => c.cmd.op !== Op.Ping)).length;
    expect(pingBytes).toBeLessThanOrEqual(600);
  });
});

describe('ping orders (GAPS B1)', () => {
  it('allied bots take the order with its TTL and bark ok; the ping event carries `took`', () => {
    const m = quietMatch(3);
    const w = m.world;
    const ev = stepEvents(m, [ping(PING_KIND.GoHere, 40000, 40000)]);
    const p = ev.find((e) => e.type === 'ping');
    expect(p).toMatchObject({ kind: 'goHere', x: 40000, y: 40000, target: -1, took: 2 });
    expect(ev.filter((e) => e.type === 'bark').map((e) => (e as { id: number; what: string }).what)).toEqual(['ok', 'ok']);
    for (const id of [1, 2]) {
      expect(orderOf(w, id)).toBe(PING_KIND.GoHere);
      expect(w.botOrdT[id]).toBe(PING.orderTicks);
    }
    for (const id of [3, 4, 5]) expect(w.botOrd[id]).toBe(0);
    // The order runs out after its TTL.
    w.globals[G.Tick] = PING.orderTicks + 1;
    expect(orderOf(w, 1)).toBe(-1);
  });

  it('Focus lasts 150 ticks, Fall back 240; Focus needs a visible enemy hero', () => {
    const m = quietMatch(3);
    const w = m.world;
    putHero(m, 4, w.x[0] + 3000, w.y[0]);
    stepEvents(m, [ping(PING_KIND.Focus, 0, 0, 4)]);
    expect(orderOf(w, 1)).toBe(PING_KIND.Focus);
    expect(w.botOrdId[1]).toBe(4);
    expect(w.botOrdT[1]).toBe(PING.focusTicks);
    for (let i = 0; i < PING.minGap; i++) step(m, []);
    const t = w.globals[G.Tick];
    stepEvents(m, [ping(PING_KIND.FallBack)]);
    expect(orderOf(w, 2)).toBe(PING_KIND.FallBack);
    expect(w.botOrdT[2]).toBe(t + PING.fallBackTicks);
    for (let i = 0; i < PING.minGap; i++) step(m, []);
    // No such enemy hero: nobody takes it.
    const ev = stepEvents(m, [ping(PING_KIND.Focus, 0, 0, NO_TARGET)]);
    expect(ev.find((e) => e.type === 'ping')).toMatchObject({ kind: 'focus', target: -1, took: 0 });
  });

  it('a bot under 35% HP or napping refuses and barks "heal"; Fall back is never refused', () => {
    const m = quietMatch(3);
    const w = m.world;
    w.hp[1] = Math.floor((w.maxHp[1] * (PING.refuseHpBp - 100)) / 10000);
    w.napT[2] = 30;
    const ev = stepEvents(m, [ping(PING_KIND.Group)]);
    expect(ev.find((e) => e.type === 'ping')).toMatchObject({ took: 0 });
    expect(ev.filter((e) => e.type === 'bark')).toEqual([
      expect.objectContaining({ id: 1, what: 'heal' }),
      expect.objectContaining({ id: 2, what: 'heal' }),
    ]);
    expect(orderOf(w, 1)).toBe(-1);
    for (let i = 0; i < PING.minGap; i++) step(m, []);
    const ev2 = stepEvents(m, [ping(PING_KIND.FallBack)]);
    expect(ev2.find((e) => e.type === 'ping')).toMatchObject({ took: 2 });
  });

  it('enemy bots never see a ping: no order on slots 3..5 and no ping or bark in the Woof snapshot', () => {
    const m = quietMatch(5, true, 'normal');
    for (let i = 0; i < 60; i++) step(m, []);
    step(m, [ping(PING_KIND.Group)]);
    expect(snapshot(m, 1).events.some((e) => e.type === 'ping' || e.type === 'bark')).toBe(false);
    expect(snapshot(m, 0).events.some((e) => e.type === 'ping')).toBe(true);
    for (const id of [3, 4, 5]) expect(m.world.botOrd[id]).toBe(0);
  });

  it('an allied bot walks to a Go here point', () => {
    const { picks, tricks } = fillPicks(9, 'clem', 'pounce');
    const m = createMatch({ seed: 9, picks, tricks, difficulty: 'normal' });
    const w = m.world;
    for (let i = 0; i < 300; i++) step(m, []);
    const gx = 30000;
    const gy = 30000;
    const d0 = Math.hypot(w.x[1] - gx, w.y[1] - gy);
    step(m, [ping(PING_KIND.GoHere, gx, gy)]);
    for (let i = 0; i < 240; i++) step(m, []);
    expect(Math.hypot(w.x[1] - gx, w.y[1] - gy)).toBeLessThan(Math.min(d0, PING.arriveRange + 2000));
  });

  it('Take Pudding ends once Pudding is no longer wild', () => {
    const m = quietMatch(3, true, 'normal');
    const w = m.world;
    step(m, [ping(PING_KIND.Pudding)]);
    expect(w.botOrd[1]).toBe(PING_KIND.Pudding + 1);
    // Pudding is not up before its first spawn: the bots drop the order at their next think.
    for (let i = 0; i < 12; i++) step(m, []);
    expect(w.botOrd[1]).toBe(0);
  });
  it('Fall back and Defend base end at the next think once there is nothing to run from or defend', () => {
    const m = quietMatch(3, true, 'normal');
    const w = m.world;
    // No enemy hero near the allies (quiet match, start of play): Fall back is over at once, as is Defend base.
    for (const kind of [PING_KIND.FallBack, PING_KIND.Defend]) {
      const ev = stepEvents(m, [ping(kind)]);
      expect(ev.find((e) => e.type === 'ping')).toMatchObject({ took: 2 });
      for (let i = 0; i < 12; i++) step(m, []);
      expect([w.botOrd[1], w.botOrd[2]]).toEqual([0, 0]);
      for (let i = 0; i < PING.minGap; i++) step(m, []);
    }
  });
});

describe('lane swap (GAPS B1)', () => {
  it('a human in Puddle Lane from 0:40 sends ally slot 1 to Sunny; back in Sunny swaps it back', () => {
    const m = quietMatch(3);
    const w = m.world;
    expect(laneRole(w, 1)).toBe(1);
    const stand = (x: number, y: number, ticks: number): void => {
      for (let i = 0; i < ticks; i++) {
        putHero(m, 0, x, y);
        step(m, []);
      }
    };
    stand(30000, 8500, LANE_SWAP.from - 10);
    expect(w.globals[G.LaneSwap]).toBe(0);
    stand(30000, 8500, 20);
    expect(w.globals[G.LaneSwap]).toBe(1);
    expect(laneRole(w, 1)).toBe(0);
    expect(laneRole(w, 0)).toBe(1);
    expect(laneRole(w, 2)).toBe(2);
    // Enemy roles never swap.
    expect(laneRole(w, 4)).toBe(1);
    stand(30000, 51500, LANE_SWAP.hold - 1);
    expect(w.globals[G.LaneSwap]).toBe(1);
    stand(30000, 51500, 1);
    expect(w.globals[G.LaneSwap]).toBe(0);
  });

  it('standing in a base (fountain, spawns, core) never flips the swap, on either side of the midline', () => {
    const m = quietMatch(3);
    const w = m.world;
    const stand = (x: number, y: number, ticks: number): void => {
      for (let i = 0; i < ticks; i++) {
        putHero(m, 0, x, y);
        step(m, []);
      }
    };
    stand(3000, 29000, LANE_SWAP.from + LANE_SWAP.hold * 2);
    expect(w.globals[G.LaneSwap]).toBe(0);
    // Swap on in Puddle, then nap home: the fountain, the slot 0 spawn and the core south of the midline keep it.
    stand(30000, 8500, LANE_SWAP.hold);
    expect(w.globals[G.LaneSwap]).toBe(1);
    for (const [x, y] of [
      [3000, 31000],
      [3000, 32000],
      [10000, 34000],
      [97000, 31000],
    ]) {
      stand(x, y, LANE_SWAP.hold * 2);
      expect(w.globals[G.LaneSwap]).toBe(1);
    }
  });
});

describe('pinger player-bot (GAPS B1 measure)', () => {
  it('pings through commands only: its match records pings and verifies', () => {
    let pinged = 0;
    for (const seed of [2, 3, 4]) {
      const { picks, tricks } = fillPicks(seed, 'sage', 'pounce');
      const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
      const bot = createPlayerBot(m, 'pinger');
      while (!result(m)) step(m, playerBotCommands(m, bot));
      const rec = replayRecord(m)!;
      pinged += decodeStream(fromBase64(rec.inputs)).filter((c) => c.cmd.op === Op.Ping).length;
      expect(verifyReplay(rec)).toMatchObject({ ok: true });
    }
    expect(pinged).toBeGreaterThan(0);
  }, 60_000);
});
