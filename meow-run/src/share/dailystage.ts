// The 'daily' StageDef (SHARE lane): a seeded endless course. Today's seed makes the Daily Run; any other seed (an
// endless or older Daily challenge link) makes an "Endless challenge" on that exact course. The chunks come from the
// endless generator with our own rng (the TRAILS lane keeps endless.chunk deterministic: same rng sequence and index
// order -> same chunks; index 0 resets its module state).
import { stages } from '../core/registry';
import { makeRng } from '../core/rng';
import type { Rng, StageDef, ThemeId } from '../core/types';
import { dayForSeed, dayKey, dayLabel, seedForDay, themeForSeed } from './daily';

export const dailyCfg = {
  seed: seedForDay(dayKey(Date.now())),
  theme: themeForSeed(seedForDay(dayKey(Date.now()))) as ThemeId,
  /** the UTC day this seed is the Daily Run of ('' = a plain endless course) */
  day: dayKey(Date.now()),
};

export const todayKey = (): string => dayKey(Date.now());
/** the configured course is today's Daily Run */
export const isTodayDaily = (): boolean => dailyCfg.day !== '' && dailyCfg.day === todayKey() && dailyCfg.seed === seedForDay(dailyCfg.day);

/** configure today's Daily Run */
export function setDailyToday(): void {
  const day = todayKey();
  dailyCfg.seed = seedForDay(day);
  dailyCfg.theme = themeForSeed(dailyCfg.seed);
  dailyCfg.day = day;
}
/** configure a course from a challenge (seed + landscape) */
export function setDailyCourse(seed: number, theme: ThemeId): void {
  dailyCfg.seed = seed >>> 0 || 1;
  dailyCfg.theme = theme;
  dailyCfg.day = dayForSeed(dailyCfg.seed, Date.now());
}
/** 'Daily Run - Oct 24' for a Daily seed, else 'Endless challenge' */
export function courseLabel(seed: number): string {
  const day = dayForSeed(seed, Date.now());
  return day ? `Daily Run - ${dayLabel(day)}` : 'Endless challenge';
}

let rng: Rng = makeRng(1);
const endless = (): StageDef => stages.get('endless');

export const dailyStage: StageDef = {
  id: 'daily',
  index: 90,
  get name(): string {
    return isTodayDaily() ? 'Daily Run' : dailyCfg.day ? `Daily Run ${dayLabel(dailyCfg.day)}` : 'Endless challenge';
  },
  blurb: 'Same course for everyone today',
  get theme(): ThemeId {
    return dailyCfg.theme;
  },
  music: 'endless',
  get speed() {
    return endless().speed;
  },
  get start() {
    return endless().start;
  },
  scoreTarget: 0,
  bells: 0,
  chunk(b, _rng, i) {
    if (i === 0) rng = makeRng(dailyCfg.seed);
    return endless().chunk!(b, rng, i);
  },
};

export function registerDailyStage(): void {
  stages.add(dailyStage);
}
