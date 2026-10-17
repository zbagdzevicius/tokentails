import { SIM_VERSION } from '../types';
import { describe, expect, it } from 'vitest';
import { BOSS_TICKS, DEFAULT_CAT, EYE_COLORS, PATTERNS, rgb565, type CatSpec, type RoomDef, type TickInput } from '../types';
import { BitReader, BitWriter } from './bits';
import { fromBase64url, toBase64url } from './base64url';
import { crc16, crc32 } from './crc16';
import { decodeCat, decodeCatOrDefault, encodeCat, CAT_CODE_LENGTH } from './cat-codec';
import { decodeGhost, decodeGhostSync, encodeGhost, encodeGhostSync, isDeflatedGhost } from './ghost-codec';
import { decodeRoom, encodeRoom } from './room-codec';
import { dailyRoomId, roomKey } from './ids';
import { codec } from './index';

describe('bits', () => {
  it('round trips mixed widths including 32-bit values', () => {
    const w = new BitWriter();
    const vals: [number, number][] = [[1, 1], [5, 3], [0xffffffff, 32], [0, 7], [0x1234, 16], [0x9abcdef0, 32], [3, 2]];
    for (const [v, b] of vals) w.write(v, b);
    expect(w.length).toBe(93);
    const r = new BitReader(w.bytes());
    for (const [v, b] of vals) expect(r.read(b)).toBe(v >>> 0);
    expect(() => r.read(8)).toThrow();
  });
});

describe('base64url', () => {
  it('round trips every length 0..40', () => {
    for (let n = 0; n <= 40; n++) {
      const b = new Uint8Array(n).map((_, i) => (i * 37 + n) & 0xff);
      const s = toBase64url(b);
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(Array.from(fromBase64url(s)!)).toEqual(Array.from(b));
    }
  });
  it('rejects bad characters, bad lengths and non-canonical pad bits', () => {
    expect(fromBase64url('ab+c')).toBeNull();
    expect(fromBase64url('abcde')).toBeNull();
    expect(fromBase64url('AA')).not.toBeNull();
    expect(fromBase64url('AB')).toBeNull(); // pad bits set
  });
});

describe('crc', () => {
  it('matches the CCITT-FALSE and IEEE check values', () => {
    const b = new TextEncoder().encode('123456789');
    expect(crc16(b)).toBe(0x29b1);
    expect(crc32(b)).toBe(0xcbf43926);
  });
});

function sampleCats(): CatSpec[] {
  const out: CatSpec[] = [];
  let k = 0;
  for (const pattern of PATTERNS)
    for (const ears of ['normal', 'fold'] as const)
      for (const tail of ['normal', 'fluffy', 'bob'] as const)
        for (const body of ['slim', 'normal', 'chonk'] as const) {
          k++;
          out.push({
            pattern,
            ears,
            tail,
            body,
            eyes: k % EYE_COLORS.length,
            base: (k * 7919) & 0xffff,
            secondary: (k * 104729) & 0xffff,
            tertiary: rgb565(0xf2efe9 ^ k),
            collar: k & 0xff,
            hat: (255 - k) & 0xff,
            name: '',
          });
        }
  return out;
}

describe('cat codec', () => {
  it('round trips every pattern/ears/tail/body combination (with eyes and colours)', () => {
    const cats = sampleCats();
    expect(cats.length).toBe(7 * 2 * 3 * 3);
    for (const c of cats) {
      const code = encodeCat(c);
      expect(code.length).toBe(CAT_CODE_LENGTH);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeCat(code)).toEqual(c);
    }
  });
  it('round trips the default cat with its name', () => {
    expect(decodeCat(encodeCat(DEFAULT_CAT), 'Tofu')).toEqual(DEFAULT_CAT);
  });
  it('rejects every single flipped bit (CRC)', () => {
    const code = encodeCat(DEFAULT_CAT);
    const bytes = fromBase64url(code)!;
    for (let bit = 0; bit < bytes.length * 8; bit++) {
      const f = bytes.slice();
      f[bit >> 3] ^= 0x80 >> (bit & 7);
      expect(decodeCat(toBase64url(f))).toBeNull();
    }
  });
  it('rejects a changed character, wrong length and garbage', () => {
    const code = encodeCat(DEFAULT_CAT);
    const ch = code[5] === 'A' ? 'B' : 'A';
    expect(decodeCat(code.slice(0, 5) + ch + code.slice(6))).toBeNull();
    expect(decodeCat(code.slice(1))).toBeNull();
    expect(decodeCat('!!!!!!!!!!!!!!!!!!')).toBeNull();
    expect(decodeCatOrDefault('nope', 'Mochi').name).toBe('Mochi');
  });
  it('filters the name on decode', () => {
    expect(decodeCat(encodeCat(DEFAULT_CAT), 'www.spam.com')?.name).toBe('');
  });
});

/** A recorded-like 75 s run: held directions (input hysteresis), pauses, 1-tick swats and jumps. */
function recordedLikeRun(seed: number, ticks = 2250): TickInput[] {
  let s = seed >>> 0 || 1;
  const rnd = (n: number): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s >>> 8) % n;
  };
  const out: TickInput[] = [];
  let dir = 3;
  while (out.length < ticks) {
    const idle = rnd(5) === 0;
    const len = idle ? 10 + rnd(50) : 8 + rnd(40);
    if (!idle && rnd(3) > 0) dir = ((dir - 1 + (rnd(3) - 1) + 8) % 8) + 1; // mostly small turns
    else if (!idle) dir = 1 + rnd(8);
    const speed = idle ? 0 : rnd(4) === 0 ? 1 : 2;
    for (let i = 0; i < len && out.length < ticks; i++) {
      let buttons = 0;
      if (i === len - 1 && rnd(3) === 0) buttons = 1; // swat at the end of a move
      if (i === 0 && rnd(6) === 0) buttons = 2; // jump
      out.push({ dir: (idle ? 0 : dir) as TickInput['dir'], speed: speed as TickInput['speed'], buttons });
    }
  }
  return out;
}

