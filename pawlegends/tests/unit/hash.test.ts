import { describe, expect, it } from 'vitest';
import { FNV_OFFSET, fnvBytes, fnvInt, fnvInts, fnvString, hashHex } from '../../src/sim/hash';
import { createWorld, hashWorld } from '../../src/sim/world';

describe('FNV-1a', () => {
  it('matches the FNV-1a 32 reference on bytes', () => {
    // FNV-1a 32 of "a" is 0xe40c292c, of "foobar" is 0xbf9cf968.
    expect(fnvBytes(FNV_OFFSET, [0x61])).toBe(0xe40c292c);
    expect(fnvBytes(FNV_OFFSET, Array.from('foobar', (c) => c.charCodeAt(0)))).toBe(0xbf9cf968);
  });
  it('fnvInt feeds 4 little-endian bytes', () => {
    expect(fnvInt(FNV_OFFSET, 0x04030201)).toBe(fnvBytes(FNV_OFFSET, [1, 2, 3, 4]));
    expect(fnvInts(FNV_OFFSET, [1, 2])).toBe(fnvInt(fnvInt(FNV_OFFSET, 1), 2));
  });
  it('strings and hex', () => {
    expect(fnvString(FNV_OFFSET, 'picks')).not.toBe(fnvString(FNV_OFFSET, 'coin'));
    expect(hashHex(0xab)).toBe('000000ab');
    expect(hashHex(-1)).toBe('ffffffff');
  });
});

describe('hashWorld', () => {
  it('is stable for equal worlds and sensitive to any field and the rng state', () => {
    const a = createWorld(1);
    const b = createWorld(1);
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.x[3] = 1;
    expect(hashWorld(b)).not.toBe(hashWorld(a));
    const c = createWorld(1);
    c.zTtl[23] = 5;
    expect(hashWorld(c)).not.toBe(hashWorld(a));
    const d = createWorld(1);
    d.rng.next();
    expect(hashWorld(d)).not.toBe(hashWorld(a));
  });
});
