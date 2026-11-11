/**
 * @jest-environment jsdom
 */
/**
 * The Paw Legends GTM container (GTM-K6RTRKSR): where it loads (Paw Legends pages, never Token Tails pages or app
 * builds), its Consent Mode v2 bar, the noscript iframe, and the events it forwards to the dataLayer.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: window.location.pathname, events: { on: jest.fn(), off: jest.fn() } }),
}));
jest.mock("@/analytics", () => ({ analytics: { init: jest.fn() } }));

import { CONSENT_STORAGE_KEY } from "@/analytics/gtm";
import { forwardPawlegendsEvent, pawlegendsDataLayerEntry } from "@/analytics/pawlegends-datalayer";
import { asksForConsent, ConsentChoiceButton, openConsentChoice, PawlegendsConsent } from "@/components/pawlegends/PawlegendsConsent";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pawlegendsNoscriptFor } = require("@/pages/_document");

const setPath = (path: string) => window.history.replaceState(null, "", path);
const gtmScripts = () =>
  Array.from(document.head.querySelectorAll("script[data-tt-gtm]")).map((s) => (s as HTMLScriptElement).src);

afterEach(() => {
  document.head.querySelectorAll("script[data-tt-gtm]").forEach((s) => s.remove());
  delete (window as Window & { dataLayer?: unknown[] }).dataLayer;
  window.localStorage.clear();
  setPath("/");
});

/** Starts a fresh `@/analytics/gtm` on `path` (its container choice is per page load), as GoogleTagManager does. */
function startGtmOn(path: string, env: Record<string, string> = {}) {
  setPath(path);
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { gtm } = require("@/analytics/gtm");
      gtm.start();
      gtm.push({ event: "page_view", page_path: path });
    });
  } finally {
    process.env = saved;
  }
}

/** The browser's time zone, which decides whether the consent bar asks (and gtm.js waits for Allow). */
let timeZone = "America/New_York";
const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
beforeEach(() => {
  timeZone = "America/New_York";
  jest.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone };
  });
});
afterEach(() => jest.restoreAllMocks());

describe("where the Paw Legends container loads", () => {
  it.each(["/pawlegends", "/pawlegends/play", "/pawlegends/privacy", "/pawlegends/terms", "/legends"])("on %s", (path) => {
    startGtmOn(path, { NEXT_PUBLIC_GTM_ID: "GTM-TOKENTAILS" });
    expect(gtmScripts()).toEqual(["https://www.googletagmanager.com/gtm.js?id=GTM-K6RTRKSR"]);
  });

  it("not on Token Tails pages: they keep their own container", () => {
    startGtmOn("/game", { NEXT_PUBLIC_GTM_ID: "GTM-TOKENTAILS" });
    expect(gtmScripts()).toEqual(["https://www.googletagmanager.com/gtm.js?id=GTM-TOKENTAILS"]);
    const layer = (window as Window & { dataLayer?: unknown[] }).dataLayer!;
    expect(layer.some((e) => Object.prototype.toString.call(e) === "[object Arguments]")).toBe(false);
  });

  it("never in an app build", () => {
    startGtmOn("/pawlegends/play", { NEXT_PUBLIC_IS_APP: "1" });
    expect(gtmScripts()).toEqual([]);
    expect((window as Window & { dataLayer?: unknown[] }).dataLayer).toBeUndefined();
  });

  it("puts the consent defaults ahead of gtm.js in the dataLayer", () => {
    startGtmOn("/pawlegends/play");
    const layer = (window as Window & { dataLayer?: unknown[] }).dataLayer!;
    const first = Array.from(layer[0] as ArrayLike<unknown>);
    expect(first.slice(0, 2)).toEqual(["consent", "default"]);
    expect(first[2]).toMatchObject({ analytics_storage: "denied", region: expect.arrayContaining(["LT", "DE", "GB"]) });
    expect(layer.findIndex((e) => (e as { event?: string }).event === "gtm.js")).toBe(2);
    expect(layer[3]).toEqual({ event: "page_view", page_path: "/pawlegends/play" });
  });

  it("in a European time zone gtm.js waits for Allow: no script and no dataLayer before it", () => {
    timeZone = "Europe/Vilnius";
    startGtmOn("/pawlegends/play");
    expect(gtmScripts()).toEqual([]);
    expect((window as Window & { dataLayer?: unknown[] }).dataLayer).toBeUndefined();
    // a visitor who allowed on an earlier visit loads at once, with the update
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    startGtmOn("/pawlegends/play");
    expect(gtmScripts()).toEqual(["https://www.googletagmanager.com/gtm.js?id=GTM-K6RTRKSR"]);
  });

  it("applies a choice stored on an earlier visit", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    startGtmOn("/pawlegends/play");
    const layer = (window as Window & { dataLayer?: unknown[] }).dataLayer!;
    expect(Array.from(layer[2] as ArrayLike<unknown>).slice(0, 3)).toEqual([
      "consent",
      "update",
      expect.objectContaining({ analytics_storage: "granted" }),
    ]);
  });
});

describe("the noscript iframe (_document)", () => {
  it("is on the Paw Legends pages only, never in an app build", () => {
    const ns = "https://www.googletagmanager.com/ns.html?id=GTM-K6RTRKSR";
    for (const path of ["/pawlegends", "/pawlegends/play", "/pawlegends/privacy", "/legends"]) expect(pawlegendsNoscriptFor(path, false)).toBe(ns);
    for (const path of ["/", "/game", "/impact", "/heist"]) expect(pawlegendsNoscriptFor(path, false)).toBeNull();
    expect(pawlegendsNoscriptFor("/pawlegends", true)).toBeNull();
  });
});

