/**
 * GAPS B1, client side: the ping debounce in Orders (before anything is logged), the wheel geometry, the chip →
 * ping map, the announcer's ping and bark lines (text chosen at render time) and the pick screen's lane hint.
 */
import { describe, expect, it } from 'vitest';
import { PING, PING_KIND, PING_KINDS } from '../../src/data/pings';
import { actionFor } from '../../src/input/presets';
import { Orders, PING_DEBOUNCE_MS, type OrderEnv } from '../../src/input/orders';
import { Announcer } from '../../src/render/announcer';
import { Op, type Command } from '../../src/sim/api';
import { HEAL_BARK, PING_TEXT, WHEEL_KINDS, chipPing, laneHint, wheelSlice } from '../../src/ui/pingText';

function orders(): { o: Orders; sent: Command[]; tick: (ms: number) => void } {
  const sent: Command[] = [];
  let t = 0;
  const env: OrderEnv = {
    send: (c) => sent.push(c),
    units: () => [],
    meId: 0,
    hero: 'clem',
    trick: 'pounce',
    cooldowns: () => null,
    level: () => 1,
    nowMs: () => t,
  };
  return { o: new Orders(env), sent, tick: (ms) => (t += ms) };
}

describe('Orders.ping (GAPS B1)', () => {
  it('sends Op.Ping, then holds pings for the sim’s gap (45 ticks = 1.5 s), up to 60 a match', () => {
    const { o, sent, tick } = orders();
    expect(PING_DEBOUNCE_MS).toBe(1500);
    expect(o.ping(PING_KIND.Group, 1000, 2000)).toBe(true);
    expect(sent.at(-1)).toEqual({ op: Op.Ping, kind: PING_KIND.Group, x: 1000, y: 2000, id: 255 });
    tick(PING_DEBOUNCE_MS - 1);
    expect(o.pingReady()).toBe(false);
    expect(o.ping(PING_KIND.Defend, 0, 0)).toBe(false);
    tick(1);
    expect(o.ping(PING_KIND.Focus, 0, 0, 4)).toBe(true);
    for (let i = 0; i < 100; i++) {
      tick(PING_DEBOUNCE_MS);
      o.ping(PING_KIND.GoHere, 0, 0);
    }
    expect(sent.filter((c) => c.op === Op.Ping)).toHaveLength(PING.maxPerMatch);
    expect(o.pingReady()).toBe(false);
  });

  it('a faster match speed shortens the wall-clock debounce', () => {
    const { o, tick } = orders();
    o.speed = 4;
    o.ping(PING_KIND.Group, 0, 0);
    tick(PING_DEBOUNCE_MS / 4);
    expect(o.pingReady()).toBe(true);
  });
});

describe('ping wheel and chips (GAPS B1)', () => {
  it('six slices clockwise from the top; the dead zone picks nothing', () => {
    expect(WHEEL_KINDS).toHaveLength(6);
    expect(new Set(WHEEL_KINDS).size).toBe(6);
    expect(WHEEL_KINDS).not.toContain(PING_KIND.GoHere);
    expect(WHEEL_KINDS).not.toContain(PING_KIND.Focus);
    expect(wheelSlice(0, -80)).toBe(0);
    expect(wheelSlice(80, -40)).toBe(1);
    expect(wheelSlice(80, 40)).toBe(2);
    expect(wheelSlice(0, 80)).toBe(3);
    expect(wheelSlice(-80, 40)).toBe(4);
    expect(wheelSlice(-80, -40)).toBe(5);
    expect(wheelSlice(5, 5)).toBe(-1);
  });

  it('G opens the wheel', () => {
    expect(actionFor('KeyG')).toBe('ping');
  });

  it('a chip tap maps to its ping', () => {
    expect(chipPing('pudding')).toBe(PING_KIND.Pudding);
    expect(chipPing('calm')).toBe(PING_KIND.Pudding);
    expect(chipPing('escort')).toBe(PING_KIND.Group);
    expect(chipPing('suddenDeath')).toBe(PING_KIND.Group);
    expect(chipPing('rats')).toBe(PING_KIND.GoHere);
    expect(chipPing('gates')).toBeNull();
  });

  it('every kind has a label and an answer', () => {
    for (const k of PING_KINDS) {
      expect(PING_TEXT[k].label.length).toBeGreaterThan(0);
      expect(PING_TEXT[k].ack.length).toBeGreaterThan(0);
    }
  });

  it('the pick screen lane hint fits the role', () => {
    expect(laneHint('Marksman')).toMatch(/Sunny/);
    expect(laneHint('Tank')).toMatch(/Puddle/);
    expect(laneHint('Support')).toMatch(/either/);
  });
});

describe('announcer: pings and answers (GAPS B1)', () => {
  it('a ping is a marker moment; an ok bark says the kind’s answer, a heal bark "Healing first!"', () => {
    const a = new Announcer(0, 0);
    const p = a.feed({ type: 'ping', tick: 100, kind: 'pudding', x: 50000, y: 30000, target: -1, took: 1 });
    expect(p).toEqual([expect.objectContaining({ key: 'ping', size: 'ping', title: 'Take Pudding', at: { x: 50000, y: 30000, color: PING_TEXT.pudding.color } })]);
    expect(a.feed({ type: 'bark', tick: 100, id: 1, what: 'ok' })).toEqual([expect.objectContaining({ key: 'barkPing', size: 'bark', slot: 1, title: PING_TEXT.pudding.ack })]);
    expect(a.feed({ type: 'bark', tick: 100, id: 2, what: 'heal' })).toEqual([expect.objectContaining({ key: 'barkHeal', size: 'bark', slot: 2, title: HEAL_BARK, tone: 'bad' })]);
    expect(a.pings).toBe(1);
    expect(a.pingsTaken).toBe(1);
  });
});
