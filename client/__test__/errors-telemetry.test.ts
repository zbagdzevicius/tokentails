/**
 * @jest-environment jsdom
 *
 * F9 crash telemetry: the scrubber, the per-session and per-code caps,
 * consent gating, and that nothing goes through posthog.captureException.
 */
import { createAnalytics, type AnalyticsClient } from "@/analytics/client";
import type { ConsentState } from "@/analytics/consent";
import {
  APP_ERROR_MAX_PER_SESSION,
  APP_ERROR_SESSION_KEY,
  buildAppErrorProperties,
  createErrorReporter,
  normaliseCode,
  pageOrigin,
  setErrorRoute,
} from "@/analytics/errors";
import type { AnalyticsEvent } from "@/analytics/events";
import {
  scrubContext,
  scrubRoute,
  scrubStack,
  scrubText,
} from "@/analytics/scrub";

// Synthetic values in the right shapes. None of them is a real credential.
const FAKE_JWT =
  "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.c2lnbmF0dXJlLXZhbHVl";
const FAKE_SEED = `S${"A".repeat(55)}`;
const FAKE_G = `G${"B".repeat(55)}`;
const FAKE_C = `C${"D".repeat(55)}`;
const FAKE_MUXED = `M${"E".repeat(68)}`;
const FAKE_EVM = `0x${"ab12".repeat(10)}`;
const FAKE_TX = `0x${"f".repeat(64)}`;
const FAKE_OBJECT_ID = "5f1d7c2e9b3a4c0012345678";

