/** Party play N1 (MULTIPLAYER.md §2): the wire codec. Round-trips, golden bytes for every frame type, a 100k fuzz. */
import { describe, expect, it } from 'vitest';
import { OP_SIZE, encodeCommand } from '../../src/sim/commands';
import { Op } from '../../src/sim/api';
import {
  CMD_SIZE,
  Frame,
  MAX_FRAME,
  PROTO,
  ProtoError,
  decodeClientBinary,
  decodeServerBinary,
  decodeTurnBody,
  displayCode,
  encodeBeat,
  encodeCatchup,
  encodeCmdFrame,
  encodeEcho,
  encodeHash,
  encodeTurn,
  encodeTurnBody,
  normalizeCode,
  parseClientJson,
  parseServerJson,
  splitTurnBodies,
  type TurnFrame,
} from '../../src/net/proto';
import { Rng } from '../../src/sim/rng';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const move = encodeCommand({ op: Op.Move, x: 30000, y: 20000 });
const cast = encodeCommand({ op: Op.Cast, slot: 2, x: 50000, y: 10000, id: 4 });
const turn: TurnFrame = {
  turn: 300,
  modeMask: 0b100,
  acks: [12, undefined, 7],
  entries: [
    { slot: 0, sub: 0, pilot: false, cmd: move },
    { slot: 2, sub: 1, pilot: true, cmd: cast },
  ],
};