describe('ghost codec', () => {
  it('sync round trip keeps every tick, the room key and sim version', () => {
    const ins = recordedLikeRun(18);
    const g = encodeGhostSync(ins, dailyRoomId(18));
    const d = decodeGhostSync(g)!;
    expect(d.inputs).toEqual(ins);
    expect(d.roomHash).toBe(roomKey('daily-018'));
    expect(d.simVersion).toBe(SIM_VERSION);
  });
  it('a full 75 s recorded-like run stays at or under 600 characters (5 runs, both forms)', async () => {
    for (let seed = 1; seed <= 5; seed++) {
      const ins = recordedLikeRun(seed * 7777);
      expect(ins.length).toBe(2250);
      const plain = encodeGhostSync(ins, 'daily-018');
      const z = await encodeGhost(ins, 'daily-018');
      expect(plain.length).toBeLessThanOrEqual(600);
      expect(z.length).toBeLessThanOrEqual(plain.length);
      expect((await decodeGhost(z))!.inputs).toEqual(ins);
    }
  });
  it('async decode reads deflated and plain payloads; sync refuses deflated', async () => {
    const ins: TickInput[] = Array.from({ length: 900 }, (_, i) => ({ dir: (i % 300 < 150 ? 3 : 7) as TickInput['dir'], speed: 2, buttons: i % 100 === 0 ? 1 : 0 }));
    const z = await encodeGhost(ins, 'glass');
    expect((await decodeGhost(z))!.inputs).toEqual(ins);
    if (isDeflatedGhost(z)) expect(decodeGhostSync(z)).toBeNull();
    expect((await decodeGhost(encodeGhostSync(ins, 'glass')))!.inputs).toEqual(ins);
  });
  it('round trips edge cases: empty, long runs, every dir/speed/button', () => {
    expect(decodeGhostSync(encodeGhostSync([], 'x'))!.inputs).toEqual([]);
    const long: TickInput[] = Array.from({ length: 4000 }, () => ({ dir: 5, speed: 1, buttons: 0 }));
    expect(decodeGhostSync(encodeGhostSync(long, 'x'))!.inputs).toEqual(long);
    const all: TickInput[] = [];
    for (let d = 0; d <= 8; d++) for (let sp = 0; sp <= 2; sp++) for (let b = 0; b < 16; b++) all.push({ dir: d as TickInput['dir'], speed: sp as TickInput['speed'], buttons: b });
    expect(decodeGhostSync(encodeGhostSync(all, 'x'))!.inputs).toEqual(all);
  });
  it('rejects a flipped bit and garbage', async () => {
    const g = encodeGhostSync(recordedLikeRun(3, 300), 'glass');
    const b = fromBase64url(g)!;
    b[4] ^= 0x10;
    expect(decodeGhostSync(toBase64url(b))).toBeNull();
    expect(await decodeGhost('hello')).toBeNull();
    expect(decodeGhostSync('')).toBeNull();
  });
});

function bossRoom(): RoomDef {
  const props = [];
  for (let i = 0; i < 60; i++) props.push({ kind: [1, 2, 3, 6, 11, 15, 18][i % 7], x: i % 14, z: Math.floor(i / 14) * 2 + 1, level: (i % 4) as 0 | 1 | 2 | 3, rot: (i % 4) as 0 | 1 | 2 | 3, ...(i < 3 ? { target: true } : {}) });
  return { id: 'boss', shell: 5, routine: 3, event: 2, width: 14, depth: 12, spawn: { x: 13, z: 11 }, props, seed: 1, ticks: BOSS_TICKS };
}

describe('room codec', () => {
  it('round trips a boss-size room (14x12, 60 props, spawn at 13,11) and ancestors', () => {
    const r = { ...bossRoom(), ancestors: ['AbCdEfGhIjKl', 'zzzzzzzzzzzz'] };
    const code = encodeRoom(r);
    const d = decodeRoom(code)!;
    expect(d.width).toBe(14);
    expect(d.depth).toBe(12);
    expect(d.ticks).toBe(BOSS_TICKS);
    expect(d.spawn).toEqual(r.spawn);
    expect(d.props).toEqual(r.props);
    expect(d.ancestors).toEqual(r.ancestors);
    expect([d.shell, d.routine, d.event]).toEqual([5, 3, 2]);
    expect(d.id).toMatch(/^ugc-[0-9a-f]{8}$/);
    expect(d.seed).toBe(parseInt(d.id.slice(4), 16));
    expect(code.length).toBeLessThan(300); // v2: +2 bits a prop (ext, cable flags), longer header
  });
  it('rejects a changed character', () => {
    const code = encodeRoom(bossRoom());
    const ch = code[10] === 'A' ? 'B' : 'A';
    expect(decodeRoom(code.slice(0, 10) + ch + code.slice(11))).toBeNull();
  });
});

describe('codec api object', () => {
  it('exposes the CodecApi functions', () => {
    expect(typeof codec.encodeCat).toBe('function');
    expect(codec.filterName('  Mochi  ')).toBe('Mochi');
  });
});
