import { describe, expect, it } from 'vitest';
import { Op, type Command, type TimedCommand } from '../../src/sim/api';
import {
  COORD_QUANTUM,
  DecodeError,
  OP_SIZE,
  decodeCommand,
  decodeStream,
  encodeCommand,
  encodeStream,
  fromBase64,
  quantize,
  toBase64,
} from '../../src/sim/commands';
import { Rng } from '../../src/sim/rng';
import { MAX_INPUT_BYTES, MAX_INPUT_CHARS, MOVE_MIN_GAP } from '../../src/data/limits';
import { createGate, gateCommand } from '../../src/sim/input';
import { createMatch, fillPicks, replayRecord, result, step } from '../../src/sim/index';
import { verifyReplay } from '../../src/sim/server';
import { icos, isin } from '../../src/sim/fixed';
import { randomCommand } from './helpers';

const samples: Command[] = [
  { op: Op.Move, x: 12345, y: 54321 },
  { op: Op.AttackMove, x: 100000, y: 0 },
  { op: Op.Attack, id: 47 },
  { op: Op.Cast, slot: 3, x: 50000, y: 30000, id: 255 },
  { op: Op.Trick, x: 1, y: 59999 },
  { op: Op.Stop },
  { op: Op.Nap },
  { op: Op.Talent, tier: 2, choice: 1 },
];

describe('commands (§11.3)', () => {
  it('every opcode has the spec size and round-trips (quantised)', () => {
    const sizes: Record<number, number> = { 1: 5, 2: 5, 3: 2, 4: 7, 5: 5, 6: 1, 7: 1, 8: 2 };
    for (const c of samples) {
      const bytes = encodeCommand(c);
      expect(bytes.length).toBe(sizes[c.op]);
      expect(OP_SIZE[c.op]).toBe(sizes[c.op]);
      expect(decodeCommand(bytes)).toEqual(quantize(c));
    }
  });
  it('quantises coordinates to 250 mm and clamps to the map', () => {
    expect(quantize({ op: Op.Move, x: 124, y: 126 })).toEqual({ op: Op.Move, x: 0, y: COORD_QUANTUM });
    expect(quantize({ op: Op.Move, x: -500, y: 999999 })).toEqual({ op: Op.Move, x: 0, y: 60000 });
  });
  it('streams round-trip with varint tick deltas', () => {
    const r = new Rng(5);
    const list: TimedCommand[] = [];
    let tick = 0;
    for (let i = 0; i < 2000; i++) {
      tick += r.int(4) === 0 ? r.int(400) : r.int(3);
      const c = randomCommand(r, 10000)!;
      list.push({ tick, cmd: c });
    }
    const bytes = encodeStream(list);
    expect(decodeStream(bytes)).toEqual(list.map((t) => ({ tick: t.tick, cmd: quantize(t.cmd) })));
    expect(() => decodeStream(bytes, tick - 1)).toThrow(DecodeError);
  });
  it('rejects malformed bytes', () => {
    expect(() => decodeStream(new Uint8Array([0, 99]))).toThrow(DecodeError);
    expect(() => decodeStream(new Uint8Array([0, Op.Move, 1, 0]))).toThrow(DecodeError);
    expect(() => decodeStream(new Uint8Array([0, Op.Move, 0xff, 0xff, 0, 0]))).toThrow(DecodeError);
    expect(() => decodeStream(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x01, 6]))).toThrow(DecodeError);
    expect(() => decodeCommand(new Uint8Array([Op.Stop, 0]))).toThrow(DecodeError);
    expect(() => decodeCommand(new Uint8Array([Op.Talent, 0x30]))).toThrow(DecodeError);
  });
  it('base64 is canonical and matches Buffer', () => {
    const r = new Rng(11);
    for (let n = 0; n < 50; n++) {
      const bytes = new Uint8Array(n).map(() => r.int(256));
      const s = toBase64(bytes);
      expect(s).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(fromBase64(s))).toEqual(Array.from(bytes));
    }
    expect(() => fromBase64('abc')).toThrow(DecodeError);
    expect(() => fromBase64('ab!=')).toThrow(DecodeError);
    expect(() => fromBase64('QR==')).toThrow(DecodeError); // non-canonical trailing bits
  });
});

describe('input gate (§11.3)', { timeout: 120000 }, () => {
  const mv = (x: number): Command => ({ op: Op.Move, x, y: 1000 });
  it('applies one move per MOVE_MIN_GAP ticks; the latest waiting move wins', () => {
    const g = createGate();
    expect(gateCommand(g, 0, [mv(1000)])).toEqual(mv(1000));
    expect(gateCommand(g, 1, [mv(2000)])).toBeNull();
    expect(gateCommand(g, 2, [mv(3000), mv(4000)])).toBeNull();
    expect(gateCommand(g, 3, [])).toBeNull();
    expect(gateCommand(g, MOVE_MIN_GAP, [])).toEqual(mv(4000));
    expect(gateCommand(g, MOVE_MIN_GAP + 1, [])).toBeNull();
  });
  it('any other command applies at once and drops the waiting move', () => {
    const g = createGate();
    gateCommand(g, 0, [mv(1000)]);
    expect(gateCommand(g, 1, [mv(2000)])).toBeNull();
    expect(gateCommand(g, 2, [{ op: Op.Stop }])).toEqual({ op: Op.Stop });
    expect(gateCommand(g, 9, [])).toBeNull();
  });
  it('stops applying once the stream would pass MAX_INPUT_BYTES', () => {
    const g = createGate();
    let applied = 0;
    for (let t = 0; t < 100000; t++) if (gateCommand(g, t, [{ op: Op.Cast, slot: 0, x: t % 1000, y: 0, id: 255 }])) applied++;
    expect(g.bytes).toBeLessThanOrEqual(MAX_INPUT_BYTES);
    expect(applied).toBe(Math.floor(MAX_INPUT_BYTES / 8));
  });
  it('a worst-case 11:00 touch match encodes to ≤ 40,000 characters and verifies', () => {
    // Joystick: a move 2 m ahead every 3 ticks with the direction turning, plus attack, cast and stop spam.
    // A seed whose match runs past 10:00 with this input (bots group at 5:00 since the §15 item 11 tuning, so most
    // matches end sooner; this one lasts 18,204 ticks and hits the 40,000-character input gate).
    const seed = 139;
    const { picks, tricks } = fillPicks(seed, 'sage', 'pounce');
    const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
    let a = 0;
    for (let t = 0; !result(m); t++) {
      const hx = m.world.x[0];
      const hy = m.world.y[0];
      const cmds: Command[] = [];
      if (t % 3 === 0) {
        a = (a + 160) & 4095;
        cmds.push({ op: Op.Move, x: hx + Math.trunc((icos(a) * 2000) / 65536), y: hy + Math.trunc((isin(a) * 2000) / 65536) });
      }
      if (t % 45 === 7) cmds.push({ op: Op.Cast, slot: (t % 4) as 0 | 1 | 2 | 3, x: hx + 3000, y: hy, id: 255 });
      if (t % 20 === 11) cmds.push({ op: Op.Attack, id: 6 + (t % 40) });
      step(m, cmds);
    }
    const rec = replayRecord(m)!;
    expect(rec.ticks).toBeGreaterThan(18000);
    expect(rec.inputs.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(verifyReplay(rec)).toMatchObject({ ok: true, outcome: rec.outcome, finalHash: rec.finalHash });
  });
});
