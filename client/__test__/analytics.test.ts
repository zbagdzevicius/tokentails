/**
 * PostHog client (no consent gate) and GAME_* -> PostHog event mapping for client/analytics.
 */
import { createAnalytics, type AnalyticsClient } from "@/analytics/client";
import { createGameRunTracker } from "@/analytics/game-run";
import {
  ANALYTICS_EVENT_AREAS,
  ANALYTICS_EVENTS,
  buildEvent,
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

function setup({ apiKey = "phc_test", optedOut = false } = {}) {
  let opted = optedOut;
  const client: jest.Mocked<Required<AnalyticsClient>> = {
    capture: jest.fn(),
    register: jest.fn(),
    has_opted_out_capturing: jest.fn(() => opted),
    opt_in_capturing: jest.fn(() => {
      opted = false;
    }),
  };
  const load = jest.fn(async () => client);
  const analytics = createAnalytics({
    apiKey,
    load,
    superProperties: () => ({
      app: "core",
      platform: "web",
      device_tier: "unknown",
    }),
  });
  return { analytics, client, load };
}

const startEvent = buildGameStartEvent({
  mode: "MATCH_3",
  level: "1",
  platform: "web",
});

describe("analytics without a consent gate", () => {
  it("initialises and sends with no consent state, with EU host and super properties", async () => {
    const { analytics, client, load } = setup();

    analytics.track(startEvent);
    await flush();

    expect(analytics.enabled).toBe(true);
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

  it("init() loads the client before any event, once", async () => {
    const { analytics, load, client } = setup();

    analytics.init();
    analytics.init();
    await flush();
    analytics.track(startEvent);
    await flush();

    expect(load).toHaveBeenCalledTimes(1);
    expect(client.capture).toHaveBeenCalledTimes(1);
  });

  it("opts a player back in once when PostHog still holds an old opt-out", async () => {
    const { analytics, client } = setup({ optedOut: true });

    analytics.track(startEvent);
    analytics.track(startEvent);
    await flush();

    expect(client.opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(client.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: null });
    expect(client.capture).toHaveBeenCalledTimes(2);
  });

  it("still sends when browser storage throws", async () => {
    const globals = globalThis as { window?: unknown };
    const previous = globals.window;
    const throwing = {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
      get sessionStorage(): Storage {
        throw new Error("blocked");
      },
    };
    globals.window = throwing;
    try {
      const { analytics, client } = setup();
      analytics.track(startEvent);
      await flush();
      expect(client.capture).toHaveBeenCalledTimes(1);
    } finally {
      globals.window = previous;
    }
  });

  it("is a no-op without a PostHog key", async () => {
    const { analytics, client, load } = setup({ apiKey: "" });

    expect(analytics.enabled).toBe(false);
    analytics.init();
    analytics.track(startEvent);
    await flush();

    expect(load).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("retries the load after a failure", async () => {
    const client: AnalyticsClient = { capture: jest.fn(), register: jest.fn() };
    const load = jest
      .fn<Promise<AnalyticsClient>, [string, string]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(client);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const analytics = createAnalytics({
      apiKey: "phc_test",
      load,
      superProperties: () => ({ app: "core", platform: "web", device_tier: "unknown" }),
    });

    analytics.track(startEvent);
    await flush();
    analytics.track(startEvent);
    await flush();

    expect(load).toHaveBeenCalledTimes(2);
    expect(client.capture).toHaveBeenCalledTimes(1);
    warn.mockRestore();
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

describe("event catalog (F9)", () => {
  // The F9 table, row by row. Adding an event means adding it here too.
  const F9_TABLE: Record<string, string[]> = {
    entry: ["landing_cta", "game_loaded", "intro_lifted"],
    identity: [
      "guest_session_created",
      "auth_sheet_shown",
      "auth_linked",
      "auth_merged",
      "auth_error",
      "save_nudge_shown",
    ],
    onboarding: [
      "onboarding_shown",
      "onboarding_step_viewed",
      "starter_selected",
      "starter_named",
      "starter_committed",
      "onboarding_skipped",
      "featured_cat_followed",
      "cat_name_rejected",
      "cat_name_reported",
    ],
    runs: [
      "ftue_gate_shown",
      "game_start",
      "ftue_hint_shown",
      "ftue_hint_done",
      "life_lost",
      "game_fail",
      "game_finish",
      "ftue_first_clear",
      "ftue_abandon",
    ],
    heist: [
      "heist_open",
      "heist_run_complete",
      "heist_save",
      "heist_signin_prompt",
      "heist_guest_claim",
    ],
    impact: [
      "impact_tab_viewed",
      "paw_earned",
      "treat_sent",
      "pledge_made",
      "claim_opened",
      "impact_page_viewed",
    ],
    health: ["app_error", "game_font_fallback", "storefront_degraded"],
  };

  const names = Object.values(ANALYTICS_EVENTS) as string[];

  it.each(Object.entries(F9_TABLE))("has every %s event", (area, events) => {
    for (const name of events) {
      expect(names).toContain(name);
      expect(ANALYTICS_EVENT_AREAS[name as keyof typeof ANALYTICS_EVENT_AREAS]).toBe(area);
    }
  });

  it("has no names outside the table except game_quit, and no duplicates", () => {
    const table = new Set(Object.values(F9_TABLE).flat());
    expect(names.filter((n) => !table.has(n))).toEqual(["game_quit"]);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(ANALYTICS_EVENT_AREAS).sort()).toEqual([...names].sort());
  });

  it("names are snake_case", () => {
    for (const name of names) expect(name).toMatch(/^[a-z]+(_[a-z0-9]+)*$/);
  });

  it("buildEvent keeps the typed shape", () => {
    expect(buildEvent("heist_open", { from: "picker" })).toEqual({
      name: "heist_open",
      properties: { from: "picker" },
    });
  });
});
