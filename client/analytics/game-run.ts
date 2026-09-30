import {
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
 * Turns GameContext's GAME_START / GAME_LOADED / GAME_STOP events into
 * analytics events and keeps the run timing outside React state.
 */
export function createGameRunTracker(
  track: (event: AnalyticsEvent) => void,
  getPlatform: () => AnalyticsPlatform,
  now: () => number = Date.now,
) {
  let selectedAt: number | null = null;
  let startedAt: number | null = null;

  const elapsed = (from: number | null) => (from === null ? null : now() - from);

  return {
    /** A mode or level was picked; `game_loaded` measures from here. */
    select() {
      selectedAt = now();
    },
    start(run: RunContext & { isRestart?: boolean }) {
      startedAt = now();
      track(buildGameStartEvent({ ...run, platform: getPlatform() }));
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
