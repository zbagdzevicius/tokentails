import { describe, expect, it } from 'vitest';
import { lintDataSource, lintSimSource, stripCode } from './lint-sim.mjs';

const rules = (src, file = 'src/sim/x.ts') => lintSimSource(src, file).map((p) => p.rule);

describe('lint-sim', () => {
  it('passes clean integer code', () => {
    expect(rules("import { idiv } from './fixed';\nexport const f = (a: number) => idiv(a, 3) + Math.imul(a, 2);\n")).toEqual([]);
  });
  it('flags the §15 item 3 rules', () => {
    expect(rules('const a = Math.random();')).toContain('Math.random');
    expect(rules('const a = Math.sqrt(2);')).toContain('Math.sqrt');
    expect(rules('const a = Math.floor(2);')).toContain('Math.floor');
    expect(rules('const t = Date.now();')).toContain('Date');
    expect(rules('const t = performance.now();')).toContain('performance');
    expect(rules('const a = 1.5 * b;')).toContain('float literal');
    expect(rules('const a = b * .5;')).toContain('float literal');
    expect(rules('const a = 1e3;')).toContain('float literal');
    expect(rules('const a = b / 2;')).toContain('division (use idiv)');
    expect(rules('const a = 2 ** 3;')).toContain('** operator');
    expect(rules('for (const k of Object.keys(o)) {}')).toContain('Object.keys/values/entries');
    expect(rules('const m = new Map();')).toContain('Map/Set');
    expect(rules('for (const k in o) {}')).toContain('for-in');
    expect(rules('window.x = 1;')).toContain('global window');
    expect(rules('const hp = 450;')).toContain('number 450 (move it to src/data)');
    expect(rules("import * as THREE from 'three';")).toContain('import');
    expect(rules("import { x } from '../render/x';")).toContain('import');
  });
  it('closes the aliasing loopholes (Math by another name, Reflect)', () => {
    expect(rules("const a = Math['sqrt'](x);")).toContain('Math (only Math.imul/trunc/abs/min/max)');
    expect(rules('const M = Math; const a = M.sqrt(x);')).toContain('Math (only Math.imul/trunc/abs/min/max)');
    expect(rules('const { sqrt, random } = Math; random();')).toContain('Math (only Math.imul/trunc/abs/min/max)');
    expect(rules('const f = (m = Math) => m;')).toContain('Math (only Math.imul/trunc/abs/min/max)');
    expect(rules('for (const k of Reflect.ownKeys(o)) {}')).toContain('Reflect');
    expect(rules('for (const k of Object.getOwnPropertyNames(o)) {}')).toContain('Object.getOwnProperty*');
    expect(rules('const a = Math.imul(b, 3) + Math.max(c, 1) + Math . min(d, 2);')).toEqual([]);
  });
  it('an allow comment exempts the number rule only', () => {
    expect(rules('const hp = 450; // lint-sim: allow')).toEqual([]);
    expect(rules('const a = Math.sqrt(450); // lint-sim: allow')).toEqual(['Math.sqrt']);
    expect(rules('const a = 1.5; // lint-sim: allow')).toEqual(['float literal']);
  });
  it('allows hex, small numbers, prose, the math files and allow comments', () => {
    expect(rules('// 1.5 seconds / Math.random in a comment\nconst s = "a/b 2.5";\nconst m = 0xff;')).toEqual([]);
    expect(rules('const a = b / 2;', 'src/sim/fixed.ts')).toEqual([]);
    expect(rules('const k = 4096;', 'src/sim/rng.ts')).toEqual([]);
    expect(rules('const hp = 450; // lint-sim: allow')).toEqual([]);
    expect(rules("import { MAP } from '../data/map';")).toEqual([]);
  });
  it('data must be integer', () => {
    expect(lintDataSource('export const A = { speed: 4.9 };').length).toBe(1);
    expect(lintDataSource('export const A = { speed: 4900 }; // 4.9 m/s').length).toBe(0);
  });
  it('stripCode keeps offsets and line breaks', () => {
    const src = "a // x\n'b/c' `d${e}`\n/* f\n g */h";
    const out = stripCode(src);
    expect(out.length).toBe(src.length);
    expect(out.split('\n').length).toBe(src.split('\n').length);
    expect(out).not.toContain('/');
  });
});
