/**
 * Per-room rank thresholds from the planner bot (QA round 3) and the validator band. The table is generated:
 *   BADCAT_WRITE_RANKS=1 npx vitest run src/content/rank-bot.test.ts
 * writes src/content/rank-bot.json (The Glass and days 1..INDEX_DAYS, the current SIM_VERSION). A normal run re-plays
 * a sample against it, so a sim or content change that moves scores without a rewrite fails here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RANKS, SIM_VERSION, rankMinsFromBot } from '../types';
import { plannerRun } from '../sim/planner';
import { dailyRoom, glassRoom } from './daily';
import { resolve } from './resolve';
import { INDEX_DAYS } from './schedule';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'rank-bot.json');
const WRITE = process.env.BADCAT_WRITE_RANKS === '1';

/** The yardstick: the planner bot with a 0.2 s reaction, ranked rules (practice for The Glass). */
function botScoreOf(id: string): number {
  const play = id === 'glass' ? resolve(glassRoom(), 'practice') : resolve(dailyRoom(Number(id.slice(6))), 'ranked', Number(id.slice(6)));
  return plannerRun({ ...play, rankMins: undefined }, { react: 6 }).score;
}
const ids = (): string[] => ['glass', ...Array.from({ length: INDEX_DAYS }, (_, i) => `daily-${String(i + 1).padStart(3, '0')}`)];

/** Shell id of a table room. */
const shellOf = (id: string): number => (id === 'glass' ? glassRoom().shell : dailyRoom(Number(id.slice(6))).shell);

/** QA round 3: a shell's rooms stay within ±BAND_PCT % of the shell's median bot score. */
export const BAND_PCT = 40;

export function bandProblems(rooms: Record<string, number>): string[] {
  const byShell = new Map<number, [string, number][]>();
  for (const [id, v] of Object.entries(rooms)) {
    // The Glass is frozen (its hash is pinned) and practice-only: outside the daily band
    if (id === 'glass') continue;
    const sh = shellOf(id);
    byShell.set(sh, [...(byShell.get(sh) ?? []), [id, v]]);
  }
  const out: string[] = [];
  for (const [sh, list] of byShell) {
    if (list.length < 3) continue;
    const sorted = list.map(([, v]) => v).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    for (const [id, v] of list) if (Math.abs(v - med) * 100 > med * BAND_PCT) out.push(`${id} (shell ${sh}): bot ${v} vs median ${med}`);
  }
  return out;
}

describe('rank thresholds from the planner bot (QA round 3)', () => {
  if (WRITE) {
    it('writes rank-bot.json', () => {
      const rooms: Record<string, number> = {};
      for (const id of ids()) rooms[id] = botScoreOf(id);
      writeFileSync(FILE, `${JSON.stringify({ version: SIM_VERSION, note: 'planner bot (sim/planner.ts, 0.2 s reaction) per room; rank thresholds = rankMinsFromBot', rooms }, null, 1)}\n`);
      expect(Object.keys(rooms).length).toBe(INDEX_DAYS + 1);
    }, 600_000);
    return;
  }
  const table = JSON.parse(readFileSync(FILE, 'utf8')) as { version: number; rooms: Record<string, number> };

  it('is written for the current SIM_VERSION and covers The Glass and every index day', () => {
    expect(table.version).toBe(SIM_VERSION);
    for (const id of ids()) expect(table.rooms[id], id).toBeGreaterThan(0);
  });

  it('matches the planner on a sample (re-write the table after a sim or content change)', () => {
    for (const id of ['glass', 'daily-001', 'daily-002', 'daily-007']) expect(botScoreOf(id), id).toBe(table.rooms[id]);
  }, 60_000);

  it('Legendary = bot × 0.9, Gremlin = bot × 0.35, thresholds rise', () => {
    const m = rankMinsFromBot(20_000);
    expect(m).toHaveLength(RANKS.length);
    expect(m[6]).toBe(18_000);
    expect(m[4]).toBe(7_000);
    for (let i = 1; i < m.length; i++) expect(m[i]).toBeGreaterThan(m[i - 1]);
    const play = resolve(dailyRoom(2), 'ranked', 2);
    expect(play.rankMins?.[6]).toBe(Math.floor((table.rooms['daily-002'] * 90) / 100));
    expect(resolve(dailyRoom(2), 'ftue', 2).rankMins).toBeUndefined();
  });

  it(`each shell's rooms stay within ±${BAND_PCT} % of its median bot score`, () => {
    expect(bandProblems(table.rooms)).toEqual([]);
  });
});
