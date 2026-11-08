// @vitest-environment happy-dom
/**
 * Live KPI props (docs/plans/moba/BENCHMARKS.md, "Live product KPIs"): `day_n` for D1 / D7 retention, `load_ms` for time
 * to first match, and `mp_net` with the raw input-latency p50 / p95 (every 60 s and once at the end).
 */
import { describe, expect, it } from 'vitest';
import { FIRST_DAY_KEY, retentionDay, sinceLoadMs } from '../../src/analytics/kpi';
import { MpHud } from '../../src/app/mpHud';
import { FakeLink, fakeHost } from './mp-helpers';

const DAY = 86_400_000;
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('KPI props', () => {
  it('day_n is 0 on the first day, then whole UTC days since it', () => {
    const kv = mem();
    const t = 20_000 * DAY + 5 * 3600_000;
    expect(retentionDay(t, kv)).toBe(0);
    expect(kv.m.get(FIRST_DAY_KEY)).toBe('20000');
    expect(retentionDay(t + 18 * 3600_000, kv)).toBe(0);
    expect(retentionDay(t + DAY, kv)).toBe(1);
    expect(retentionDay(t + 7 * DAY, kv)).toBe(7);
  });

  it('day_n survives blocked or junk storage (a new cohort, never a throw)', () => {
    expect(retentionDay(DAY * 3, null)).toBe(0);
    const bad = { getItem: () => 'x', setItem: () => undefined };
    expect(retentionDay(DAY * 3, bad)).toBe(0);
    const throws = { getItem: () => { throw new Error('blocked'); }, setItem: () => undefined };
    expect(retentionDay(DAY * 3, throws)).toBe(0);
    // a first day in the future (clock moved back) starts again today
    const kv = mem();
    kv.setItem(FIRST_DAY_KEY, '999999');
    expect(retentionDay(DAY * 3, kv)).toBe(0);
    expect(kv.m.get(FIRST_DAY_KEY)).toBe('3');
  });

  it('load_ms is a non-negative whole number', () => {
    const v = sinceLoadMs();
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it('the party HUD sends load_ms on mp_match_start and a final mp_net with the input p50 / p95', () => {
    const link = new FakeLink(0, ['A', 'B', null, null, null, null]);
    link.net = () => ({ rttMs: 40, buffer: 1, holds: 0, catchups: 0, inputMs: 120, inputP50: 110, inputP95: 160, inputN: 42 }) as never;
    const f = fakeHost(['A', 'B', 'C', 'D', 'E', 'F']);
    const hud = new MpHud(f.host, link, { hideNames: false });
    hud.start();
    hud.ended('won', 'core', true);
    const start = f.tracked.find((t) => t.event === 'mp_match_start')!;
    expect(typeof start.props.load_ms).toBe('number');
    const net = f.tracked.filter((t) => t.event === 'mp_net');
    expect(net).toHaveLength(1);
    expect(net[0].props).toMatchObject({ input_ms: 120, input_p50: 110, input_p95: 160, input_n: 42, final: true });
    hud.dispose();
  });
});
