/**
 * Deterministic capture hooks (plan G7 "Deterministic capture mode"; used by task 6d's driver in
 * client/e2e/capture/).
 *
 * Compiled in only when the build sets `NEXT_PUBLIC_CAPTURE=1`: the checks below compare an
 * inlined constant, so a production build without the flag drops every branch and no
 * `__TT_CAPTURE__` marker reaches the bundle's behaviour.
 *
 * With the flag, a page that sets `window.__TT_CAPTURE_SEED__` (string) before boot gets:
 *
 *   window.__TT_CAPTURE__ = {
 *     version: 1,
 *     seed,                       the look seed (fireflies, stars, procedural plates)
 *     games(): Phaser.Game[]      booted games (registered by makeGameConfig's postBoot)
 *     freeze(game?)               stops the real-time loop
 *     step(frames = 1, dtMs = 1000 / 60, game?)  advances whole frames with a fixed delta and
 *                                 renders each; time starts at 0, so two runs match frame for frame
 *     state(sceneKey?)            the look state of a scene (worldLook.ts)
 *   }
 *
 * Gameplay randomness keeps its own source; the driver seeds `Math.random` itself (as the e2e
 * fixtures do) and answers the backend with page.route fixtures.
 *
 * Only type imports from Phaser.
 */

export const CAPTURE_FLAG = "__TT_CAPTURE__";
export const CAPTURE_SEED = "__TT_CAPTURE_SEED__";

export function captureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CAPTURE === "1";
}

type CaptureWindow = Window & Record<string, unknown>;

/** The capture seed set by the driver, or null (normal play, or capture compiled out). */
export function captureSeed(): string | null {
  if (process.env.NEXT_PUBLIC_CAPTURE !== "1") return null;
  if (typeof window === "undefined") return null;
  const seed = (window as unknown as CaptureWindow)[CAPTURE_SEED];
  return typeof seed === "string" && seed ? seed : null;
}

interface StepState {
  time: number;
}

const stepState = new WeakMap<object, StepState>();
const games: Phaser.Game[] = [];

/** Called from makeGameConfig's postBoot. No-op unless capture is compiled in. */
export function registerCaptureGame(game: Phaser.Game): void {
  if (process.env.NEXT_PUBLIC_CAPTURE !== "1") return;
  if (typeof window === "undefined") return;
  games.push(game);
  game.events.once("destroy", () => {
    const index = games.indexOf(game);
    if (index >= 0) games.splice(index, 1);
  });
  installCaptureApi(window as unknown as CaptureWindow);
}

function liveGames(): Phaser.Game[] {
  return games.filter((game) => !!game.canvas?.isConnected);
}

function installCaptureApi(win: CaptureWindow) {
  if (win[CAPTURE_FLAG]) return;
  const pick = (game?: Phaser.Game) => game ?? liveGames()[0];
  win[CAPTURE_FLAG] = {
    version: 1,
    get seed() {
      return captureSeed();
    },
    games: () => liveGames(),
    freeze(game?: Phaser.Game) {
      const target = pick(game);
      if (!target) return false;
      target.loop.sleep();
      if (!stepState.has(target)) stepState.set(target, { time: 0 });
      return true;
    },
    step(frames = 1, dtMs = 1000 / 60, game?: Phaser.Game) {
      const target = pick(game);
      if (!target) return 0;
      if (!stepState.has(target)) {
        target.loop.sleep();
        stepState.set(target, { time: 0 });
      }
      const state = stepState.get(target)!;
      const count = Math.max(0, Math.floor(frames));
      for (let i = 0; i < count; i += 1) {
        state.time += dtMs;
        target.step(state.time, dtMs);
      }
      return state.time;
    },
    state(sceneKey?: string) {
      const target = pick();
      if (!target) return null;
      const scenes = target.scene.getScenes(true) as Array<Phaser.Scene & { lookState?: () => unknown }>;
      const scene = sceneKey ? scenes.find((s) => s.sys.settings.key === sceneKey) : scenes.find((s) => s.lookState);
      return scene?.lookState?.() ?? null;
    },
  };
}
