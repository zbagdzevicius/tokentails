/**
 * @jest-environment jsdom
 */
/**
 * gaps.md P3 growth-web: the consent bar never sits over a match (F1), invite links (`?ref=`), the creator code field
 * and the first-purchase gift in the web store sheet, and the growth API ops of the game's allowlist.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: window.location.pathname, events: { on: jest.fn(), off: jest.fn() } }),
}));
jest.mock("@/analytics", () => ({ analytics: { init: jest.fn() }, reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));

import { CONSENT_STORAGE_KEY } from "@/analytics/gtm";
import { PawlegendsConsent } from "@/components/pawlegends/PawlegendsConsent";
import {
  frameMatchProbe,
  isInMatch,
  noteGameEvent,
  registerMatchProbe,
  resetMatchPresence,
  setInMatch,
} from "@/components/pawlegends/matchPresence";
import { captureRef, PAWLEGENDS_REF_KEY, readPendingRef, redeemNote, refOf } from "@/components/pawlegends/invite";
import { creatorCodeOf, growthCheckoutOf, type PawlegendsApi } from "@/components/pawlegends/checkout";
import { giftChoices, PawlegendsStoreSheet, skuHasCoat } from "@/components/pawlegends/PawlegendsStoreSheet";
import { PAWLEGENDS_API_OPS, routeOf } from "@/components/pawlegends/apiBridge";
import routes from "@/components/pawlegends/routes.json";

const fakeGtm = () => ({
  enabled: true,
  consentMode: true,
  setConsent: jest.fn((c: string) => window.localStorage.setItem(CONSENT_STORAGE_KEY, c)),
});

afterEach(() => {
  resetMatchPresence();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("the consent bar waits while a match runs (gaps.md F1)", () => {
  it("hides on the bridge's match_start and comes back on match_end, the results and Home", () => {
    window.history.replaceState(null, "", "/play");
    render(<PawlegendsConsent gtm={fakeGtm()} asks={() => true} />);
    expect(screen.getByTestId("pawlegends-consent")).toBeTruthy();
    act(() => noteGameEvent("match_start"));
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
    // an unrelated event changes nothing
    act(() => noteGameEvent("talent_pick"));
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
    act(() => noteGameEvent("match_end"));
    expect(screen.getByTestId("pawlegends-consent")).toBeTruthy();
    act(() => noteGameEvent("mp_match_start"));
    expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
    act(() => noteGameEvent("title_view"));
    expect(screen.getByTestId("pawlegends-consent")).toBeTruthy();
  });

  it("the frame's own data-match flag hides it too (a game with its stats off relays no events)", () => {
    jest.useFakeTimers();
    try {
      window.history.replaceState(null, "", "/play");
      let live = false;
      act(() => registerMatchProbe(() => live));
      render(<PawlegendsConsent gtm={fakeGtm()} asks={() => true} />);
      expect(screen.getByTestId("pawlegends-consent")).toBeTruthy();
      live = true;
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(screen.queryByTestId("pawlegends-consent")).toBeNull();
      live = false;
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(screen.getByTestId("pawlegends-consent")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("a probe that throws reads as no match; a cross-origin frame too", () => {
    registerMatchProbe(() => {
      throw new Error("x");
    });
    expect(isInMatch()).toBe(false);
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    frame.contentDocument!.documentElement.dataset.match = "live";
    expect(frameMatchProbe(() => frame)()).toBe(true);
    frame.contentDocument!.documentElement.dataset.match = "ended";
    expect(frameMatchProbe(() => frame)()).toBe(false);
    expect(frameMatchProbe(() => null)()).toBe(false);
    setInMatch(true);
    expect(isInMatch()).toBe(true);
    frame.remove();
  });

  it("on a phone it is a one-line strip at the top, never a card over the bottom bar", () => {
    const mm = jest.fn().mockImplementation((q: string) => ({
      matches: true,
      media: q,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    Object.defineProperty(window, "matchMedia", { configurable: true, value: mm });
    try {
      window.history.replaceState(null, "", "/play");
      render(<PawlegendsConsent gtm={fakeGtm()} asks={() => true} />);
      const bar = screen.getByTestId("pawlegends-consent");
      expect(bar.getAttribute("data-compact")).toBe("1");
      expect(bar.style.top).toContain("max(");
      expect(bar.style.bottom).toBe("");
      expect(screen.getByRole("link", { name: "privacy page" })).toBeTruthy();
      expect(screen.getByTestId("pawlegends-consent-allow")).toBeTruthy();
      expect(screen.getByTestId("pawlegends-consent-deny")).toBeTruthy();
    } finally {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });
});

describe("invite links", () => {
  it("?ref= goes on to the game, is kept on the device and leaves the address bar", () => {
    expect(routes.playQueryKeys).toContain("ref");
    expect(refOf("?ref=k7qx-2mp")).toBe("K7QX2MP");
    expect(refOf("?ref=K7QX2M0")).toBeNull();
    const next = captureRef("https://pawlegends.app/play?ref=K7QX2MP&from=x#a", window.localStorage, 1000);
    expect(next).toBe("/play?from=x#a");
    expect(readPendingRef(window.localStorage, 2000)).toBe("K7QX2MP");
    // nothing to do without a ref
    expect(captureRef("https://pawlegends.app/play", window.localStorage)).toBeNull();
    // an old code is dropped
    expect(readPendingRef(window.localStorage, 1000 + 31 * 86_400_000)).toBeNull();
    expect(window.localStorage.getItem(PAWLEGENDS_REF_KEY)).toBeNull();
  });

  it("a final refusal drops the kept code; a guest or a network error keeps it", () => {
    expect(redeemNote({ ok: true, status: 200, code: null })).toEqual({ text: expect.stringMatching(/both get a coat/), done: true });
    expect(redeemNote({ ok: false, status: 409, code: "PAWLEGENDS_INVITE_USED" }).done).toBe(true);
    expect(redeemNote({ ok: false, status: 400, code: "PAWLEGENDS_INVITE_SELF" })).toEqual({ text: null, done: true });
    expect(redeemNote({ ok: false, status: 403, code: "PAWLEGENDS_NEED_ACCOUNT" }).done).toBe(false);
    expect(redeemNote({ ok: false, status: 0, code: null }).done).toBe(false);
  });

  it("the game's growth ops map to their routes, registered accounts only", () => {
    // other packages append their own op blocks after this one (CLUBS-KUDOS.md), so only membership is checked
    for (const op of ["growth.invite", "growth.redeem", "growth.claim"] as const) expect(PAWLEGENDS_API_OPS).toContain(op);
    expect(routeOf("growth.invite", {})).toEqual({ method: "GET", path: "/pawlegends/growth/invite", auth: "registered" });
    expect(routeOf("growth.redeem", { code: "K7QX2MP" })).toEqual({
      method: "POST",
      path: "/pawlegends/growth/invite/redeem",
      body: { code: "K7QX2MP" },
      auth: "registered",
    });
    expect(routeOf("growth.redeem", { code: "../x" })).toBeNull();
    expect(routeOf("growth.claim", {})).toMatchObject({ method: "POST", path: "/pawlegends/growth/invite/claim", auth: "registered" });
  });
});

describe("the web store sheet: creator code and first-purchase gift", () => {
  const offer = {
    gift: {
      eligible: true,
      coats: [
        { id: "coat.clem.store_calico", owned: false },
        { id: "coat.pixel.store_leopard", owned: true },
        { id: "coat.duchess.store_blue_point", owned: false },
        { id: "coat.brutus.store_brindle", owned: false },
        { id: "coat.rocket.store_tiger", owned: false },
      ],
    },
    creator: null,
  };

  it("cleans the offer", () => {
    expect(growthCheckoutOf({ gift: { eligible: true, coats: [{ id: "<x>" }] } })).toEqual({ gift: { eligible: false, coats: [] }, creator: null });
    expect(growthCheckoutOf(offer).gift.coats).toHaveLength(5);
    expect(growthCheckoutOf({ ...offer, creator: { code: "PIXELQUEEN", name: "<b>", until: "" } }).creator).toBeNull();
    expect(creatorCodeOf("pixel-queen")).toBe("PIXELQUEEN");
    expect(creatorCodeOf("<x>")).toBeNull();
    expect(skuHasCoat("pl_coat_clem_calico", "coat.clem.store_calico")).toBe(true);
    expect(skuHasCoat("pl_set_cats_s1", "coat.pixel.store_leopard")).toBe(true);
    expect(skuHasCoat("pl_set_dogs_s1", "coat.pixel.store_leopard")).toBe(false);
    expect(giftChoices(growthCheckoutOf(offer), "pl_coat_clem_calico").map((c) => c.blocked)).toEqual([true, true, false, false, false]);
  });

  function setup(growth: unknown, creator = jest.fn(async () => ({ ok: true, status: 200, code: null, message: null, body: { code: "PIXELQUEEN", name: "Pixel Queen" } }))) {
    const storeCheckout = jest.fn(async () => ({ ok: true, status: 200, code: null, message: null, body: { url: "https://checkout.stripe.com/c/pay/cs_test" } }));
    const growthCheckout = jest.fn(async () => ({ ok: true, status: 200, code: null, message: null, body: growthCheckoutOf(growth) }));
    const api = { storeCheckout, growthCheckout, creator } as unknown as PawlegendsApi;
    const go = jest.fn();
    render(<PawlegendsStoreSheet api={api} sku="pl_coat_clem_calico" label="Clem: Calico coat" cents={{ usd: 299, eur: 299 }} initialEmail="kit@example.com" go={go} onClose={jest.fn()} />);
    return { storeCheckout, creator, go };
  }

  it("before the first order: 5 coats, the owned one and the one in this order disabled, the pick is sent", async () => {
    const t = setup(offer);
    await act(async () => undefined);
    const coats = screen.getAllByTestId("pawlegends-store-gift-coat");
    expect(coats).toHaveLength(5);
    expect(coats.map((c) => (c as HTMLButtonElement).disabled)).toEqual([true, true, false, false, false]);
    // the first coat that can be picked is picked; no radio inputs (the sheet asks no age)
    expect(coats[2].getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('input[type="radio"]')).toBeNull();
    fireEvent.click(coats[3]);
    expect(coats[3].getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("pawlegends-store-gift").textContent).toMatch(/no chance involved/i);
    await act(async () => {
      fireEvent.click(screen.getByTestId("pawlegends-store-buy"));
    });
    expect((t.storeCheckout.mock.calls[0] as unknown[])[0]).toMatchObject({ giftCoat: "coat.brutus.store_brindle", consent: true });
    expect((t.storeCheckout.mock.calls[0] as unknown[])[0]).not.toHaveProperty("creatorCode");
    expect(t.go).toHaveBeenCalled();
  });

  it("no gift after the first order; a typed creator code is checked and sent", async () => {
    const t = setup({ gift: { eligible: false, coats: [] }, creator: null });
    await act(async () => undefined);
    expect(screen.queryByTestId("pawlegends-store-gift")).toBeNull();
    fireEvent.click(screen.getByTestId("pawlegends-store-creator-open"));
    const input = screen.getByTestId("pawlegends-store-creator");
    fireEvent.change(input, { target: { value: "pixel-queen" } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(t.creator).toHaveBeenCalledWith("PIXELQUEEN");
    expect(screen.getByTestId("pawlegends-store-creator-line").textContent).toBe("Supporting Pixel Queen");
    await act(async () => {
      fireEvent.click(screen.getByTestId("pawlegends-store-buy"));
    });
    const req = (t.storeCheckout.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(req.creatorCode).toBe("PIXELQUEEN");
    expect(req).not.toHaveProperty("giftCoat");
  });

  it("a live creator link is shown; an unknown typed code is refused before checkout", async () => {
    const t = setup({ gift: { eligible: false, coats: [] }, creator: { code: "PIXELQUEEN", name: "Pixel Queen", until: "2026-12-13" } });
    await act(async () => undefined);
    expect(screen.getByTestId("pawlegends-store-creator-linked").textContent).toMatch(/Supporting Pixel Queen/);
    fireEvent.click(screen.getByText("Change"));
    fireEvent.change(screen.getByTestId("pawlegends-store-creator"), { target: { value: "<nope>" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("pawlegends-store-buy"));
    });
    expect(t.storeCheckout).not.toHaveBeenCalled();
    expect(screen.getByTestId("pawlegends-store-creator-line").textContent).toBe("That is not a creator code.");
  });
});
