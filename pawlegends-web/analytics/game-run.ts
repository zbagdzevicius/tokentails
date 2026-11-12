import {
  buildEvent,
  buildGameLoadedEvent,
  buildGameQuitEvent,
  buildGameStartEvent,
  buildGameStopEvent,
  type AnalyticsEvent,
  type AnalyticsPlatform,
  type GameStopOutcomeInput,
} from "./events";

interface RunContext {
  mode: string;
  level: string | null;
}

interface StopPayload {
  completedLevel?: string | null;
  score?: number;
  rawScore?: number;
  catnipEarned?: number;
  outcome?: GameStopOutcomeInput;
}

/**
 * Turns GameContext's run events (RUN_BEGIN, GAME_LOADED, LIFE_LOST, RUN_HINT,
 * GAME_STOP) into analytics events and keeps the run timing outside React
 * state. `start` is called on RUN_BEGIN only (plan F6): a restart that never
 * begins sends no `game_start`.
 */
export function createGameRunTracker(
  track: (event: AnalyticsEvent) => void,
  getPlatform: () => AnalyticsPlatform,
  now: () => number = Date.now,
) {
  let selectedAt: number | null = null;
  let startedAt: number | null = null;
  /** PLAY AGAIN was pressed: the next start is a restart unless it says otherwise. */
  let restartPending = false;

  const elapsed = (from: number | null) => (from === null ? null : now() - from);

  return {
    /** A mode or level was picked; `game_loaded` measures from here. */
    select() {
      selectedAt = now();
      restartPending = false;
    },
    /** PLAY AGAIN on the same level (GAME_RESTART). Sends nothing by itself. */
    restart() {
      restartPending = true;
    },
    /** RUN_BEGIN, the only start signal (plan F6). */
    start(run: RunContext & { isRestart?: boolean }) {
      startedAt = now();
      const isRestart = run.isRestart ?? restartPending;
      restartPending = false;
      track(buildGameStartEvent({ ...run, isRestart, platform: getPlatform() }));
    },
    /** Some scenes emit GAME_LOADED more than once: only the first counts. */
    loaded(run: RunContext) {
      if (selectedAt === null) return;
      track(
        buildGameLoadedEvent({
          ...run,
          platform: getPlatform(),
          loadMs: elapsed(selectedAt),
        }),
      );
      selectedAt = null;
    },
    stop(run: RunContext, payload: StopPayload) {
      track(
        buildGameStopEvent({
          ...run,
          ...payload,
          stopOutcome: payload.outcome,
          platform: getPlatform(),
          durationMs: elapsed(startedAt),
        }),
      );
      startedAt = null;
    },
    /** A Paw Guard was spent (`lives_left` absent: unlimited). */
    lifeLost(run: RunContext, guardsLeft: number | null) {
      track(
        buildEvent("life_lost", {
          mode: run.mode,
          level: run.level,
          ...(guardsLeft === null ? {} : { lives_left: guardsLeft }),
        }),
      );
    },
    hintShown(run: RunContext, hint: string) {
      track(buildEvent("ftue_hint_shown", { mode: run.mode, level: run.level, hint }));
    },
    hintDone(run: RunContext, hint: string) {
      track(buildEvent("ftue_hint_done", { mode: run.mode, level: run.level, hint }));
    },
    /** The first clear of a level by this player. */
    firstClear(run: RunContext) {
      track(buildEvent("ftue_first_clear", { mode: run.mode, level: run.level }));
    },
    /** The player left from a start gate or a first-run hint without playing on. */
    abandon(run: RunContext, step: string) {
      track(buildEvent("ftue_abandon", { mode: run.mode, level: run.level, step }));
    },
    /** The player left the mode. Sends `game_quit` only mid-run. */
    leave(run: RunContext) {
      if (startedAt !== null) {
        track(
          buildGameQuitEvent({
            ...run,
            platform: getPlatform(),
            durationMs: elapsed(startedAt),
          }),
        );
      }
      startedAt = null;
      selectedAt = null;
    },
  };
}

export type GameRunTracker = ReturnType<typeof createGameRunTracker>;