describe("scrubText", () => {
  const vectors: Array<[string, string, string]> = [
    ["email", "Login failed for jane.doe+cats@example.co.uk", "Login failed for [email]"],
    ["JWT", `Bad token ${FAKE_JWT}`, "Bad token [jwt]"],
    ["Firebase fb token", `accesstoken fb${FAKE_JWT} rejected`, "accesstoken fb[jwt] rejected"],
    ["Stellar secret seed", `seed ${FAKE_SEED} leaked`, "seed [stellar-secret] leaked"],
    ["Stellar G address", `pay ${FAKE_G}`, "pay [stellar-address]"],
    ["Stellar contract", `call ${FAKE_C}`, "call [stellar-address]"],
    ["Stellar muxed", `to ${FAKE_MUXED}`, "to [stellar-address]"],
    ["0x address", `wallet ${FAKE_EVM} not found`, "wallet [hex] not found"],
    ["0x tx hash", `tx ${FAKE_TX}`, "tx [hex]"],
    ["ObjectId", `cat ${FAKE_OBJECT_ID} missing`, "cat [id] missing"],
    [
      "query string",
      "GET https://api.tokentails.com/user?email=a%40b.c&token=abc failed",
      "GET https://api.tokentails.com/user?[query] failed",
    ],
    [
      "fragment",
      "at https://tokentails.com/game#access_token=abc",
      "at https://tokentails.com/game#[fragment]",
    ],
    ["national id", "code 39001010000 invalid", "code [number] invalid"],
    ["phone", "call +372 5555 1234 now", "call [number] now"],
    ["quoted name", `Cat 'Mister Whiskers' already exists`, "Cat '[name]' already exists"],
    ["double-quoted name", `Hello "Jane"`, `Hello "[name]"`],
    ["lowercase quoted name", `Cat name "fluffy" is taken`, `Cat name "[name]" is taken`],
    ["snake_case username", `'mittens_2' rejected`, `'[name]' rejected`],
    ["Firebase UID", "uid kX9pQ2rT7vW1yZ3aB5cD8eF0gH12 denied", "uid [token] denied"],
    [
      "opaque bearer token",
      "Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      "Bearer [token]",
    ],
    ["Privy did", "user did:privy:cm3x9abc0001 missing", "user [did] missing"],
    ["IBAN", "pay EE382200221020145685 now", "pay [iban] now"],
    ["spaced IBAN", "pay EE38 2200 2210 2014 5685 now", "pay [iban] now"],
  ];

  it.each(vectors)("removes %s", (_label, input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it("keeps quoted identifiers that explain the crash", () => {
    expect(
      scrubText("Cannot read properties of undefined (reading 'sort')"),
    ).toBe("Cannot read properties of undefined (reading 'sort')");
    expect(scrubText(`key "token-tails" missing`)).toBe(`key "token-tails" missing`);
    expect(scrubText("event 'GAME_LOADED'")).toBe("event 'GAME_LOADED'");
    expect(scrubText("Failed to execute 'appendChild' on 'Node'")).toBe(
      "Failed to execute 'appendChild' on '[name]'",
    );
    expect(scrubText("texture 'cat-idle' missing")).toBe("texture 'cat-idle' missing");
  });

  it("after our own code words, keeps only code-shaped strings", () => {
    expect(scrubText("key 'fluffy' missing")).toBe("key '[name]' missing");
    expect(scrubText("texture 'fluffy'")).toBe("texture '[name]'");
    expect(scrubText("event 'fluffy'")).toBe("event '[name]'");
    expect(scrubText("scene 'zygimantas'")).toBe("scene '[name]'");
    expect(scrubText("texture 'catIdle' missing")).toBe("texture 'catIdle' missing");
    expect(scrubText("atlas 'ui.close'")).toBe("atlas 'ui.close'");
    expect(scrubText("animation 'walk2'")).toBe("animation 'walk2'");
  });

  it("removes hyphenated personal codes and space-grouped phone numbers", () => {
    expect(scrubText("code 3800108-5718 rejected")).toBe("code [number] rejected");
    expect(scrubText("call 5512 3456 now")).toBe("call [number] now");
    expect(scrubText("call 612 34567 now")).toBe("call [number] now");
    expect(scrubText("call 5512 3456 78 now")).toBe("call [number] now");
    // Stack positions, versions and dates stay.
    expect(scrubText("at a.js:1200:30 v4.0.0 on 2026-10-01")).toBe(
      "at a.js:1200:30 v4.0.0 on 2026-10-01",
    );
  });

  it("keeps a quoted name out even after a code word when it has spaces", () => {
    expect(scrubText("reading 'Mr Fluffy'")).toBe("reading '[name]'");
  });

  it("keeps bundle file names and stack line:column", () => {
    expect(
      scrubText("at /_next/static/chunks/pages/_app-3f2a9c1b4e5d6f7aB1c2.js:3:9"),
    ).toBe("at /_next/static/chunks/pages/_app-3f2a9c1b4e5d6f7aB1c2.js:3:9");
    expect(scrubText("at run (/game.js?v=12:10:5)")).toBe("at run (/game.js?[query]:10:5)");
    expect(scrubText("at /game.js?v=12")).toBe("at /game.js?[query]");
  });

  it("leaves a plain question mark alone", () => {
    expect(scrubText("Is the scene ready?")).toBe("Is the scene ready?");
  });

  it("truncates and handles non-strings", () => {
    expect(scrubText("x".repeat(500)).length).toBe(300);
    expect(scrubText(undefined)).toBe("");
    expect(scrubText(42)).toBe("");
  });
});

describe("scrubStack, scrubRoute, scrubContext", () => {
  it("drops the origin, the query and extra frames", () => {
    const frames = Array.from(
      { length: 20 },
      (_, i) => `    at f${i} (https://tokentails.com/_next/static/chunks/app.js?v=${i}:1:${i})`,
    );
    const stack = scrubStack(
      [`TypeError: boom for ${FAKE_G}`, ...frames].join("\n"),
      "https://tokentails.com",
    )!;
    expect(stack).not.toContain("https://tokentails.com");
    expect(stack).not.toContain("v=");
    expect(stack).not.toContain(FAKE_G);
    expect(stack.split("\n")).toHaveLength(9);
    expect(scrubStack(undefined)).toBeNull();
  });

  it("routes lose query, fragment and ids", () => {
    expect(scrubRoute(`/cats/${FAKE_OBJECT_ID}?ref=me#x`)).toBe("/cats/[id]");
    expect(scrubRoute(undefined)).toBe("");
  });

  it("reports carry the route pattern set by _app, never the real path", () => {
    window.history.replaceState(null, "", "/cats/mister-whiskers");
    const track = jest.fn<void, [AnalyticsEvent]>();
    const reporter = createErrorReporter({ track, getConsent: () => "granted" });
    setErrorRoute("");
    window.sessionStorage.clear();
    reporter.report("route_a", new Error("a"));
    expect((track.mock.calls[0][0].properties as { route: string }).route).toBe("");
    setErrorRoute("/cats/[cat]");
    reporter.report("route_b", new Error("b"));
    expect((track.mock.calls[1][0].properties as { route: string }).route).toBe("/cats/[cat]");
    setErrorRoute("");
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("context keeps only flat, safe primitives", () => {
    const ctx = scrubContext({
      boundary: "MATCH_3",
      note: "user jane@example.com",
      count: 3,
      ok: true,
      nothing: null,
      nested: { email: "a@b.co" },
      list: [1, 2],
      fn: () => 1,
      "Bad Key": "x",
      inf: Infinity,
    });
    expect(ctx).toEqual({
      boundary: "MATCH_3",
      note: "user [email]",
      count: 3,
      ok: true,
      nothing: null,
      inf: null,
    });
  });
});

describe("buildAppErrorProperties", () => {
  it("builds the app_error shape from an Error", () => {
    const error = new TypeError(`Cannot find cat ${FAKE_OBJECT_ID} for jane@example.com`);
    const props = buildAppErrorProperties(
      "Scene_Crash:MATCH_3",
      error,
      { source: "boundary", level: "scene", boundary: "MATCH_3" },
      { route: "/game?x=1", origin: "http://localhost", sessionIndex: 2 },
    );
    expect(props).toMatchObject({
      code: "scene_crash:match_3",
      source: "boundary",
      level: "scene",
      error_name: "TypeError",
      message: "Cannot find cat [id] for [email]",
      route: "/game",
      session_index: 2,
      context: { boundary: "MATCH_3" },
    });
  });

  it("accepts strings and odd values", () => {
    expect(buildAppErrorProperties("x", "plain").message).toBe("plain");
    expect(buildAppErrorProperties("x", { message: "obj" }).message).toBe("obj");
    expect(buildAppErrorProperties("x", 7).error_name).toBe("number");
  });

  it("normalises codes", () => {
    expect(normaliseCode("Listener_Error:GAME_STOP")).toBe("listener_error:game_stop");
    expect(normaliseCode("has spaces")).toBe("unknown");
    expect(normaliseCode(undefined)).toBe("unknown");
  });
});

describe("createErrorReporter", () => {
  beforeEach(() => window.sessionStorage.clear());

  const make = (consent: ConsentState = "granted", enabled = true) => {
    const track = jest.fn<void, [AnalyticsEvent]>();
    let state = consent;
    const reporter = createErrorReporter({
      track,
      getConsent: () => state,
      isEnabled: () => enabled,
    });
    return {
      track,
      reporter,
      setConsent: (next: ConsentState) => {
        state = next;
      },
    };
  };

  it("sends a scrubbed app_error event", () => {
    const { track, reporter } = make();
    expect(reporter.report("scene_crash:home", new Error("boom"))).toBe(true);
    expect(track).toHaveBeenCalledTimes(1);
    const event = track.mock.calls[0][0];
    expect(event.name).toBe("app_error");
    expect(event.properties).toMatchObject({ code: "scene_crash:home", message: "boom" });
  });

  it("sends one report per code", () => {
    const { track, reporter } = make();
    expect(reporter.report("same", new Error("a"))).toBe(true);
    expect(reporter.report("same", new Error("b"))).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it(`caps a session at ${APP_ERROR_MAX_PER_SESSION} reports, across reloads`, () => {
    const { track, reporter } = make();
    for (let i = 0; i < 8; i++) reporter.report(`code_${i}`, new Error("x"));
    expect(track).toHaveBeenCalledTimes(APP_ERROR_MAX_PER_SESSION);
    expect(
      (track.mock.calls.at(-1)![0].properties as { session_index: number }).session_index,
    ).toBe(APP_ERROR_MAX_PER_SESSION);

    // A RELOAD builds a new reporter; sessionStorage keeps the budget.
    const again = make();
    expect(again.reporter.report("fresh_code", new Error("x"))).toBe(false);
    expect(again.track).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(APP_ERROR_SESSION_KEY)).toContain("code_0");
  });

  it("sends and counts nothing without consent", () => {
    const { track, reporter, setConsent } = make("unset");
    expect(reporter.report("a", new Error("x"))).toBe(false);
    setConsent("denied");
    expect(reporter.report("a", new Error("x"))).toBe(false);
    expect(track).not.toHaveBeenCalled();
    // The budget is intact after a later opt-in.
    setConsent("granted");
    expect(reporter.report("a", new Error("x"))).toBe(true);
  });

  it("does nothing when analytics has no key", () => {
    const { track, reporter } = make("granted", false);
    expect(reporter.report("a", new Error("x"))).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it("never throws, even if tracking does", () => {
    const reporter = createErrorReporter({
      track: () => {
        throw new Error("analytics down");
      },
      getConsent: () => "granted",
    });
    expect(() => reporter.report("a", new Error("x"))).not.toThrow();
  });

  it("works when sessionStorage is blocked", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { track, reporter } = make();
    expect(reporter.report("a", new Error("x"))).toBe(true);
    expect(reporter.report("a", new Error("x"))).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("app_error through the real analytics client", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("uses capture, never captureException", async () => {
    const client = {
      capture: jest.fn(),
      register: jest.fn(),
      opt_in_capturing: jest.fn(),
      opt_out_capturing: jest.fn(),
      has_opted_out_capturing: jest.fn(() => false),
      reset: jest.fn(),
      captureException: jest.fn(),
    };
    const analytics = createAnalytics({
      apiKey: "phc_test",
      load: async () => client as AnalyticsClient,
      superProperties: () => ({ app: "core", platform: "web", device_tier: "unknown" }),
      readConsent: () => "granted",
      writeConsent: jest.fn(),
    });
    const reporter = createErrorReporter({
      track: analytics.track,
      getConsent: analytics.getConsent,
      isEnabled: () => analytics.enabled,
    });
    reporter.report("root_crash:app", new Error(`seed ${FAKE_SEED}`));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.captureException).not.toHaveBeenCalled();
    expect(client.capture).toHaveBeenCalledWith(
      "app_error",
      expect.objectContaining({ code: "root_crash:app", message: "seed [stellar-secret]" }),
    );
  });
});

describe("pageOrigin", () => {
  it("uses scheme and host, so the Capacitor iOS scheme is not the opaque 'null'", () => {
    expect(pageOrigin({ protocol: "capacitor:", host: "localhost" })).toBe("capacitor://localhost");
    expect(pageOrigin({ protocol: "https:", host: "tokentails.com" })).toBe("https://tokentails.com");
    expect(pageOrigin({ protocol: "file:", host: "" })).toBeUndefined();
  });

  it("a Capacitor stack loses its origin but keeps the word null", () => {
    const e = new TypeError("Cannot read properties of null (reading 'x')");
    e.stack = "TypeError: Cannot read properties of null (reading 'x')\n    at f (capacitor://localhost/_next/static/chunks/main.js:1:2)";
    const props = buildAppErrorProperties("window_error", e, undefined, {
      origin: pageOrigin({ protocol: "capacitor:", host: "localhost" }),
    });
    expect(props.stack).toContain("of null (reading 'x')");
    expect(props.stack).not.toContain("capacitor://localhost");
  });
});
