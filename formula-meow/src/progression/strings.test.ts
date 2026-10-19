import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PROGRESSION_EN } from '../ui/strings/progression.en';
import { ACHIEVEMENTS } from './achievements';
import { HAT_INFO, PAINT_PRESETS, TRAIL_INFO } from '../content/cosmetics';
import { challengeById, challengesFor } from './challenges';
import { BANNED_CLAIMS } from '../share/cards/card-text';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.test-util.ts') ? [p] : [];
  });
}

describe('progression strings', () => {
  it("every t('…') in src/progression has an English entry", () => {
    const missing: string[] = [];
    for (const f of files(join(__dirname))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
        const k = m[1].replace(/\\'/g, "'");
        if (!(k in PROGRESSION_EN)) missing.push(`${f}: ${k}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('achievement, cosmetic and challenge copy is registered', () => {
    const keys = [
      ...ACHIEVEMENTS.flatMap((a) => [a.name, a.desc]),
      ...Object.values(HAT_INFO).map((h) => h.name),
      ...Object.values(TRAIL_INFO).map((h) => h.name),
      ...PAINT_PRESETS.map((p) => p.name),
    ];
    for (let d = 1; d < 60; d++) for (const id of challengesFor(d, { tracks: ['kitchen'], hasCoins: true, hasBranches: true, hasBattle: true, hasTimeTrial: true })) keys.push(challengeById(id)!.text);
    expect(keys.filter((k) => !(k in PROGRESSION_EN))).toEqual([]);
  });

  it('makes no money or donation claims (fish are an in-game currency only)', () => {
    const all = Object.values(PROGRESSION_EN).join('\n').toLowerCase();
    for (const banned of ['donat', 'real money', '€', '$', 'usd', 'eur ', 'buy now', 'purchase with']) expect(all).not.toContain(banned);
    // the share lane's claim list (its "N players / races" rule is about audience claims, not "Finish 3 races" goals)
    for (const b of BANNED_CLAIMS.filter((r) => !r.source.includes('players|races'))) expect(all).not.toMatch(b);
  });
});
