/**
 * Card skins are render only (GDD §7.2): the sim hash is the same with and without card skins built and worn, and
 * no file under src/sim imports anything from render or meta (so a skin can never be sim input).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMatch, fillPicks, hash, step } from '../../src/sim/index';
import { setFeaturedSkins, setRosterSkins } from '../../src/render/skins/registry';
import { heroBuilt } from '../../src/render/chars';
import { cardLook } from '../../src/render/cosmetics';

function run(seed: number): string {
  const { picks, tricks } = fillPicks(seed, 'lambo', 'pounce');
  const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
  for (let t = 0; t < 1200; t++) step(m, []);
  return String(hash(m));
}

describe('card skins never touch the sim', () => {
  it('same sim hash with and without skins', () => {
    const before = [3, 17, 99].map(run);
    setRosterSkins([{ id: 'x', name: 'Mochi', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt', sprite: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PICKLES/base.png' }], { x: 40 });
    setFeaturedSkins([{ catalogId: '65a1b2c3d4e5f6a7b8c9d0e1', name: 'Nova', type: 'STELLAR' }]);
    for (const h of ['lambo', 'brutus', 'cacklejaw'] as const) heroBuilt(h, 1, cardLook('cat.x'), 1, { match: true });
    expect([3, 17, 99].map(run)).toEqual(before);
  });
  it('src/sim/** imports nothing from render, meta, ui or skins', () => {
    const SIM = path.resolve(__dirname, '../../src/sim');
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.[cm]?[jt]s$/.test(e.name)) files.push(p);
      }
    };
    walk(SIM);
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        expect(m[1], path.relative(SIM, f)).not.toMatch(/(^|\/)(render|meta|ui|skins|app|embed)(\/|$)/);
      }
    }
  });
});
