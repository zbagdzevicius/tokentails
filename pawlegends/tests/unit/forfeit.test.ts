/**
 * Sim v10, GAPS B2: Op.Forfeit (opcode 10, 1 B). It applies from DifficultyRules.forfeitFrom (Easy 3:00, Normal and
 * Hard 4:00, never Rookie), ends the match at that tick's win check with reason 'forfeit' and outcome 'lost', is
 * logged so the replay verifies, and always fits the input budget (FORFEIT_RESERVE_BYTES).
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES } from '../../src/data/bots';
import { FORFEIT_RESERVE_BYTES, MAX_INPUT_BYTES } from '../../src/data/limits';
import { Op, type Command } from '../../src/sim/api';
import { decodeCommand, decodeStream, encodeCommand, fromBase64 } from '../../src/sim/commands';
import { createGate, gateCommand, gateForfeit } from '../../src/sim/input';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, replayRecord, result, step, tickOf, type MatchHandle } from '../../src/sim/index';
import { verifyReplay } from '../../src/sim/server';
import { G } from '../../src/sim/world';
import { quietMatch } from './sim-helpers';

const FF: Command = { op: Op.Forfeit };
const mv = (x: number): Command => ({ op: Op.Move, x, y: 30000 });

/** Step a quiet (bots off) match to `tick`. */
function stepTo(m: MatchHandle, tick: number): void {
  while (tickOf(m) < tick && !result(m)) step(m);
}

describe('Op.Forfeit encoding (GAPS B2)', () => {
  it('is opcode 10, 1 byte', () => {
    expect(Op.Forfeit).toBe(10);
    const bytes = encodeCommand(FF);
    expect(bytes.length).toBe(1);
    expect(bytes[0]).toBe(10);
    expect(decodeCommand(bytes)).toEqual(FF);
  });
});

describe('forfeit rules (GAPS B2, Your call 5)', () => {
  it('Easy from 3:00, Normal and Hard from 4:00, never Rookie', () => {
    expect(DIFFICULTY_RULES.easy.forfeitFrom).toBe(5400);
    expect(DIFFICULTY_RULES.normal.forfeitFrom).toBe(7200);
    expect(DIFFICULTY_RULES.hard.forfeitFrom).toBe(7200);
    expect(DIFFICULTY_RULES.rookie.forfeitFrom).toBe(0);
  });
});

describe('forfeit gate (GAPS B2)', () => {
  it('drops a forfeit before forfeitFrom and never applies one with forfeitFrom 0', () => {
    const g = createGate();
    expect(gateForfeit(g, 5399, [FF], 5400)).toBe(false);
    expect(g.forfeit).toBe(false);
    expect(g.bytes).toBe(0);
    expect(gateForfeit(g, 19000, [FF], 0)).toBe(false);
    expect(gateForfeit(g, 5400, [FF], 5400)).toBe(true);
    expect(g.forfeit).toBe(true);
    // once only
    expect(gateForfeit(g, 5401, [FF], 5400)).toBe(false);
  });

  it('a forfeit is invisible to the other commands: it never drops a waiting move or becomes the order', () => {
    const g = createGate();
    expect(gateCommand(g, 0, [mv(1000)])).toEqual(mv(1000));
    expect(gateCommand(g, 1, [mv(2000)])).toBeNull();
    // a too-early forfeit as the tick's latest command leaves the waiting move waiting
    expect(gateCommand(g, 2, [FF])).toBeNull();
    expect(g.pending).toEqual(mv(2000));
    expect(gateCommand(g, 3, [mv(3000), FF])).toBeNull();
    expect(g.pending).toEqual(mv(3000));
  });

  it('the other commands leave FORFEIT_RESERVE_BYTES free, so a forfeit fits at a full budget', () => {
    const g = createGate();
    g.bytes = MAX_INPUT_BYTES - FORFEIT_RESERVE_BYTES - 1;
    g.lastLogTick = 19000;
    // a 1 B stop at delta 0 fits (1 + 1 = 2 B would pass the reserve line: refused)
    expect(gateCommand(g, 19000, [{ op: Op.Stop }])).toBeNull();
    expect(g.bytes).toBe(MAX_INPUT_BYTES - FORFEIT_RESERVE_BYTES - 1);
    // the forfeit at the longest tick delta (3-byte varint + opcode) still fits
    g.lastLogTick = 0;
    expect(gateForfeit(g, 19700, [FF], 5400)).toBe(true);
    expect(g.bytes).toBeLessThanOrEqual(MAX_INPUT_BYTES);
  });
});

