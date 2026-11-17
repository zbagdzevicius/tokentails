// @vitest-environment happy-dom
/** Hidden in a bush or stealthed: the view dims (render/fx/hideDim.ts), mirroring the sim's hiddenFrom rule. */
import { describe, expect, it } from 'vitest';
import { HideDim, hiddenFromEnemies } from '../../src/render/fx/hideDim';
import { BuffFlag } from '../../src/sim/api';
import { BUSHES, BRUSH_REVEAL_MM } from '../../src/data/map';

const b = BUSHES[0];
const unit = (o: Partial<{ kind: string; team: number; state: string; buffs: number; x: number; y: number }> = {}) => ({
  kind: 'hero',
  team: 0,
  state: 'idle',
  buffs: 0,
  x: b.x,
  y: b.y,
  ...o,
});

describe('hide dim', () => {
  it('in a bush with no enemy near: hidden', () => {
    const me = unit({ buffs: BuffFlag.InBrush });
    expect(hiddenFromEnemies(me, [me], 0)).toBe(true);
  });

  it('out of a bush, down or revealed: not hidden', () => {
    expect(hiddenFromEnemies(unit(), [], 0)).toBe(false);
    expect(hiddenFromEnemies(unit({ buffs: BuffFlag.InBrush, state: 'dead' }), [], 0)).toBe(false);
    expect(hiddenFromEnemies(unit({ buffs: BuffFlag.InBrush | BuffFlag.Marked }), [], 0)).toBe(false);
    expect(hiddenFromEnemies(null, [], 0)).toBe(false);
  });

  it('an enemy close by or in the same bush reveals; an ally does not; stealth counts on its own', () => {
    const me = unit({ buffs: BuffFlag.InBrush });
    const near = unit({ team: 1, x: b.x + BRUSH_REVEAL_MM - 10 });
    const far = unit({ team: 1, x: b.x + 20_000 });
    const ally = unit({ team: 0, x: b.x + 100 });
    expect(hiddenFromEnemies(me, [near], 0)).toBe(false);
    expect(hiddenFromEnemies(me, [far, ally], 0)).toBe(true);
    expect(hiddenFromEnemies(me, [{ ...near, state: 'dead' }], 0)).toBe(true);
    expect(hiddenFromEnemies(unit({ buffs: BuffFlag.Stealth, x: b.x + 30_000 }), [far], 0)).toBe(true);
  });

  it('toggles one class-free attribute under the HUD, no text', () => {
    const root = document.createElement('div');
    const hud = document.createElement('div');
    root.appendChild(hud);
    const d = new HideDim(root);
    expect(root.firstChild).toBe(d.el);
    expect(d.el!.textContent).toBe('');
    expect(d.el!.dataset.on ?? '').toBe('');
    d.update(true);
    expect(d.on).toBe(true);
    expect(d.el!.dataset.on).toBe('1');
    d.update(false);
    expect(d.el!.dataset.on).toBe('');
    d.force = true;
    d.update(false);
    expect(d.el!.dataset.on).toBe('1');
  });
});
