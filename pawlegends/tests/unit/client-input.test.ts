import { cellOf, createGrid, onPlayfield, snapCell } from '../../src/sim/map/grid';
import { describe, expect, it } from 'vitest';
import { aimFor, maxCooldown, trickAim } from '../../src/input/abilities';
import { Orders, type OrderEnv } from '../../src/input/orders';
import { MOBA_BINDINGS, actionFor, keyLabel } from '../../src/input/presets';
import { attackPriority, smartAim, type Unit } from '../../src/input/targeting';
import { STICK, turnBetween } from '../../src/input/touch/touchControls';
import { HEROES } from '../../src/data/heroes';
import { Op, type Command } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 100, maxHp = 100): Unit => ({ id, kind, team, x, y, hp, maxHp, state: 'idle' });

describe('presets (§9)', () => {
  it('maps the MOBA keys and never uses Ctrl, Alt, Meta or an F-key', () => {
    expect(actionFor('Mouse2')).toBe('move');
    expect(actionFor('KeyA')).toBe('attackMove');
    expect(actionFor('KeyS')).toBe('stop');
    expect(actionFor('KeyQ')).toBe('q');
    expect(actionFor('KeyD')).toBe('trick');
    expect(actionFor('KeyB')).toBe('nap');
    expect(actionFor('Digit2')).toBe('talent2');
    expect(actionFor('Space')).toBe('centre');
    expect(actionFor('Tab')).toBe('scoreboard');
    expect(actionFor('KeyH')).toBeNull();
    for (const codes of Object.values(MOBA_BINDINGS)) for (const c of codes) expect(c).not.toMatch(/^(Control|Alt|Meta|F\d)/);
    expect(keyLabel('move')).toBe('RMB');
    expect(keyLabel('r')).toBe('R');
  });
});

describe('aim specs come from the data (§6)', () => {
  it('uses the data ranges', () => {
    expect(aimFor('clem', 0)).toMatchObject({ kind: 'dir', shape: 'cone', range: HEROES.clem.abilities.q.range });
    expect(aimFor('sage', 1)).toMatchObject({ kind: 'point', range: HEROES.sage.abilities.w.range });
    expect(aimFor('sage', 2).away).toBe(true);
    expect(aimFor('brutus', 3)).toMatchObject({ kind: 'unit', range: HEROES.brutus.abilities.r.range });
    expect(trickAim('pounce').kind).toBe('point');
    expect(maxCooldown('clem', 3, 'pounce')).toBe(HEROES.clem.abilities.r.cooldown);
  });
});

describe('targeting (§9 Attack button)', () => {
  const me = unit(0, 'hero', 0, 10000, 10000);
  it('prefers an enemy hero in range, then the lowest-HP minion, then a tower', () => {
    const minionLow = unit(10, 'minion', 1, 11000, 10000, 40, 300);
    const minionHigh = unit(11, 'minion', 1, 10500, 10000, 290, 300);
    const tower = unit(20, 'tower', 1, 11500, 10000, 2000, 2500);
    const hero = unit(4, 'hero', 1, 11800, 10000, 500, 600);
    const ally = unit(1, 'hero', 0, 10100, 10000);
    expect(attackPriority([me, ally, minionLow, minionHigh, tower, hero], me, 0, 1600)).toBe(4);
    expect(attackPriority([me, minionLow, minionHigh, tower], me, 0, 1600)).toBe(10);
    expect(attackPriority([me, tower], me, 0, 1600)).toBe(20);
    expect(attackPriority([me, unit(5, 'hero', 1, 15000, 10000)], me, 0, 1600)).toBe(5);
    expect(attackPriority([me, ally], me, 0, 1600)).toBeNull();
  });
  it('smart-cast aims at the nearest enemy hero, else ahead', () => {
    const hero = unit(4, 'hero', 1, 12000, 10000);
    expect(smartAim(aimFor('clem', 0), [me, hero], me, 0, 0)).toMatchObject({ x: 12000, y: 10000 });
    const ahead = smartAim(aimFor('clem', 0), [me], me, 0, Math.PI / 2);
    expect(Math.round(ahead.x)).toBe(10000);
    expect(ahead.y).toBeGreaterThan(10000);
    expect(smartAim(aimFor('brutus', 3), [me, hero], me, 0, 0).id).toBe(4);
  });
});