describe('forfeit in a match (GAPS B2)', () => {
  it('Rookie never ends by forfeit', () => {
    const m = quietMatch(5, false, 'rookie');
    for (let t = 0; t < 60; t++) step(m, [FF]);
    expect(result(m)).toBeNull();
    expect(m.log.some((c) => c.cmd.op === Op.Forfeit)).toBe(false);
    // and the gate itself never lets one through at any tick (forfeitFrom 0)
    const g = createGate();
    expect(gateForfeit(g, 19000, [FF], DIFFICULTY_RULES.rookie.forfeitFrom)).toBe(false);
  });

  it('Easy: refused at 2:59, applied at 3:00; reason forfeit, outcome lost, the tick still runs', () => {
    const m = quietMatch(6, false, 'easy');
    stepTo(m, 5399);
    step(m, [FF]);
    expect(result(m)).toBeNull();
    expect(m.log.some((c) => c.cmd.op === Op.Forfeit)).toBe(false);
    step(m, [FF]);
    const r = result(m);
    expect(r).not.toBeNull();
    expect(r!.reason).toBe('forfeit');
    expect(r!.outcome).toBe('lost');
    expect(r!.winner).toBe(1);
    expect(r!.ticks).toBe(5401);
    expect(m.world.globals[G.EndReason]).toBe(3);
    expect(m.log[m.log.length - 1]).toEqual({ tick: 5400, cmd: FF });
  }, 60_000);

  it('a forfeit shares its tick with a move: both are logged, the forfeit last', () => {
    const m = quietMatch(7, false, 'easy');
    stepTo(m, 5400);
    step(m, [FF, mv(20000)]);
    expect(result(m)?.reason).toBe('forfeit');
    const last = m.log.slice(-2);
    expect(last.map((c) => c.cmd.op)).toEqual([Op.Move, Op.Forfeit]);
  }, 60_000);

  it('Normal: a forfeited match at 4:00 verifies (replay, outcome lost, reason forfeit) and its stream decodes', () => {
    const seed = 1010;
    const { picks, tricks } = fillPicks(seed, 'sage', 'pounce');
    const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
    const bot = createPlayerBot(m, 'normal');
    while (!result(m) && tickOf(m) < 7199) step(m, playerBotCommands(m, bot));
    expect(result(m)).toBeNull();
    // 3:59.97: refused
    step(m, [FF]);
    expect(result(m)).toBeNull();
    step(m, [FF]);
    const r = result(m)!;
    expect(r.reason).toBe('forfeit');
    const rec = replayRecord(m)!;
    expect(rec.outcome).toBe('lost');
    expect(rec.ticks).toBe(7201);
    const cmds = decodeStream(fromBase64(rec.inputs));
    expect(cmds.filter((c) => c.cmd.op === Op.Forfeit)).toEqual([{ tick: 7200, cmd: FF }]);
    const v = verifyReplay(rec);
    expect(v).toMatchObject({ ok: true, outcome: 'lost', reason: 'forfeit', ticks: 7201, finalHash: rec.finalHash });
    // a record that claims an earlier end does not verify (its forfeit lies past `ticks`)
    const early = { ...rec, ticks: 7100, inputs: rec.inputs };
    expect(verifyReplay(early).ok).toBe(false);
  }, 120_000);
});