describe('net-proto', () => {
  it('PROTO is 6 (PROTO_MIN 1) and the command size table equals the sim\'s', () => {
    expect(PROTO).toBe(6);
    for (let op = 1; op < CMD_SIZE.length; op++) expect(CMD_SIZE[op]).toBe(OP_SIZE[op]);
    expect(Object.keys(OP_SIZE)).toHaveLength(CMD_SIZE.length - 1);
  });

  it('golden bytes for every frame type (any reorder fails here: bump PROTO)', () => {
    expect(hex(encodeCmdFrame({ seq: 200, cmd: move }))).toBe('01c8010178005000');
    expect(hex(encodeBeat({ lastTurn: 300, clientMs: 0x01020304 }))).toBe('02ac0204030201');
    expect(hex(encodeHash({ tick: 9000, hash: 0xdeadbeef }))).toBe('03a846efbeadde');
    expect(hex(encodeEcho({ clientMs: 1, serverMs: 2 }))).toBe('830100000002000000');
    expect(hex(encodeTurn(turn))).toBe('81ac0204050c07020001780050001a0402c800280004');
    expect(hex(encodeCatchup(10, 11, true, encodeTurnBody({ turn: 10, modeMask: 0, acks: [], entries: [] })))).toBe('820a0b010a000000');
  });

  it('PROTO 4 classic (MAP-5V5.md §2.7): ten slots; a 3v3 turn keeps its PROTO 3 bytes', () => {
    const classic: TurnFrame = {
      turn: 7,
      modeMask: 0b1100100000,
      acks: [1, undefined, undefined, undefined, undefined, 3, undefined, undefined, 8, 9],
      entries: [
        { slot: 5, sub: 0, pilot: false, cmd: move },
        { slot: 8, sub: 1, pilot: true, cmd: cast },
        { slot: 9, sub: 0, pilot: false, cmd: move },
      ],
    };
    const bytes = encodeTurnBody(classic);
    // varint masks: 0x320 = a0 06, acks 0x321 = a1 06; slot 8 = 0x20 | sub 0x08 | pilot 0x10 = 0x38; slot 9 = 0x21
    expect(hex(bytes)).toBe('07a006a1060103080903050178005000380402c800280004210178005000');
    const back = decodeTurnBody(bytes);
    expect(back.modeMask).toBe(0b1100100000);
    expect(back.acks[5]).toBe(3);
    expect(back.acks[8]).toBe(8);
    expect(back.acks[9]).toBe(9);
    expect(back.entries.map((e) => [e.slot, e.sub, e.pilot])).toEqual([
      [5, 0, false],
      [8, 1, true],
      [9, 0, false],
    ]);
    expect(parseClientJson('{"t":"mm.join","queue":"classic","side":"any"}')).toEqual({ t: 'mm.join', queue: 'classic', side: 'any' });
  });

  it('PROTO 3 PvP (V16.md §4.3): six slots on the wire; a co-op turn keeps its PROTO 2 bytes', () => {
    // the PROTO 2 golden above is unchanged; a PvP turn sets mode and ack bits up to slot 5
    const pvp: TurnFrame = {
      turn: 7,
      modeMask: 0b100100,
      acks: [1, undefined, undefined, 3, undefined, 9],
      entries: [
        { slot: 3, sub: 0, pilot: false, cmd: move },
        { slot: 5, sub: 1, pilot: true, cmd: cast },
      ],
    };
    expect(hex(encodeTurnBody(pvp))).toBe('072429010309020301780050001d0402c800280004');
    const back = decodeTurnBody(encodeTurnBody(pvp));
    expect(back.modeMask).toBe(0b100100);
    expect(back.acks[3]).toBe(3);
    expect(back.acks[5]).toBe(9);
    expect(back.entries.map((e) => e.slot)).toEqual([3, 5]);
    // PROTO 4: bits past slot 9 are refused (a varint mask of 1024), and entry flags 0x40 / 0x80
    expect(() => decodeTurnBody(new Uint8Array([1, 0x80, 0x08, 0, 0]))).toThrow(ProtoError);
    expect(() => decodeTurnBody(new Uint8Array([1, 0, 0x80, 0x08, 0]))).toThrow(ProtoError);
    expect(() => decodeTurnBody(new Uint8Array([1, 0, 0, 1, 0x46, 6]))).toThrow(ProtoError);
    // slots 10..15 (bit 3 set with low bits 2..7) are refused
    expect(() => decodeTurnBody(new Uint8Array([1, 0, 0, 1, 0x22, 6]))).toThrow(ProtoError);
    expect(MAX_FRAME[Frame.TURN]).toBe(512);
    // the casual frames
    expect(parseClientJson('{"t":"mm.join","queue":"casual","side":"any"}')).toEqual({ t: 'mm.join', queue: 'casual', side: 'any' });
    expect(parseClientJson('{"t":"mm.accept","match":"abcdefghijkl","yes":true}')).toEqual({ t: 'mm.accept', match: 'abcdefghijkl', yes: true });
    expect(() => parseClientJson('{"t":"mm.accept","match":"ABC","yes":true}')).toThrow(ProtoError);
    expect(parseClientJson('{"t":"vote","kind":"remake","yes":true}')).toEqual({ t: 'vote', kind: 'remake', yes: true });
    // ranked (gap plan P4): the same frame, no PROTO bump
    expect(parseClientJson('{"t":"mm.join","queue":"ranked","side":"any"}')).toEqual({ t: 'mm.join', queue: 'ranked', side: 'any' });
    expect(() => parseClientJson('{"t":"mm.join","queue":"ladder","side":"any"}')).toThrow(ProtoError);
    const hello = { t: 'hello', proto: 3, sim: 16, simHash: '0123456789abcdef', build: 'web.1', hint: { maxDifficulty: 'hard', newbie: false, matches: 12 } };
    expect(parseClientJson(JSON.stringify(hello))).toEqual(hello);
    expect(() => parseClientJson(JSON.stringify({ ...hello, hint: { ...hello.hint, matches: -1 } }))).toThrow(ProtoError);
    expect(parseServerJson('{"t":"void","reason":"remake"}')).toEqual({ t: 'void', reason: 'remake' });
    expect(parseServerJson('{"t":"mm.accepted","match":"abcdefghijkl","yes":2,"need":4}').t).toBe('mm.accepted');
  });

  it('round-trips', () => {
    const c = decodeClientBinary(encodeCmdFrame({ seq: 5, cmd: cast }));
    expect(c).toEqual({ type: Frame.CMD, f: { seq: 5, cmd: cast } });
    expect(decodeClientBinary(encodeBeat({ lastTurn: 9, clientMs: 4294967295 }))).toEqual({ type: Frame.BEAT, f: { lastTurn: 9, clientMs: 4294967295 } });
    expect(decodeClientBinary(encodeHash({ tick: 19800, hash: 1 }))).toEqual({ type: Frame.HASH, f: { tick: 19800, hash: 1 } });
    const t = decodeServerBinary(encodeTurn(turn));
    expect(t).toEqual({ type: Frame.TURN, f: turn });
    expect(decodeTurnBody(encodeTurnBody(turn))).toEqual(turn);
    const bodies = new Uint8Array([...encodeTurnBody(turn), ...encodeTurnBody({ ...turn, turn: 301 })]);
    expect(splitTurnBodies(bodies).map((x) => x.turn)).toEqual([300, 301]);
    const cu = decodeServerBinary(encodeCatchup(300, 301, false, bodies));
    expect(cu.type).toBe(Frame.CATCHUP);
    if (cu.type === Frame.CATCHUP) expect(cu.f.turns.map((x) => x.turn)).toEqual([300, 301]);
    expect(decodeServerBinary(encodeEcho({ clientMs: 7, serverMs: 8 }))).toEqual({ type: Frame.ECHO, f: { clientMs: 7, serverMs: 8 } });
  });

  it('sizes are enforced per type before decoding; client and server frames do not mix', () => {
    const big = new Uint8Array(11);
    big[0] = Frame.CMD;
    expect(() => decodeClientBinary(big)).toThrow(ProtoError);
    expect(() => decodeClientBinary(encodeTurn(turn))).toThrow(ProtoError);
    expect(() => decodeServerBinary(encodeBeat({ lastTurn: 1, clientMs: 1 }))).toThrow(ProtoError);
    expect(() => decodeClientBinary(new Uint8Array([0x7f]))).toThrow(ProtoError);
    expect(() => decodeClientBinary(new Uint8Array([]))).toThrow(ProtoError);
    expect(() => decodeClientBinary(new Uint8Array([Frame.CMD, 1, 99]))).toThrow(ProtoError);
  });

  it('JSON: strict guards, unknown keys refused, length checked first', () => {
    expect(parseClientJson('{"t":"party.join","code":"k7q x2m"}')).toEqual({ t: 'party.join', code: 'K7QX2M' });
    expect(() => parseClientJson('{"t":"party.join","code":"K7QX2M","x":1}')).toThrow(ProtoError);
    expect(() => parseClientJson('{"t":"party.join","code":"K7QX0M"}')).toThrow(ProtoError);
    expect(() => parseClientJson('{"t":"party.join"}')).toThrow(ProtoError);
    expect(() => parseClientJson('{"t":"nope"}')).toThrow(ProtoError);
    expect(() => parseClientJson('[1]')).toThrow(ProtoError);
    expect(() => parseClientJson('{"t":"social","kind":"chat","id":3,"x":1.5}')).toThrow(ProtoError);
    expect(() => parseClientJson(`{"t":"party.create","difficulty":"${'a'.repeat(1100)}"}`)).toThrow('json too large');
    expect(() => parseClientJson('{"t":"__proto__"}')).toThrow(ProtoError);
    // inherited names are unknown keys (a clean ProtoError, never a TypeError)
    for (const k of ['constructor', 'toString', 'hasOwnProperty', '__proto__'])
      expect(() => parseClientJson(`{"t":"hello","${k}":1}`)).toThrow(ProtoError);
    expect(parseClientJson('{"t":"pick.unlock"}')).toEqual({ t: 'pick.unlock' });
    const hello = parseClientJson(JSON.stringify({ t: 'hello', proto: 1, sim: 11, simHash: '0123456789abcdef', build: 'web.1', resume: { token: 'abcdefgh12' } }));
    expect(hello.t).toBe('hello');
    expect(() => parseClientJson(JSON.stringify({ t: 'hello', proto: 1, sim: 11, simHash: '0123456789abcdef', build: 'web.1', resume: { token: 'abcdefgh12', x: 1 } }))).toThrow(ProtoError);
    expect(parseServerJson('{"t":"slot","slot":1,"reason":"drop"}')).toEqual({ t: 'slot', slot: 1, reason: 'drop' });
    expect(() => parseServerJson('{"t":"evil"}')).toThrow(ProtoError);
  });

  it('codes: alphabet, case fold, display', () => {
    expect(normalizeCode('k7q-x2m')).toBe('K7QX2M');
    expect(normalizeCode('K7QX2O')).toBeNull();
    expect(normalizeCode('ABC')).toBeNull();
    expect(displayCode('K7QX2M')).toBe('K7Q X2M');
  });

  // 100k cases: well under a second locally, several on a busy 2-core runner (the 5 s default timed out there)
  it('fuzz: 100k random byte strings only ever throw ProtoError and stay bounded', () => {
    const r = new Rng(0xc0de);
    const types = [Frame.CMD, Frame.BEAT, Frame.HASH, Frame.TURN, Frame.CATCHUP, Frame.ECHO, 0, 0x55];
    let ok = 0;
    for (let i = 0; i < 100_000; i++) {
      const len = r.int(i % 10 === 0 ? 300 : 24);
      const b = new Uint8Array(len);
      for (let k = 0; k < len; k++) b[k] = r.int(256);
      if (len > 0 && r.int(2) === 0) b[0] = types[r.int(types.length)];
      for (const dec of [decodeClientBinary, decodeServerBinary]) {
        try {
          const out = dec(b) as { f: unknown };
          ok++;
          // a decoded frame never carries more than its input
          expect(JSON.stringify(out.f, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v)).length).toBeLessThan(64 * 1024);
          expect(b.length).toBeLessThanOrEqual(MAX_FRAME[b[0]]);
        } catch (e) {
          if (!(e instanceof ProtoError)) throw e;
        }
      }
      try {
        parseClientJson(String.fromCharCode(...b));
      } catch (e) {
        if (!(e instanceof ProtoError)) throw e;
      }
    }
    expect(ok).toBeGreaterThan(0);
  }, 60_000);

  it('PROTO 5 chat (CHAT-AVATARS.md §5): chat.say is typed, bounded and refuses images or unknown keys', () => {
    expect(parseClientJson('{"t":"chat.say","k":"q","id":12}')).toEqual({ t: 'chat.say', k: 'q', id: 12 });
    expect(parseClientJson('{"t":"chat.say","k":"t","text":"gg wp"}')).toEqual({ t: 'chat.say', k: 't', text: 'gg wp' });
    expect(() => parseClientJson('{"t":"chat.say","k":"img","url":"x"}')).toThrow(ProtoError);
    expect(() => parseClientJson('{"t":"chat.say","k":"t","text":""}')).toThrow(ProtoError);
    expect(() => parseClientJson(JSON.stringify({ t: 'chat.say', k: 't', text: 'x'.repeat(241) }))).toThrow(ProtoError);
    expect(() => parseClientJson('{"t":"chat.say","k":"q","id":64}')).toThrow(ProtoError);
    expect(() => parseClientJson('{"t":"chat.say","k":"q","id":1,"to":"m1"}')).toThrow(ProtoError);
  });
});
