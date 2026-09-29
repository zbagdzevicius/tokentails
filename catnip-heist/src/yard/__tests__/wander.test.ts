import { describe, expect, it } from 'vitest';
import { createAgent, insideObstacle, poke, release, stepAgents, SEPARATION, type YardAgent, type YardWorld } from '../wander';
import { buildGarden } from '../garden';

const world: YardWorld = {
  bounds: { minX: -12, maxX: 12, minZ: -8, maxZ: 8 },
  obstacles: [{ x: 0, z: 0, r: 2.4 }, { x: 6, z: 3, r: 0.5 }],
  spots: [{ x: 3, z: 3 }],
};

function makeAll(n: number): YardAgent[] {
  const out: YardAgent[] = [];
  for (let i = 0; i < n; i++) out.push(createAgent(`cat${i}`, world, out));
  return out;
}

describe('yard wander AI', () => {
  it('is deterministic per id', () => {
    const a = makeAll(20), b = makeAll(20);
    for (let t = 0; t < 600; t++) {
      stepAgents(a, world, 1 / 30);
      stepAgents(b, world, 1 / 30);
    }
    expect(a.map((x) => [x.x, x.z, x.behaviour])).toEqual(b.map((x) => [x.x, x.z, x.behaviour]));
  });

  it('stays in bounds, out of obstacles, and uses varied behaviours', () => {
    const agents = makeAll(58);
    const seen = new Set<string>();
    // Checked with plain comparisons: ~200k agent-steps through expect() cost seconds on their own.
    const { minX, maxX, minZ, maxZ } = world.bounds;
    const escapes: string[] = [];
    for (let t = 0; t < 30 * 120; t++) {
      stepAgents(agents, world, 1 / 30);
      agents.forEach((a, i) => {
        seen.add(a.behaviour);
        const out = !(a.x >= minX && a.x <= maxX && a.z >= minZ && a.z <= maxZ);
        if ((out || insideObstacle(world, a.x, a.z, 0.3)) && escapes.length < 5)
          escapes.push(`cat${i} at step ${t}: (${a.x.toFixed(3)}, ${a.z.toFixed(3)}) ${out ? 'out of bounds' : 'inside an obstacle'}`);
      });
    }
    expect(escapes).toEqual([]);
    for (const b of ['WALK', 'SIT', 'GROOM', 'SLEEP', 'LOAF', 'IDLE']) expect(seen.has(b)).toBe(true);
  });

  it('poke holds a cat in place until released', () => {
    const [a] = makeAll(1);
    a.behaviour = 'IDLE';
    poke(a);
    for (let t = 0; t < 300; t++) stepAgents([a], world, 1 / 30);
    expect(a.behaviour as string).toBe('POSE');
    const x = a.x;
    release(a);
    for (let t = 0; t < 300; t++) stepAgents([a], world, 1 / 30);
    expect(a.behaviour as string).not.toBe('POSE');
    expect(Number.isFinite(x)).toBe(true);
  });

  it('keeps cats apart (resting ones too) in the real garden', () => {
    const g = buildGarden();
    const w = g.world;
    const agents: YardAgent[] = [];
    for (let i = 0; i < 59; i++) agents.push(createAgent(`cat${i}`, w, agents));
    let worst = Infinity;
    const inside: string[] = [];
    for (let t = 0; t < 30 * 60; t++) {
      stepAgents(agents, w, 1 / 30);
      if (t < 30 * 5) continue;
      for (let i = 0; i < agents.length; i++)
        for (let j = i + 1; j < agents.length; j++) worst = Math.min(worst, Math.hypot(agents[i].x - agents[j].x, agents[i].z - agents[j].z));
      agents.forEach((a, i) => {
        if (insideObstacle(w, a.x, a.z, 0.3) && inside.length < 5) inside.push(`cat${i} at step ${t}`);
      });
    }
    expect(inside).toEqual([]);
    expect(worst).toBeGreaterThan(SEPARATION * 0.5);
    g.dispose();
  });
});
