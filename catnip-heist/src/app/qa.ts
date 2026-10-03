/**
 * Non-production QA hooks on window.__heist (installed only in dev builds or with ?qa=1).
 * Extends the contract's QAHooks.
 */
import type { Input, QAHooks, SimState } from '../types';
import { decodeInputs, renderAscii, type InputLog } from '../sim';
import { getSolution } from '../levels';
import type { App, AppScreen, AppStats } from './App';
import { QA_BUILD } from './qa-build';

export interface HeistQA extends QAHooks {
  getState(): SimState | null;
  /** Advance n ticks synchronously. In replay mode the replay's inputs are used. */
  step(n: number, input?: Partial<Input>): SimState | null;
  /** Hold this input for the realtime loop (buttons fire once per call); null returns to live input. */
  setInput(i: Partial<Input> | null): void;
  /** Start a heist that plays this input log (object or JSON string). Resolves once it is on screen. */
  loadReplay(log: InputLog | string, opts?: { speed?: number }): Promise<SimState | null>;
  /** Start a normal heist with these cats (and level, default the current one). Resolves once it is on screen. */
  start(catIds?: [string, string], levelId?: string): Promise<SimState | null>;
  /**
   * Play the bundled solution of a level (default heist-01) as a real run with live inputs, so it
   * reaches Results and, in embed mode, the host's save path. Resolves with the final state.
   */
  playSolution(levelId?: string): Promise<SimState | null>;
  /** Open the level select. */
  levels(): void;
  /** Campaign progress as stored (stars, best scores, wins per level id). */
  progress(): ReturnType<App['progress']['toJSON']>;
  /** Forget all campaign progress. */
  resetProgress(): void;
  /** Freeze the realtime clock so only step(n) advances the sim. */
  freeze(on: boolean): void;
  screen(): AppScreen;
  stats(): AppStats;
  /** Recorded input log of the current run. */
  log(): InputLog | null;
  /** Last completed run's log (from browser storage), if any. */
  lastReplay(): InputLog | null;
  yardStats(): ReturnType<NonNullable<ReturnType<App['yardApi']>>['stats']> | null;
  yardReady(): Promise<boolean>;
  /** First run (G10): the brief card is open. */
  briefOpen(): boolean;
  /** Close the brief as the player would. */
  closeBrief(): void;
  /** First-run memory (briefs seen, route taps, rewinds). */
  ftue(): ReturnType<App['ftue']['toJSON']>;
  /** Forget the first-run memory (briefs show again). */
  resetFtue(): void;
  /** The ghost-paw route on screen: why it is shown (null when hidden) and how many prints. */
  route(): { shown: string | null; prints: number };
  /** Toggle the route as a tap on the objective chip does. */
  tapObjective(): void;
  /** Feed these recorded runs ([dx, dy, flags, count]) to the current play-mode run, tick by tick. */
  feed(runs: InputLog['runs']): SimState | null;
  /** Rewind 5 s (only after a detection on levels 1-3); true when it rewound. */
  rewind(): boolean;
  /** The "Rewind 5 s" offer is up. */
  rewindOffered(): boolean;
  app: App;
}

export function installQA(app: App): HeistQA | null {
  // main.ts only imports this module behind QA_BUILD, but the bundler still emits the dynamic
  // import's chunk in production builds. This guard makes that orphan chunk an empty stub, so no
  // QA driver code is ever served publicly.
  if (!QA_BUILD) return null;
  const qa: HeistQA = {
    app,
    getState: () => app.getSession()?.cur ?? null,
    step: (n, input) => app.qaStep(Math.max(0, Math.floor(n)), input),
    setInput: (i) => app.qaSetInput(i),
    async loadReplay(log, opts) {
      const parsed: InputLog = typeof log === 'string' ? (JSON.parse(log) as InputLog) : log;
      if (opts?.speed) app.replaySpeed = opts.speed;
      await app.startRun([parsed.catIds[0], parsed.catIds[1]], parsed);
      return app.getSession()?.cur ?? null;
    },
    async start(catIds, levelId) {
      await app.startRun(catIds ?? app.ui.getPickedCats(), undefined, levelId);
      return app.getSession()?.cur ?? null;
    },
    async playSolution(levelId = 'heist-01') {
      const log = getSolution(levelId);
      if (!log) return null;
      await app.startRun([log.catIds[0], log.catIds[1]], undefined, log.levelId);
      return app.qaFeed(decodeInputs(log.runs));
    },
    levels: () => app.openLevels(),
    progress: () => app.progress.toJSON(),
    resetProgress: () => app.progress.reset(),
    freeze: (on) => app.qaFreeze(on),
    screen: () => app.screen,
    stats: () => app.stats(),
    log: () => app.getSession()?.log() ?? null,
    lastReplay: () => app.lastReplay(),
    yardStats: () => app.yardApi()?.stats() ?? null,
    briefOpen: () => app.briefOpen,
    closeBrief: () => app.qaCloseBrief(),
    ftue: () => app.ftue.toJSON(),
    resetFtue: () => app.ftue.reset(),
    route: () => app.qaRoute(),
    tapObjective: () => app.toggleRoute(),
    rewind: () => app.rewind(),
    rewindOffered: () => app.ui.ftue.rewindOffered,
    feed: (runs) => app.qaFeed(decodeInputs(runs)),
    async yardReady() {
      const y = app.yardApi();
      if (!y) return false;
      await y.ready;
      return true;
    },
    renderGameToText() {
      const s = app.getSession();
      const lv = app.getLevelDef();
      if (!s || !lv) return `screen: ${app.screen}`;
      const c = s.cur;
      return [
        `screen: ${app.screen}  tick ${c.tick}  active ${c.activeIndex}  coins ${c.coinsCollected}/${c.coins.length}  key ${c.hasKey}  rescued ${c.rescued}  won ${c.won}  spotted ${c.spottedCount}  score ${c.score}  hash ${c.hash}`,
        renderAscii(lv, c),
      ].join('\n');
    },
  };
  (window as unknown as { __heist: HeistQA }).__heist = qa;
  return qa;
}