describe('orders → commands', () => {
  function rig(hero: 'clem' | 'sage' | 'brutus' = 'clem', cds: number[] | null = [0, 0, 0, 0, 0], level = 5) {
    const sent: Command[] = [];
    let t = 0;
    const units: Unit[] = [unit(0, 'hero', 0, 10000, 10000), unit(4, 'hero', 1, 30000, 10000)];
    const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero, trick: 'pounce', cooldowns: () => cds, level: () => level, nowMs: () => t };
    return { o: new Orders(env), sent, units, tick: (ms: number) => (t += ms) };
  }
  it('keeps moves inside the map edge and rounds to integers (fun plan F3)', () => {
    const { o, sent } = rig();
    o.move(-5, 99999.6);
    // Sim v5: the corner is forest, so the goal walks back along the line to the playfield.
    const c = sent[0] as { op: number; x: number; y: number };
    expect(c.op).toBe(Op.Move);
    expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true);
    expect(onPlayfield(c.x, c.y) || snapCell(createGrid(), cellOf(c.x, c.y)) >= 0).toBe(true);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeLessThanOrEqual(60000);
  });
  it('a direction cast goes at once; a self cast at the hero', () => {
    const { o, sent } = rig();
    expect(o.cast(0, 12000, 10000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({ op: Op.Cast, slot: 0, x: 12000, y: 10000 });
    o.cast(3, 0, 0);
    expect(sent.at(-1)).toMatchObject({ op: Op.Cast, slot: 3, x: 10000, y: 10000 });
  });
  it('refuses when on cooldown or the ultimate is locked', () => {
    expect(rig('clem', [5, 0, 0, 0, 0]).o.cast(0, 12000, 10000)).toBe(false);
    expect(rig('clem', [0, 0, 0, 0, 0], 3).o.cast(3, 12000, 10000)).toBe(false);
  });
  it('an out-of-range point cast walks in, then casts once in range', () => {
    const { o, sent, units, tick } = rig('sage');
    o.cast(1, 20000, 10000);
    expect(sent.at(-1)).toEqual({ op: Op.Move, x: 20000, y: 10000 });
    expect(o.walkingIn).toBe(1);
    units[0] = { ...units[0], x: 15000 };
    tick(300);
    o.update();
    expect(sent.at(-1)).toMatchObject({ op: Op.Cast, slot: 1, x: 20000, y: 10000 });
    expect(o.walkingIn).toBeNull();
  });
  it('a unit cast follows its target and a new move cancels the walk-in', () => {
    const { o, sent, units, tick } = rig('brutus');
    o.cast(3, 0, 0, 4);
    expect(o.walkingIn).toBe(3);
    units[1] = { ...units[1], x: 28000 };
    tick(300);
    o.update();
    expect(sent.at(-1)).toEqual({ op: Op.Move, x: 28000, y: 10000 });
    o.move(1000, 1000);
    expect(o.walkingIn).toBeNull();
  });
});

describe('joystick turn threshold (§11.3)', () => {
  it('measures turns across the ±π seam', () => {
    expect(turnBetween(0.1, -0.1)).toBeCloseTo(0.2);
    expect(turnBetween(Math.PI - 0.05, -Math.PI + 0.05)).toBeCloseTo(0.1);
    expect(turnBetween(0, Math.PI)).toBeCloseTo(Math.PI);
    expect(STICK.turn).toBeCloseTo((Math.PI * 2) / 32);
    expect(STICK.everyMs).toBe(100);
  });
});
