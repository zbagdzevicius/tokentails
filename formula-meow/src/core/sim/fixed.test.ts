import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { atan2L, cosL, pow06, sinL, wrapAngle } from './fixed';

describe('fixed math (GDD 3.1)', () => {
  it('trig LUT is accurate to 1e-6 and atan2 to 2e-5', () => {
    let maxS = 0;
    let maxA = 0;
    for (let i = -2000; i <= 2000; i++) {
      const a = i * 0.0137;
      maxS = Math.max(maxS, Math.abs(sinL(a) - Math.sin(a)), Math.abs(cosL(a) - Math.cos(a)));
      const y = Math.sin(i * 0.7) * (1 + (i % 7));
      const x = Math.cos(i * 1.3) * (1 + (i % 5));
      if (x !== 0 || y !== 0) maxA = Math.max(maxA, Math.abs(wrapAngle(atan2L(y, x) - Math.atan2(y, x))));
    }
    expect(maxS).toBeLessThan(1e-6);
    expect(maxA).toBeLessThan(2e-5);
    expect(atan2L(0, 0)).toBe(0);
  });

  it('pow06 matches x^0.6 and wrapAngle stays in [-PI, PI)', () => {
    for (let i = 0; i <= 100; i++) expect(Math.abs(pow06(i / 100) - Math.pow(i / 100, 0.6))).toBeLessThan(2e-4);
    for (const a of [-10, -Math.PI, 0, Math.PI, 7, 100]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThan(Math.PI);
      expect(Math.abs(Math.sin(w) - Math.sin(a))).toBeLessThan(1e-9);
    }
  });

  it('sim sources never call wall-clock, Math.random or engine trig (lint)', () => {
    const root = join(__dirname, '..', '..');
    const dirs = ['core/sim', 'core/track', 'items-ai'];
    const skip = /(\.test\.ts$|mesh\.ts$|themes\.ts$|[\\/]dressing[\\/])/;
    const banned = /Math\.(sin|cos|tan|atan|atan2|asin|acos|pow|exp|log|random|hypot|cbrt)\b|Date\.|performance\.now|new Date/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !skip.test(p) && !p.endsWith('fixed.ts')) {
          readFileSync(p, 'utf8')
            .split('\n')
            .forEach((line, n) => {
              const code = line.replace(/\/\/.*$/, '');
              if (banned.test(code)) offenders.push(`${p}:${n + 1}: ${line.trim()}`);
            });
        }
      }
    };
    for (const d of dirs) walk(join(root, d));
    expect(offenders).toEqual([]);
  });
});