describe("the consent bar", () => {
  const fakeGtm = (over: Partial<{ enabled: boolean; consentMode: boolean }> = {}) => ({
    enabled: true,
    consentMode: true,
    setConsent: jest.fn((c: string) => window.localStorage.setItem(CONSENT_STORAGE_KEY, c)),
    ...over,
  });
  const yes = () => true;

  it("asks on a Paw Legends page and keeps the choice", () => {
    setPath("/pawlegends/privacy");
    const gtm = fakeGtm();
    const view = render(<PawlegendsConsent gtm={gtm} asks={yes} />);
    expect(screen.getByTestId("pawlegends-consent")).toBeTruthy();
    expect(screen.getByRole("link", { name: "privacy page" }).getAttribute("href")).toBe("/pawlegends/privacy#web-analytics");
    fireEvent.click(screen.getByTestId("pawlegends-consent-allow"));
    expect(gtm.setConsent).toHaveBeenCalledWith("granted");
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
    view.unmount();
    // a stored choice: not asked again
    render(<PawlegendsConsent gtm={gtm} asks={yes} />);
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
  });

  it("No thanks sends denied", () => {
    setPath("/pawlegends/play");
    const gtm = fakeGtm();
    render(<PawlegendsConsent gtm={gtm} asks={yes} />);
    fireEvent.click(screen.getByTestId("pawlegends-consent-deny"));
    expect(gtm.setConsent).toHaveBeenCalledWith("denied");
  });

  it("is not shown on Token Tails pages, in app builds, or outside Europe", () => {
    setPath("/game");
    const a = render(<PawlegendsConsent gtm={fakeGtm({ consentMode: false })} asks={yes} />);
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
    a.unmount();
    setPath("/pawlegends/play");
    const b = render(<PawlegendsConsent gtm={fakeGtm({ enabled: false })} asks={yes} />);
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
    b.unmount();
    render(<PawlegendsConsent gtm={fakeGtm()} asks={() => false} />);
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
  });

  it("waits for the landing's intro on /pawlegends", () => {
    jest.useFakeTimers();
    try {
      setPath("/pawlegends");
      render(<PawlegendsConsent gtm={fakeGtm()} asks={yes} />);
      expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
      act(() => {
        window.dispatchEvent(new Event("pointerdown"));
        jest.advanceTimersByTime(1100);
      });
      expect(screen.getByTestId("pawlegends-consent")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("the privacy page's button shows it again after a choice", () => {
    setPath("/pawlegends/privacy");
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "denied");
    const gtm = fakeGtm();
    render(
      <>
        <PawlegendsConsent gtm={gtm} asks={yes} />
        <ConsentChoiceButton gtm={gtm} />
      </>
    );
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
    fireEvent.click(screen.getByTestId("pawlegends-consent-change"));
    expect(screen.getByTestId("pawlegends-consent")).toBeTruthy();
    act(() => {
      openConsentChoice();
    });
  });

  it("the privacy page's button is hidden where the container does not run", () => {
    render(<ConsentChoiceButton gtm={fakeGtm({ enabled: false })} />);
    expect(screen.queryByTestId("pawlegends-consent-change")).toBeNull();
  });

  it("asks in European time zones and when the zone is unknown", () => {
    for (const tz of ["Europe/Vilnius", "Europe/London", "Europe/Zurich", "Atlantic/Canary", "Atlantic/Reykjavik"])
      expect(asksForConsent(tz)).toBe(true);
    // the browser's own zone when none is passed; an unknown one asks
    timeZone = "";
    expect(asksForConsent()).toBe(true);
    timeZone = "Europe/Paris";
    expect(asksForConsent()).toBe(true);
    for (const tz of ["America/New_York", "Asia/Singapore", "Australia/Sydney"]) expect(asksForConsent(tz)).toBe(false);
  });
});

describe("Paw Legends events in the dataLayer", () => {
  it("keeps host event names and prefixes the game's", () => {
    expect(pawlegendsDataLayerEntry({ name: "pawlegends_open", properties: { from: "landing", landing_variant: "A" } })).toEqual({
      event: "pawlegends_open",
      from: "landing",
      landing_variant: "A",
    });
    expect(pawlegendsDataLayerEntry({ name: "match_start", properties: { hero: "tank", difficulty: 2 } })).toEqual({
      event: "pawlegends_match_start",
      hero: "tank",
      difficulty: 2,
    });
    expect(pawlegendsDataLayerEntry({ name: "match_end", properties: { win: true, minutes: 7 } })).toEqual({
      event: "pawlegends_match_end",
      win: true,
      minutes: 7,
    });
  });

  it("drops personal or odd properties", () => {
    expect(
      pawlegendsDataLayerEntry({
        name: "checkout_start",
        properties: {
          sku: "pass",
          email: "a@b.c",
          user_id: "u1",
          uid: "u1",
          name: "Ann",
          token: "t",
          event: "override",
          nested: { a: 1 },
          long: "x".repeat(65),
          nan: Number.NaN,
          nil: null,
        },
      })
    ).toEqual({ event: "pawlegends_checkout_start", sku: "pass" });
    expect(pawlegendsDataLayerEntry({ name: "Bad Name" })).toBeNull();
  });

  it("forwards through the given push and never throws", () => {
    const push = jest.fn();
    forwardPawlegendsEvent({ name: "pawlegends_cat_purchase", properties: { ok: true } }, push);
    expect(push).toHaveBeenCalledWith({ event: "pawlegends_cat_purchase", ok: true });
    expect(() =>
      forwardPawlegendsEvent({ name: "x" }, () => {
        throw new Error("boom");
      })
    ).not.toThrow();
  });
});
