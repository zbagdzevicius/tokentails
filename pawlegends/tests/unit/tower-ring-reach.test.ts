/**
 * The tower range ring shows the sim's real reach. Player report: "I'm being hit even if I'm not under border of
 * tower". The ring's dashed line sat at 6.72 m while a tower hit a hero whose body edge was up to 8 m away
 * (combat/attack.ts inAttackRange: range + tower radius + target radius, centre to centre).
 */
import { describe, expect, it } from 'vitest';
import { RADIUS } from '../../src/data/map';
import { TOWERS } from '../../src/data/towers';
import { inAttackRange } from '../../src/sim/combat/attack';
import { TOWER_REACH_M, TOWER_RING_SIZE_M } from '../../src/render/views/towerView';
import { putHero, quietMatch, towerId } from './sim-helpers';

describe('tower range ring', () => {
  it('draws its line where the tower stops reaching a hero', () => {
    // the dashed line is drawn at 0.48 of the decal (decals.ts dashRingTexture)
    expect(TOWER_RING_SIZE_M * 0.48).toBeCloseTo(TOWER_REACH_M, 6);
    for (const k of ['outer', 'inner', 'gate', 'hearth'] as const) expect(TOWERS[k].range + RADIUS.tower).toBeLessThanOrEqual(TOWER_REACH_M * 1000);
  });

  it('matches the sim: a hero whose edge touches the ring is in range, one 5 cm outside is not', () => {
    const m = quietMatch();
    const w = m.world;
    const t = towerId(1, 0);
    const hero = putHero(m, 0, w.x[t], w.y[t]);
    const edge = TOWER_REACH_M * 1000 + RADIUS.hero; // hero centre when its edge sits on the ring
    w.x[hero] = w.x[t] + edge;
    w.y[hero] = w.y[t];
    expect(inAttackRange(w, t, hero)).toBe(true);
    w.x[hero] = w.x[t] + edge + 50;
    expect(inAttackRange(w, t, hero)).toBe(false);
  });
});
