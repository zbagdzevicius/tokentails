/**
 * Google Tag Manager (`analytics/gtm.ts`): Token Tails' container with no consent gate, and the Paw Legends container with
 * Consent Mode v2.
 */
import { createGtm, GTM_SCRIPT_URL } from "@/analytics/gtm";

type FakeWindow = Window & { dataLayer?: unknown[] };

function fakeWindow() {
  const appended: Array<{ src: string; async: boolean; dataset: Record<string, string> }> = [];
  const win = {
    document: {
      createElement: () => ({ src: "", async: false, dataset: {} as Record<string, string> }),
      head: { appendChild: (el: (typeof appended)[number]) => appended.push(el) },
    },
  } as unknown as FakeWindow;
  return { win, appended };
}

const isConsentCommand = (entry: unknown) =>
  !!entry && typeof entry === "object" && (entry as { [0]?: unknown })[0] === "consent";

describe("gtm", () => {
  it("loads gtm.js on start with no stored state and pushes no consent commands", () => {
    const { win, appended } = fakeWindow();
    const gtm = createGtm({ gtmId: "GTM-TEST", getWindow: () => win });

    gtm.start();

    expect(gtm.isLoaded()).toBe(true);
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe(`${GTM_SCRIPT_URL}?id=GTM-TEST`);
    expect(appended[0].async).toBe(true);
    expect(win.dataLayer).toEqual([expect.objectContaining({ event: "gtm.js" })]);
    expect(win.dataLayer!.some(isConsentCommand)).toBe(false);
  });

  it("pushes page_view and other events at once, loading only once", () => {
    const { win, appended } = fakeWindow();
    const gtm = createGtm({ gtmId: "GTM-TEST", getWindow: () => win });

    expect(gtm.push({ event: "page_view", page_path: "/" })).toBe(true);
    gtm.start();
    expect(gtm.push({ event: "begin_checkout", value: 16 })).toBe(true);

    expect(appended).toHaveLength(1);
    expect(win.dataLayer).toEqual([
      expect.objectContaining({ event: "gtm.js" }),
      { event: "page_view", page_path: "/" },
      { event: "begin_checkout", value: 16 },
    ]);
    expect(win.dataLayer!.some(isConsentCommand)).toBe(false);
  });

  it("is a no-op without a container id", () => {
    const { win, appended } = fakeWindow();
    const gtm = createGtm({ gtmId: "  ", getWindow: () => win });

    gtm.start();
    expect(gtm.enabled).toBe(false);
    expect(gtm.push({ event: "page_view" })).toBe(false);
    expect(appended).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("is SSR safe", () => {
    const gtm = createGtm({ gtmId: "GTM-TEST", getWindow: () => undefined });

    expect(() => gtm.start()()).not.toThrow();
    expect(gtm.push({ event: "page_view" })).toBe(false);
    expect(gtm.isLoaded()).toBe(false);
  });
});

describe("the Paw Legends container (Consent Mode v2)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CONSENT_REGIONS, consentState, createGtmRouter, PAWLEGENDS_GTM_ID } = require("@/analytics/gtm");
  const consentEntries = (win: FakeWindow) =>
    (win.dataLayer ?? []).filter(isConsentCommand).map((e) => Array.from(e as ArrayLike<unknown>));

  it("pushes the consent defaults (denied in the EEA, UK and CH; granted elsewhere) before gtm.js, as arguments objects", () => {
    const { win, appended } = fakeWindow();
    const gtm = createGtm({
      gtmId: PAWLEGENDS_GTM_ID,
      getWindow: () => win,
      consent: { regions: CONSENT_REGIONS, stored: () => null, store: () => {} },
    });
    gtm.push({ event: "page_view", page_path: "/pawlegends" });

    expect(appended[0].src).toBe(`${GTM_SCRIPT_URL}?id=GTM-K6RTRKSR`);
    const layer = win.dataLayer!;
    // GTM reads consent commands only from an `arguments` object
    expect(Object.prototype.toString.call(layer[0])).toBe("[object Arguments]");
    expect(consentEntries(win)).toEqual([
      ["consent", "default", { ...consentState("denied"), region: [...CONSENT_REGIONS], wait_for_update: 500 }],
      ["consent", "default", consentState("granted")],
    ]);
    expect(layer.findIndex((e) => (e as { event?: string }).event === "gtm.js")).toBe(2);
    expect(layer[3]).toEqual({ event: "page_view", page_path: "/pawlegends" });
    for (const region of ["LT", "DE", "FR", "IE", "NO", "IS", "LI", "GB", "CH"]) expect(CONSENT_REGIONS).toContain(region);
    expect(CONSENT_REGIONS).toHaveLength(32);
  });

  it("applies a stored choice right after the defaults, and a new choice as an update once loaded", () => {
    const { win } = fakeWindow();
    const store = jest.fn();
    const gtm = createGtm({
      gtmId: PAWLEGENDS_GTM_ID,
      getWindow: () => win,
      consent: { regions: CONSENT_REGIONS, stored: () => "denied", store },
    });
    gtm.start();
    expect(consentEntries(win).slice(2)).toEqual([["consent", "update", consentState("denied")]]);
    gtm.setConsent("granted");
    expect(store).toHaveBeenCalledWith("granted");
    expect(consentEntries(win).slice(3)).toEqual([["consent", "update", consentState("granted")]]);
  });

  it("a choice made before load is kept and goes in as the update, even when storage is blocked", () => {
    const { win } = fakeWindow();
    const gtm = createGtm({
      gtmId: PAWLEGENDS_GTM_ID,
      getWindow: () => win,
      consent: { regions: CONSENT_REGIONS, stored: () => null, store: () => {} },
    });
    gtm.setConsent("denied");
    expect(win.dataLayer).toBeUndefined();
    gtm.start();
    expect(consentEntries(win).slice(2)).toEqual([["consent", "update", consentState("denied")]]);
  });

  it("holds gtm.js for a visitor the bar asks: no script and no dataLayer entry until Allow, then sends what waited", () => {
    const { win, appended } = fakeWindow();
    const stored = null as "granted" | "denied" | null;
    const gtm = createGtm({
      gtmId: PAWLEGENDS_GTM_ID,
      getWindow: () => win,
      consent: {
        regions: CONSENT_REGIONS,
        stored: () => stored,
        // storage blocked: the choice is never kept, Allow must still load for this page
        store: () => {},
        hold: () => stored !== "granted",
      },
    });
    gtm.start();
    expect(gtm.push({ event: "page_view", page_path: "/pawlegends" })).toBe(true);
    expect(gtm.isLoaded()).toBe(false);
    expect(appended).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();

    gtm.setConsent("denied");
    gtm.push({ event: "pawlegends_play_click" });
    expect(appended).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();

    gtm.push({ event: "pawlegends_match_start" });
    gtm.setConsent("granted");
    expect(appended).toHaveLength(1);
    expect(consentEntries(win).slice(2)).toEqual([["consent", "update", consentState("granted")]]);
    const events = win.dataLayer!.map((e) => (e as { event?: string }).event).filter(Boolean);
    // pushes from before No thanks are dropped; the ones after it wait for Allow
    expect(events).toEqual(["gtm.js", "pawlegends_play_click", "pawlegends_match_start"]);
  });

  it("asks (and holds) in European or unknown time zones only", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { asksForConsent } = require("@/analytics/gtm");
    for (const tz of ["Europe/Vilnius", "Europe/London", "Atlantic/Reykjavik", "Atlantic/Canary"]) expect(asksForConsent(tz)).toBe(true);
    for (const tz of ["America/New_York", "Asia/Singapore", "UTC"]) expect(asksForConsent(tz)).toBe(false);
  });

  it("is a no-op where it is not allowed (app builds, native WebViews)", () => {
    const { win, appended } = fakeWindow();
    const gtm = createGtm({ gtmId: PAWLEGENDS_GTM_ID, getWindow: () => win, allowed: () => false });
    gtm.start();
    expect(gtm.enabled).toBe(false);
    expect(gtm.push({ event: "page_view" })).toBe(false);
    expect(appended).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("never runs in an app build (NEXT_PUBLIC_IS_APP)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pawlegendsWebOnly } = require("@/analytics/gtm");
    expect(pawlegendsWebOnly()).toBe(true);
    process.env.NEXT_PUBLIC_IS_APP = "1";
    try {
      expect(pawlegendsWebOnly()).toBe(false);
    } finally {
      delete process.env.NEXT_PUBLIC_IS_APP;
    }
  });

  it("the router keeps the container of the first page it runs on", () => {
    const { win } = fakeWindow();
    const a = createGtm({ gtmId: "GTM-A", getWindow: () => win });
    const b = createGtm({ gtmId: "GTM-B", getWindow: () => win });
    let first = true;
    const pick = jest.fn(() => (first ? ((first = false), a) : b));
    const router = createGtmRouter(pick, () => win);
    expect(router.id).toBe("GTM-A");
    router.push({ event: "x" });
    router.push({ event: "y" });
    expect(pick).toHaveBeenCalledTimes(1);
    expect(a.isLoaded()).toBe(true);
    expect(b.isLoaded()).toBe(false);
    const ssr = createGtmRouter(pick, () => undefined);
    expect(ssr.push({ event: "x" })).toBe(false);
    expect(ssr.enabled).toBe(false);
  });
});

describe("which pages are Paw Legends pages", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isPawlegendsLocation, pagePathOf } = require("@/analytics/pawlegends-site");
  it.each([
    ["tokentails.com", "/pawlegends", true],
    ["tokentails.com", "/pawlegends/play", true],
    ["tokentails.com", "/pawlegends/privacy", true],
    ["tokentails.com", "/legends", true],
    ["pawlegends.app", "/", true],
    ["www.pawlegends.app", "/play", true],
    ["pawlegends.app", "/game", true],
    ["tokentails.com", "/", false],
    ["tokentails.com", "/game", false],
    ["tokentails.com", "/pawlegendsx", false],
    ["tokentails.com", "/pawlegends-game/index.html", false],
    ["evil-pawlegends.app", "/", false],
  ])("%s%s -> %s", (hostname, pathname, expected) => {
    expect(isPawlegendsLocation({ hostname, pathname })).toBe(expected);
  });
  it("maps pawlegends.app's / to the /pawlegends landing", () => {
    expect(pagePathOf({ hostname: "pawlegends.app", pathname: "/" })).toBe("/pawlegends");
    expect(pagePathOf({ hostname: "pawlegends.app", pathname: "/play" })).toBe("/play");
    expect(pagePathOf({ hostname: "tokentails.com", pathname: "/" })).toBe("/");
  });
});
