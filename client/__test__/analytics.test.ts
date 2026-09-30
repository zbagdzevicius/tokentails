/**
 * Consent gate and GAME_* -> PostHog event mapping for client/analytics.
 */
import { createAnalytics, type AnalyticsClient } from "@/analytics/client";
import { readConsent, type ConsentState } from "@/analytics/consent";
import { createGameRunTracker } from "@/analytics/game-run";
import {
  ANALYTICS_EVENTS,
  buildGameLoadedEvent,
  buildGameQuitEvent,
  buildGameStartEvent,
  buildGameStopEvent,
  gameOutcome,
} from "@/analytics/events";

const mockGetPlatform = jest.fn();
jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => mockGetPlatform() },
}));

import { getPlatform } from "@/analytics/platform";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup({
  apiKey = "phc_test",
  stored = "unset" as ConsentState,
} = {}) {
  let optedOut = false;
  const client: jest.Mocked<AnalyticsClient> = {
    capture: jest.fn(),
    register: jest.fn(),
    opt_in_capturing: jest.fn(() => {
      optedOut = false;
    }),
    opt_out_capturing: jest.fn(() => {
      optedOut = true;
    }),
    has_opted_out_capturing: jest.fn(() => optedOut),
    reset: jest.fn(),
  };
  const load = jest.fn(async () => client);
  const writeConsent = jest.fn();
  const analytics = createAnalytics({
    apiKey,
    load,
    superProperties: () => ({
      app: "core",
      platform: "web",
      device_tier: "unknown",
    }),
    readConsent: () => stored,
    writeConsent,
  });
  return { analytics, client, load, writeConsent };
}

const startEvent = buildGameStartEvent({
  mode: "MATCH_3",
  level: "1",
  platform: "web",
});

