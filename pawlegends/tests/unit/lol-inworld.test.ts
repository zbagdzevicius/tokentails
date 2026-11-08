/**
 * LoL pass, lane C (in-world, render only): the unit bars' trailing damage chunk, the damage-number merge window and
 * sizes, the tower aggro ring pulse, the low-health vignette formula, the move chevrons and the desktop cursors.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHUNK_HOLD_MS, CHUNK_RATE, chunkStep, heroBarH, nameFont, type HpChunk } from '../../src/ui/overhead';
import { DAMAGE_FX, DAMAGE_STYLE, DamageNumbers, numberDrift } from '../../src/render/fx/DamageNumbers.js';
import { aggroPulse, BEAM, TowerBeams } from '../../src/render/fx/towerBeams';
import { LOW_HP, lowHpBeat, lowHpOpacity } from '../../src/render/fx/lowHp';
import { CHEVRON_LIFE, chevronSize, TARGET_MARK_LIFE, targetMarkAlpha } from '../../src/render/fx/orderMarks';
import { CURSOR_KINDS, cursorCss } from '../../src/input/cursor';
import { NapRunes } from '../../src/render/fx/napRune';

describe('unit bar trailing chunk (C1)', () => {
  it('a drop holds 300 ms at the old HP, then drains at 1.5 × maxHp a second down to the HP', () => {
    const max = 1000;
    let c: HpChunk = chunkStep(null, 1000, max, 0);
    expect(c.trail).toBe(1000);
    c = chunkStep(c, 700, max, 100);
    expect(c.trail).toBe(1000);
    c = chunkStep(c, 700, max, 100 + CHUNK_HOLD_MS - 1);
    expect(c.trail).toBe(1000);
    c = chunkStep(c, 700, max, 100 + CHUNK_HOLD_MS + 100);
    // 100 ms of drain at 1500 HP/s = 150
    expect(c.trail).toBeCloseTo(1000 - (CHUNK_RATE * max * 100) / 1000, 5);
    c = chunkStep(c, 700, max, 5000);
    expect(c.trail).toBe(700);
  });
  it('a second hit while the chunk holds keeps the far edge and restarts the hold; a heal snaps', () => {
    let c = chunkStep(null, 1000, 1000, 0);
    c = chunkStep(c, 800, 1000, 10);
    c = chunkStep(c, 600, 1000, 250);
    expect(c.trail).toBe(1000);
    c = chunkStep(c, 600, 1000, 250 + CHUNK_HOLD_MS - 5);
    expect(c.trail).toBe(1000);
    c = chunkStep(c, 650, 1000, 600);
    expect(c.trail).toBe(650);
  });
  it('hero bars: 10 px on desktop, 8 on phones; names 11 / 9 px', () => {
    expect(heroBarH(false)).toBe(10);
    expect(heroBarH(true)).toBe(8);
    expect(nameFont(false)).toBe(11);
    expect(nameFont(true)).toBe(9);
  });
});

describe('damage numbers (C4)', () => {
  it('hits on one target within 250 ms merge into one number; later ones start a new number', () => {
    const ctx = { game: { realTime: 0 }, camera: null };
    const d = new DamageNumbers(ctx);
    const p = new THREE.Vector3();
    const a = d.show(p, '10', 'normal', 3, 10);
    ctx.game.realTime = 0.2;
    expect(d.show(p, '10', 'normal', 3, 10)).toBe(a);
    expect(a.value).toBe(20);
    ctx.game.realTime = 0.2 + DAMAGE_FX.mergeWindow + 0.01;
    expect(d.show(p, '10', 'normal', 3, 10)).not.toBe(a);
    expect(DAMAGE_FX.mergeWindow).toBe(0.25);
  });
  it('LoL colours and sizes: phone 13 / 16 / 20 px, words 24; desktop 18 / 24 / 32, words 36', () => {
    expect([DAMAGE_STYLE.normal.phone, DAMAGE_STYLE.heavy.phone, DAMAGE_STYLE.crit.phone, DAMAGE_STYLE.word.phone]).toEqual([13, 16, 20, 24]);
    expect([DAMAGE_STYLE.normal.size, DAMAGE_STYLE.heavy.size, DAMAGE_STYLE.crit.size, DAMAGE_STYLE.word.size]).toEqual([18, 24, 32, 36]);
    expect(DAMAGE_STYLE.normal.color).toBe('#FFFFFF');
    expect(DAMAGE_STYLE.crit.color).toBe('#FFD34D');
    expect(DAMAGE_STYLE.hurt.size).toBeLessThan(DAMAGE_STYLE.normal.size);
    for (const k of Object.keys(DAMAGE_STYLE) as (keyof typeof DAMAGE_STYLE)[]) expect(DAMAGE_STYLE[k].phone).toBeLessThanOrEqual(k === 'word' || k === 'pop' ? 24 : 20);
  });
  it('a number floats up 30 px with a slight arc; hits on the player drift left', () => {
    expect(numberDrift(1, 1, false).dy).toBeCloseTo(-30);
    expect(numberDrift(0, 1, false).dy).toBeCloseTo(0);
    expect(numberDrift(1, 1, false).dx).toBeGreaterThan(0);
    expect(numberDrift(1, -1, false).dx).toBeLessThan(0);
    expect(numberDrift(1, 1, true).dx).toBeLessThan(0);
  });
});

describe('tower beams and aggro ring (C2)', () => {
  it('the ring is red for 1.5 s after the tower last hit or aimed at the player, pulsing at 2 Hz', () => {
    expect(aggroPulse(0, 0)).toBeGreaterThan(0.5);
    expect(aggroPulse(BEAM.aggroHold - 0.01, 3)).toBeGreaterThan(0);
    expect(aggroPulse(BEAM.aggroHold, 3)).toBe(0);
    expect(aggroPulse(-1, 0)).toBe(0);
    const lo = aggroPulse(0.1, 0.375);
    const hi = aggroPulse(0.1, 0.125);
    expect(hi).toBeGreaterThan(lo);
  });
  it('a shot shows a pooled beam that fades out; the player gets a flare', () => {
    const b = new TowerBeams(4);
    b.shot(0, 5, 0, 4, 1, 3, 0xffd34d, false);
    b.shot(0, 5, 0, 4, 1, 3, 0xffd34d, true);
    expect(b.live).toBe(2);
    expect(b.group.getObjectsByProperty('name', 'tower-beam').length).toBe(4);
    b.update(BEAM.hitLife + 0.01);
    expect(b.live).toBe(0);
    b.dispose();
  });
});

describe('low-health vignette (C3)', () => {
  it('0.18 at 30% HP rising linearly to 0.5 at 8%; off above 30%, while dead, or at 0', () => {
    expect(lowHpOpacity(0.31, false)).toBe(0);
    expect(lowHpOpacity(1, false)).toBe(0);
    expect(lowHpOpacity(0.2999, false)).toBeCloseTo(LOW_HP.min, 2);
    expect(lowHpOpacity(0.08, false)).toBeCloseTo(0.5, 5);
    expect(lowHpOpacity(0.19, false)).toBeCloseTo(0.18 + 0.32 * (0.11 / 0.22), 5);
    expect(lowHpOpacity(0.02, false)).toBeCloseTo(0.5, 5);
    expect(lowHpOpacity(0.1, true)).toBe(0);
  });
  it('a 1.1 Hz heartbeat of ±0.08 below 15%; none above, none under reduce motion', () => {
    expect(lowHpBeat(0.2, 0.227, false)).toBe(0);
    expect(Math.abs(lowHpBeat(0.1, 1 / (4 * 1.1), false))).toBeCloseTo(0.08, 5);
    expect(lowHpBeat(0.1, 1 / (4 * 1.1), true)).toBe(0);
  });
});

describe('order markers (C5) and cursors', () => {
  it('move chevrons collapse into the point over 350 ms; the target outline holds 600 ms', () => {
    expect(chevronSize(0)).toBeGreaterThan(3);
    expect(chevronSize(CHEVRON_LIFE - 0.001)).toBeLessThan(0.6);
    expect(chevronSize(CHEVRON_LIFE)).toBe(0);
    for (let t = 0; t < CHEVRON_LIFE - 0.02; t += 0.02) expect(chevronSize(t + 0.02)).toBeLessThan(chevronSize(t));
    expect(targetMarkAlpha(0)).toBe(1);
    expect(targetMarkAlpha(TARGET_MARK_LIFE)).toBe(0);
  });
  it('every desktop cursor is a data-URL SVG under 2 KB', () => {
    for (const k of CURSOR_KINDS) expect(cursorCss(k).length).toBeLessThan(2048);
    expect(decodeURIComponent(cursorCss('enemy'))).toContain('#ff3b4d');
  });
});

describe('nap rune (C6)', () => {
  it('fills with the channel, hides on cancel, and keeps the scene child count constant', () => {
    const r = new NapRunes(6);
    const before = r.group.children.length;
    r.begin();
    r.put(2, 0, 0, 0.42, 1, 0);
    r.end();
    expect(r.live).toBe(1);
    expect(r.fill[2]).toBeCloseTo(0.42, 5);
    r.begin();
    r.end();
    expect(r.live).toBe(0);
    expect(r.fill[2]).toBe(-1);
    expect(r.group.children.length).toBe(before);
    r.dispose();
  });
});

describe('sim v17 Steadfast in the world (V17.md §7)', async () => {
  const { steadfastEdges, isSteadfast, STEADFAST_OUTLINE, STEADFAST_WORD } = await import('../../src/render/steadfast');
  const { statusWord } = await import('../../src/ui/overhead');
  const { BuffFlag } = await import('../../src/sim/api');

  it('the outline is white and shows only while the Steadfast bit is set', () => {
    expect(STEADFAST_OUTLINE).toBe(0xffffff);
    expect(isSteadfast(BuffFlag.Steadfast)).toBe(true);
    expect(isSteadfast(BuffFlag.Purrified)).toBe(false);
  });

  it('the "Steadfast!" word fires once per start, again after it ended; a plain Purr-ify never fires it', () => {
    expect(STEADFAST_WORD).toBe('Steadfast!');
    const was = new Set<number>();
    const ent = (buffs: number) => [{ id: 3, kind: 'hero', buffs }];
    expect(steadfastEdges(was, ent(BuffFlag.Purrified))).toEqual([]);
    expect(steadfastEdges(was, ent(BuffFlag.Purrified | BuffFlag.Steadfast))).toEqual([3]);
    expect(steadfastEdges(was, ent(BuffFlag.Purrified | BuffFlag.Steadfast))).toEqual([]);
    expect(steadfastEdges(was, ent(0))).toEqual([]);
    expect(steadfastEdges(was, ent(BuffFlag.Steadfast))).toEqual([3]);
  });

  it('the status chip reads Steadfast, not Purr-ified, while the cap immunity runs', () => {
    expect(statusWord(BuffFlag.Purrified | BuffFlag.Steadfast)).toBe('Steadfast');
    expect(statusWord(BuffFlag.Purrified)).toBe('Purr-ified');
  });
});
