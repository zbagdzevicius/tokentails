import { describe, expect, it } from 'vitest';
import { ModelBuilder } from '../../src/render/views/rig';

// Nov 12: sim v22's standard Hearthwood left one scenery builder empty and mergeGeometries([]) threw inside
// createHearthwoodView, so every Classic 5v5 start fell back to Home. An empty builder is now an empty, hidden mesh
// (the whole view needs Canvas 2D: e2e hp-bars.spec.ts starts a Classic match).
describe('Hearthwood view', () => {
  it('a builder with nothing in it says so', () => {
    const b = new ModelBuilder();
    expect(b.empty).toBe(true);
    b.box(1, 1, 1, 0xffffff);
    expect(b.empty).toBe(false);
  });
});