describe("analytics consent gate", () => {
  it("sends nothing and loads nothing before consent", async () => {
    const { analytics, client, load } = setup();

    analytics.track(startEvent);
    await flush();

    expect(analytics.getConsent()).toBe("unset");
    expect(load).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("does not queue events from before consent", async () => {
    const { analytics, client } = setup();

    analytics.track(startEvent);
    await analytics.setConsent("granted");
    await flush();

    expect(client.capture).not.toHaveBeenCalled();
  });

  it("captures after the player accepts, with EU host and super properties", async () => {
    const { analytics, client, load, writeConsent } = setup();

    await analytics.setConsent("granted");
    analytics.track(startEvent);
    await flush();

    expect(writeConsent).toHaveBeenCalledWith("granted");
    expect(load).toHaveBeenCalledWith("phc_test", "https://eu.i.posthog.com");
    expect(client.register).toHaveBeenCalledWith({
      app: "core",
      platform: "web",
      device_tier: "unknown",
    });
    expect(client.opt_in_capturing).not.toHaveBeenCalled();
    expect(client.capture).toHaveBeenCalledWith("game_start", {
      mode: "MATCH_3",
      level: "1",
      platform: "web",
      is_restart: false,
    });
  });

  it("uses a stored grant from an earlier visit", async () => {
    const { analytics, client } = setup({ stored: "granted" });

    analytics.track(startEvent);
    await flush();

    expect(client.capture).toHaveBeenCalledTimes(1);
  });

  it("stops sending and resets the anonymous id when consent is revoked", async () => {
    const { analytics, client, writeConsent } = setup({ stored: "granted" });

    analytics.track(startEvent);
    await flush();
    await analytics.setConsent("denied");
    analytics.track(startEvent);
    await flush();

    expect(writeConsent).toHaveBeenLastCalledWith("denied");
    expect(client.reset).toHaveBeenCalledTimes(1);
    expect(client.opt_out_capturing).toHaveBeenCalledTimes(1);
    expect(client.capture).toHaveBeenCalledTimes(1);
  });

  it("opts back in silently when consent is granted again", async () => {
    const { analytics, client } = setup({ stored: "granted" });

    analytics.track(startEvent);
    await flush();
    await analytics.setConsent("denied");
    await analytics.setConsent("granted");
    analytics.track(startEvent);
    await flush();

    expect(client.opt_in_capturing).toHaveBeenCalledWith({
      captureEventName: null,
    });
    expect(client.capture).toHaveBeenCalledTimes(2);
  });

  it("never loads the client when a denied player has not loaded it", async () => {
    const { analytics, load } = setup();

    await analytics.setConsent("denied");
    analytics.track(startEvent);
    await flush();

    expect(load).not.toHaveBeenCalled();
  });

  it("is a no-op without a PostHog key, even with consent", async () => {
    const { analytics, client, load } = setup({ apiKey: "", stored: "granted" });

    expect(analytics.enabled).toBe(false);
    await analytics.setConsent("granted");
    analytics.track(startEvent);
    await flush();

    expect(load).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("treats unreadable storage as no consent", () => {
    // The test environment has no window, so localStorage access throws.
    expect(readConsent()).toBe("unset");
  });
});

describe("game event mapping", () => {
  it("maps a completed level to game_finish with outcome win", () => {
    const event = buildGameStopEvent({
      mode: "MATCH_3",
      level: "3",
      platform: "ios",
      completedLevel: "3",
      score: 12,
      rawScore: 4200,
      catnipEarned: 12,
      durationMs: 61_240,
    });

    expect(event).toEqual({
      name: ANALYTICS_EVENTS.GAME_FINISH,
      properties: {
        mode: "MATCH_3",
        level: "3",
        platform: "ios",
        outcome: "win",
        duration_s: 61.2,
        score: 4200,
        catnip: 12,
      },
    });
  });

  it("maps a level stop without completion to game_fail", () => {
    const event = buildGameStopEvent({
      mode: "PIXEL_RESCUE",
      level: "2",
      platform: "android",
      completedLevel: null,
      score: 3,
    });

    expect(event.name).toBe("game_fail");
    expect(event.properties).toMatchObject({
      outcome: "fail",
      score: 3,
      catnip: 3,
      duration_s: null,
    });
  });

  it("treats a Purrsuit stop without an outcome as a finished run", () => {
    expect(gameOutcome("CATNIP_CHAOS", undefined)).toBe("run_end");
    expect(
      buildGameStopEvent({
        mode: "CATNIP_CHAOS",
        level: "01",
        platform: "web",
        score: 40,
      }).name,
    ).toBe("game_finish");
  });

  it("maps the Purrsuit stop outcome to finish or fail", () => {
    const stop = (stopOutcome: "won" | "died" | "quit") =>
      buildGameStopEvent({
        mode: "CATNIP_CHAOS",
        level: "02",
        platform: "web",
        score: 7,
        stopOutcome,
      });

    expect(stop("won")).toMatchObject({
      name: "game_finish",
      properties: { outcome: "win", catnip: 7 },
    });
    expect(stop("died")).toMatchObject({
      name: "game_fail",
      properties: { outcome: "fail" },
    });
    expect(stop("quit")).toMatchObject({
      name: "game_fail",
      properties: { outcome: "fail" },
    });
  });

  it("ignores a stop outcome in level modes", () => {
    expect(gameOutcome("MATCH_3", null, "won")).toBe("fail");
    expect(gameOutcome("MATCH_3", "3", "died")).toBe("win");
  });

  it("maps start, loaded and quit", () => {
    expect(
      buildGameStartEvent({
        mode: "CATNIP_CHAOS",
        level: null,
        platform: "web",
        isRestart: true,
      }).properties,
    ).toEqual({
      mode: "CATNIP_CHAOS",
      level: null,
      platform: "web",
      is_restart: true,
    });
    expect(
      buildGameLoadedEvent({
        mode: "HOME",
        level: null,
        platform: "web",
        loadMs: 812.6,
      }).properties.load_ms,
    ).toBe(813);
    expect(
      buildGameQuitEvent({
        mode: "HOME",
        level: null,
        platform: "web",
        durationMs: -5,
      }).properties,
    ).toMatchObject({ duration_s: null });
  });

  it("never carries identifying properties", () => {
    const allowed = new Set([
      "mode",
      "level",
      "platform",
      "is_restart",
      "load_ms",
      "outcome",
      "duration_s",
      "score",
      "catnip",
      "stars",
    ]);
    const events = [
      startEvent,
      buildGameStopEvent({ mode: "MATCH_3", level: "1", platform: "web" }),
      buildGameLoadedEvent({ mode: "HOME", level: null, platform: "web" }),
      buildGameQuitEvent({ mode: "HOME", level: null, platform: "web" }),
    ];
    for (const event of events) {
      for (const key of Object.keys(event.properties)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});

describe("game run tracker", () => {
  function tracker() {
    let clock = 1_000;
    const track = jest.fn();
    const run = createGameRunTracker(track, () => "android", () => clock);
    const advance = (ms: number) => {
      clock += ms;
    };
    return { run, track, advance };
  }

  it("sends start then finish with the run duration", () => {
    const { run, track, advance } = tracker();

    run.start({ mode: "MATCH_3", level: "4" });
    advance(30_000);
    run.stop(
      { mode: "MATCH_3", level: "4" },
      { completedLevel: "4", rawScore: 900, catnipEarned: 5, score: 5 },
    );

    expect(track.mock.calls.map(([event]) => event.name)).toEqual([
      "game_start",
      "game_finish",
    ]);
    expect(track.mock.calls[1][0].properties).toMatchObject({
      platform: "android",
      duration_s: 30,
      score: 900,
      catnip: 5,
    });
  });

  it("passes the GAME_STOP outcome through to the Purrsuit mapping", () => {
    const { run, track } = tracker();

    run.start({ mode: "CATNIP_CHAOS", level: "03" });
    run.stop({ mode: "CATNIP_CHAOS", level: "03" }, { score: 2, outcome: "died" });

    expect(track.mock.calls[1][0]).toMatchObject({
      name: "game_fail",
      properties: { mode: "CATNIP_CHAOS", outcome: "fail", catnip: 2 },
    });
  });

  it("counts game_loaded once per pick", () => {
    const { run, track, advance } = tracker();

    run.loaded({ mode: "HOME", level: null });
    run.select();
    advance(1_500);
    run.loaded({ mode: "HOME", level: null });
    run.loaded({ mode: "HOME", level: null });

    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0]).toMatchObject({
      name: "game_loaded",
      properties: { load_ms: 1_500 },
    });
  });

  it("sends game_quit only when leaving mid-run", () => {
    const { run, track, advance } = tracker();

    run.leave({ mode: "CATNIP_CHAOS", level: "02" });
    expect(track).not.toHaveBeenCalled();

    run.start({ mode: "CATNIP_CHAOS", level: "02" });
    advance(4_000);
    run.leave({ mode: "CATNIP_CHAOS", level: "02" });
    run.leave({ mode: "CATNIP_CHAOS", level: "02" });

    expect(track.mock.calls.map(([event]) => event.name)).toEqual([
      "game_start",
      "game_quit",
    ]);
    expect(track.mock.calls[1][0].properties.duration_s).toBe(4);
  });

  it("does not send game_quit after the run already stopped", () => {
    const { run, track } = tracker();

    run.start({ mode: "PIXEL_RESCUE", level: "1" });
    run.stop({ mode: "PIXEL_RESCUE", level: "1" }, { completedLevel: null });
    run.leave({ mode: "PIXEL_RESCUE", level: "1" });

    expect(track.mock.calls.map(([event]) => event.name)).toEqual([
      "game_start",
      "game_fail",
    ]);
  });
});

describe("getPlatform", () => {
  it("returns the native platform in app builds", () => {
    mockGetPlatform.mockReturnValue("ios");
    expect(getPlatform()).toBe("ios");
    mockGetPlatform.mockReturnValue("android");
    expect(getPlatform()).toBe("android");
  });

  it("falls back to web", () => {
    mockGetPlatform.mockReturnValue("electron");
    expect(getPlatform()).toBe("web");
    mockGetPlatform.mockImplementation(() => {
      throw new Error("no bridge");
    });
    expect(getPlatform()).toBe("web");
  });
});
