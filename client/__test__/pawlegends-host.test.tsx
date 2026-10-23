/**
 * @jest-environment jsdom
 */
/**
 * The /pawlegends host inside the Token Tails games ecosystem: the same-origin iframe with `embed=1`, the exit to
 * /game, the kill switch, sign-in requests, `session {signedIn, progress}`, saves through /live with `save-result`
 * (and the profile following the answer), the "ADD YOUR MATCHES?" claim, the roster with art and catalog ids, the
 * featured cats and the one Meet offer, the Token Tails cat checkout (`open-cat` → sheet → `purchase-result` and a
 * fresh roster), notify-me, audio volumes, app builds (no checkout, no featured, starter and redeemed cats only),
 * and the legacy `pl_*` token and returns.
 */
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
const mockTrack = jest.fn();
const mockReportAppError = jest.fn((...args: unknown[]) => args.length > 0);
jest.mock("@/analytics", () => ({
  analytics: { track: (e: unknown) => mockTrack(e) },
  reportAppError: (...args: unknown[]) => mockReportAppError(...args),
}));
const mockAuth = jest.fn((): unknown => undefined);
jest.mock("@/context/FirebaseAuthContext", () => ({
  useOptionalFirebaseAuth: () => mockAuth(),
  FirebaseAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const mockSetProfileUpdate = jest.fn();
const mockProfile = jest.fn((): unknown => ({ profile: null }));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ setProfileUpdate: mockSetProfileUpdate, ...(mockProfile() as object) }),
}));
const replace = jest.fn(() => Promise.resolve(true));
const mockRouter = { replace, pathname: "/pawlegends", query: {} as Record<string, string>, isReady: true };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
// next/dynamic: resolve the loader after mount, like the real one does in the browser.
jest.mock("next/dynamic", () => (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
  const R = jest.requireActual("react") as typeof React;
  return function Dynamic(props: Record<string, unknown>) {
    const [C, setC] = R.useState<React.ComponentType<Record<string, unknown>> | null>(null);
    R.useEffect(() => {
      let live = true;
      void loader().then((c) => live && setC(() => c));
      return () => {
        live = false;
      };
    }, []);
    return C ? R.createElement(C, props) : null;
  };
});
// The Token Tails checkout itself is tested in pawlegends/cat-sheet.test.tsx.
const BOUGHT = { _id: "mine-new", name: "Pumpkin", type: "GRASS", tier: "COMMON", origin: "adopt", sourceCat: "65a1b2c3d4e5f6a7b8c9d0e1" };
jest.mock("@/components/pawlegends/PawlegendsCatSheet", () => ({
  PawlegendsCatSheet: ({
    cat,
    onBought,
    onClose,
  }: {
    cat: { _id: string; name: string };
    onBought: (c: unknown) => void;
    onClose: (c: unknown) => void;
  }) => (
    <div data-testid="pawlegends-cat-sheet" data-cat={cat._id}>
      <button type="button" onClick={() => onBought(BOUGHT)}>
        stub-buy
      </button>
      <button type="button" onClick={() => onClose(null)}>
        stub-close
      </button>
      <button type="button" onClick={() => onClose(BOUGHT)}>
        stub-done
      </button>
    </div>
  ),
}));
const seoProps = jest.fn();
jest.mock("@/components/seo/SeoHead", () => ({ SeoHead: (props: unknown) => (seoProps(props), null) }));
jest.mock("@/components/ui/GameModal", () => ({
  GameModal: ({ open = true, title, children }: { open?: boolean; title: React.ReactNode; children: React.ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={String(title)}>
        {children}
      </div>
    ) : null,
}));
jest.mock("@/components/ui/modal", () => ({
  ActionRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalButton: (props: Record<string, unknown>) => {
    const rest = Object.fromEntries(
      Object.entries(props).filter(([key]) => !["children", "busy", "icon", "variant", "size"].includes(key))
    );
    return (
      <button type="button" {...rest}>
        {props.children as React.ReactNode}
      </button>
    );
  },
}));

import { PawlegendsHost, PAWLEGENDS_FRAME_TESTID, PAWLEGENDS_PENDING_KEY } from "@/components/pawlegends/PawlegendsHost";
import PawlegendsPage, { PAWLEGENDS_SEO } from "@/pages/pawlegends";
import PawlegendsTermsPage from "@/pages/pawlegends/terms";
import { PAWLEGENDS_HELLO_TIMEOUT_MS, PAWLEGENDS_NS } from "@/components/pawlegends/bridge";
import {
  PAWLEGENDS_SESSIONS_KEY,
  PAWLEGENDS_TOKEN_KEY,
  UNDER_16_MESSAGE,
  type PawlegendsApi,
} from "@/components/pawlegends/checkout";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { GameType } from "@/models/game";

const b64url = (value: string) => Buffer.from(value).toString("base64url");
const tokenFor = (skus: string[], items: string[]) =>
  `${b64url(JSON.stringify({ skus, items, expiresAt: 9e15 }))}.${"s".repeat(43)}`;
const TOKEN = tokenFor(["pl_founder"], ["frame.founder"]);
const CAT_A = "65a1b2c3d4e5f6a7b8c9d0e1";
const CAT_B = "65a1b2c3d4e5f6a7b8c9d0e2";
const ART = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/cats/a.png";

const REPLAY = {
  v: 1,
  simVersion: 3,
  seed: 7,
  difficulty: "easy",
  hero: "clem",
  trick: "pounce",
  ticks: 9000,
  inputs: "AA==",
  outcome: "won",
  finalHash: "0000abcd",
};
const LIVE = { difficulty: "easy", outcome: "won", ticks: 9000, finalHash: "0000abcd", catnipPaid: 20, catnipCount: 140, fastestWin: 9000 };

const saleCat = (id: string, type: string, name: string) => ({
  _id: id,
  name,
  type,
  tier: "RARE",
  catImg: ART,
  blessing: { _id: `b${id}`, status: "WAITING" },
});
const STOREFRONT = { tokentails: [saleCat(CAT_A, "GRASS", "Pumpkin"), saleCat(CAT_B, "STELLAR", "Nova")], "token-tails": [] };

const STATUS = {
  ok: true,
  status: 200,
  code: null,
  message: null,
  body: { store: true, email: true, termsVersion: "2026-10-17", skus: [] },
};

function fakeApi(over: Partial<Record<keyof PawlegendsApi, jest.Mock>> = {}): PawlegendsApi & Record<string, jest.Mock> {
  const ok = (body: unknown) => jest.fn(async () => ({ ok: true, status: 200, code: null, message: null, body }));
  return {
    status: jest.fn(async () => STATUS),
    checkout: ok({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }),
    entitlementsForSession: ok({ token: TOKEN, items: ["frame.founder"], skus: ["pl_founder"], expiresAt: 1 }),
    refresh: ok({ token: TOKEN, items: ["frame.founder"], skus: ["pl_founder"], expiresAt: 1 }),
    restore: ok({ ok: true }),
    verifyRestore: ok({ token: TOKEN, items: [], skus: [], expiresAt: 1 }),
    notify: ok({ ok: true }),
    confirmNotify: ok({ ok: true }),
    founders: ok({ left: 1, cap: 500 }),
    offer: ok({ offer: { kind: "meet", catalogId: CAT_A } }),
    offerSeen: ok({ ok: true }),
    ...over,
  } as never;
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });

async function mount(props: Partial<React.ComponentProps<typeof PawlegendsHost>> = {}) {
  const api = (props.api as ReturnType<typeof fakeApi>) ?? fakeApi();
  const navigate = jest.fn();
  const saveMatch = jest.fn(async () => ({ ok: true, status: 201, code: null, body: LIVE }));
  const loadStorefront = jest.fn(async () => STOREFRONT as Record<string, unknown>);
  render(
    <PawlegendsHost
      api={api}
      navigate={navigate}
      isApp={false}
      saveMatch={saveMatch as never}
      loadStorefront={loadStorefront}
      pollMs={0}
      {...props}
    />
  );
  const frame = screen.getByTestId(PAWLEGENDS_FRAME_TESTID) as HTMLIFrameElement;
  const posted: Array<Record<string, unknown>> = [];
  const origins: string[] = [];
  jest.spyOn(frame.contentWindow!, "postMessage").mockImplementation(((message: unknown, origin: string) => {
    origins.push(origin);
    posted.push(message as Record<string, unknown>);
  }) as never);
  const fromGame = (data: Record<string, unknown>) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { ns: PAWLEGENDS_NS, v: 1, ...data },
          origin: window.location.origin,
          source: frame.contentWindow,
        })
      );
    });
  await settle();
  fromGame({ type: "ready", version: "1" });
  await settle();
  const last = (type: string) => [...posted].reverse().find((m) => m.type === type);
  const all = (type: string) => posted.filter((m) => m.type === type);
  return { api, navigate, saveMatch, loadStorefront, frame, posted, origins, fromGame, last, all };
}

const account = (over: Record<string, unknown> = {}) => ({
  user: { uid: "uid-1", isAnonymous: false, email: "cat@example.com" },
  authStatus: "ready",
  requireAccount: jest.fn(async () => "signed-in"),
  refreshProfile: jest.fn(async () => null),
  ...over,
});
const eventNames = () => mockTrack.mock.calls.map((c) => (c[0] as { name: string }).name);

beforeEach(() => {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(() => Promise.reject(new Error("no network")));
  window.localStorage.clear();
  mockAuth.mockReturnValue(undefined);
  mockProfile.mockReturnValue({ profile: null });
  mockRouter.query = {};
  delete process.env.NEXT_PUBLIC_PAWLEGENDS;
});

describe("/pawlegends page", () => {
  it("frames the same-origin build with embed=1 and no sandbox, noindex meta", async () => {
    render(<PawlegendsPage />);
    await settle();
    const frame = screen.getByTestId(PAWLEGENDS_FRAME_TESTID);
    expect(frame.getAttribute("src")).toBe("/pawlegends-game/index.html?embed=1");
    expect(frame.getAttribute("title")).toBe(PAWLEGENDS_TITLE);
    expect(frame.hasAttribute("sandbox")).toBe(false);
    expect(seoProps).toHaveBeenCalledWith(expect.objectContaining({ path: "/pawlegends", noindex: true }));
  });

  it("keeps noindex and the sitemap exclusion in step, and one length phrase in both metas (PUB-08)", () => {
    // LAUNCH.md a.8 step 1 lifts both together: flip `noindex: true` above and this exclusion in the same commit.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sitemap = require("../next-sitemap.config.js");
    expect(sitemap.exclude).toEqual(expect.arrayContaining(["/pawlegends", "/pawlegends/terms"]));
    expect(PAWLEGENDS_SEO.description).toContain("Seven-minute matches");
    for (const file of ["../public/pawlegends-game/index.html", "../../pawlegends/index.html"]) {
      const html = readFileSync(join(__dirname, file), "utf8");
      expect(html).toContain("Seven-minute matches.");
    }
  });

  it("passes the 1200 x 630 Pawlegends share card, not the generic Token Tails one (PUB-06)", () => {
    render(<PawlegendsPage />);
    expect(seoProps).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.objectContaining({ url: "/pawlegends/og.jpg", width: 1200, height: 630, alt: expect.any(String) }),
      })
    );
    const jpg = readFileSync(join(__dirname, "../public/pawlegends/og.jpg"));
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
  });

  it("forwards a dare link to the game frame, so the friend lands on the dared match (PUB-03)", async () => {
    window.history.replaceState(null, "", "/pawlegends?dare=9ix.0.0.1.c0&from=x");
    try {
      render(<PawlegendsPage />);
      await settle();
      expect(screen.getByTestId(PAWLEGENDS_FRAME_TESTID).getAttribute("src")).toBe("/pawlegends-game/index.html?embed=1&dare=9ix.0.0.1.c0");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("drops a malformed dare and keeps the plain frame (PUB-03)", async () => {
    window.history.replaceState(null, "", "/pawlegends?dare=%22%3E%3Cscript%3E");
    try {
      render(<PawlegendsPage />);
      await settle();
      expect(screen.getByTestId(PAWLEGENDS_FRAME_TESTID).getAttribute("src")).toBe("/pawlegends-game/index.html?embed=1");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("the kill switch sends players to /game", () => {
    process.env.NEXT_PUBLIC_PAWLEGENDS = "0";
    const { container } = render(<PawlegendsPage />);
    expect(container.innerHTML).toBe("");
    expect(replace).toHaveBeenCalledWith("/game");
  });

  it("the terms page describes the $5 cat, the withdrawal notice, age limits and a contact; no retired packs", () => {
    render(<PawlegendsTermsPage />);
    const text = screen.getByTestId("pawlegends-terms").textContent ?? "";
    expect(text).toMatch(/for \$5\./);
    expect(text).toMatch(/Companion Kitten/);
    expect(text).toMatch(/14-day withdrawal right/);
    expect(text).toMatch(/lose this 14-day withdrawal right once the cat is\s+delivered/);
    expect(text).not.toMatch(/Starter|Founder|500|pack|MVP|2027-06-30/i);
    expect(text).toMatch(/€30/);
    expect(text).toMatch(/€200/);
    expect(text).toContain(UNDER_16_MESSAGE);
    expect(text).toMatch(/info@tokentails\.com/);
  });
});

describe("PawlegendsHost: shell", () => {
  it("posts only to its own origin; the checkout is reachable on the web; the exit goes to /game", async () => {
    const h = await mount();
    expect(h.origins.every((o) => o === window.location.origin)).toBe(true);
    expect(h.last("app")).toEqual({ ns: PAWLEGENDS_NS, v: 1, type: "app", isApp: false, store: true, notify: true });
    expect(h.last("session")).toMatchObject({ signedIn: false, progress: null });
    fireEvent.click(screen.getByRole("button", { name: "Back to games" }));
    expect(h.navigate).toHaveBeenCalledWith("/game");
    expect(eventNames()).toContain("pawlegends_open");
  });

  it("counts sessions and strips ?from=picker after reporting it", async () => {
    mockRouter.query = { from: "picker" };
    window.localStorage.setItem(PAWLEGENDS_SESSIONS_KEY, "4");
    await mount();
    expect(window.localStorage.getItem(PAWLEGENDS_SESSIONS_KEY)).toBe("5");
    expect(replace).toHaveBeenCalledWith({ pathname: "/pawlegends", query: {} }, undefined, { shallow: true, scroll: false });
  });

  it("sends the shell's mute and both volumes", async () => {
    const h = await mount();
    expect(h.last("audio")).toEqual({ ns: PAWLEGENDS_NS, v: 1, type: "audio", muted: false, music: 0.4, sfx: 0.6 });
  });

  it("tracks pawlegends_bridge_timeout when the game never answers hello, then shows the timeout panel (R1)", () => {
    jest.useFakeTimers();
    try {
      mockTrack.mockClear();
      render(<PawlegendsHost api={fakeApi()} navigate={jest.fn()} isApp={false} loadStorefront={jest.fn(async () => null)} pollMs={0} />);
      act(() => {
        jest.advanceTimersByTime(PAWLEGENDS_HELLO_TIMEOUT_MS + 3_000);
      });
      const timeouts = mockTrack.mock.calls.filter(([e]) => (e as { name: string }).name === "pawlegends_bridge_timeout");
      expect(timeouts).toEqual([[{ name: "pawlegends_bridge_timeout", properties: { waitedMs: PAWLEGENDS_HELLO_TIMEOUT_MS, reloads: 0 } }]]);
      expect(screen.getByTestId("pawlegends-timeout")).toBeTruthy();
    } finally {
      cleanup();
      jest.useRealTimers();
    }
  });

  it("hands the dare line to the share sheet with the link (PUB-06); an older build's share sends no text", async () => {
    const share = jest.fn(async () => undefined);
    Object.defineProperty(window.navigator, "share", { value: share, configurable: true });
    try {
      const h = await mount();
      h.fromGame({ type: "share", kind: "dare", url: "/pawlegends?dare=9ix", text: "Beat my 7:12 vs Easy bots in Pawlegends!" });
      expect(share).toHaveBeenLastCalledWith({
        url: `${window.location.origin}/pawlegends?dare=9ix`,
        title: PAWLEGENDS_TITLE,
        text: "Beat my 7:12 vs Easy bots in Pawlegends!",
      });
      h.fromGame({ type: "share", kind: "dare", url: "/pawlegends?dare=9ix" });
      expect(share).toHaveBeenLastCalledWith({ url: `${window.location.origin}/pawlegends?dare=9ix`, title: PAWLEGENDS_TITLE });
      h.fromGame({ type: "share", kind: "dare", url: "/pawlegends?dare=9ix", text: "Win at https://evil.example" });
      expect(share).toHaveBeenLastCalledWith({ url: `${window.location.origin}/pawlegends?dare=9ix`, title: PAWLEGENDS_TITLE });
    } finally {
      delete (window.navigator as { share?: unknown }).share;
    }
  });

  it("reports a game crash as a scrubbed app_error through the host reporter (R1)", async () => {
    mockReportAppError.mockClear();
    const h = await mount();
    h.fromGame({ type: "client-error", source: "worker", msg: "sim worker failed", screen: "match", tier: "low", sim: 10 });
    h.fromGame({ type: "client-error", source: "window", msg: "Has https://x.example", screen: "match", tier: "low", sim: 10 });
    expect(mockReportAppError).toHaveBeenCalledTimes(1);
    expect(mockReportAppError).toHaveBeenCalledWith("pawlegends_worker", "sim worker failed", {
      source: "worker",
      game: "pawlegends",
      screen: "match",
      tier: "low",
      sim: 10,
    });
  });

  it("sends the game's relayed events with the host's analytics (PUB-02)", async () => {
    const h = await mount();
    mockTrack.mockClear();
    h.fromGame({ type: "analytics", event: "match_end", props: { hero: "brutus", length: 452, embed: true, link: "https://x.example" } });
    h.fromGame({ type: "analytics", event: "app_error", props: { msg: "x" } });
    expect(mockTrack.mock.calls).toEqual([[{ name: "match_end", properties: { hero: "brutus", length: 452, embed: true } }]]);
  });

  it("answers a deprecated purchase-intent with the legacy refusal and opens nothing", async () => {
    const h = await mount();
    h.fromGame({ type: "purchase-intent", sku: "pl_founder" });
    expect(screen.queryByTestId("pawlegends-cat-sheet")).toBeNull();
    expect(h.last("purchase-result")).toMatchObject({ sku: "pl_founder", ok: false });
  });

  it("web builds send the stored legacy token after refreshing it", async () => {
    window.localStorage.setItem(PAWLEGENDS_TOKEN_KEY, TOKEN);
    const h = await mount();
    expect(h.api.refresh).toHaveBeenCalledWith(TOKEN);
    expect(h.last("entitlements")).toMatchObject({ token: TOKEN });
  });
});

describe("PawlegendsHost: account and saves", () => {
  it("request-sign-in opens the AuthSheet with the game's reason", async () => {
    const auth = account({ user: null, authStatus: "signed-out" });
    mockAuth.mockReturnValue(auth);
    const h = await mount();
    h.fromGame({ type: "request-sign-in", reason: "save-progress" });
    expect(auth.requireAccount).toHaveBeenCalledWith("save-progress");
    expect(eventNames()).toContain("pawlegends_signin_prompt");
  });

  it("session carries the account's progress from the profile", async () => {
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({
      profile: { cats: [], pawlegendsCatnip: { easy: 20 }, pawlegendsMatches: { easy: 3, normal: 1 }, pawlegendsFastestWin: { easy: 8123 } },
    });
    const h = await mount();
    expect(h.last("session")).toEqual({
      ns: PAWLEGENDS_NS,
      v: 1,
      type: "session",
      signedIn: true,
      progress: {
        catnip: { easy: 20, normal: 0, rookie: 0, hard: 0 },
        matches: { easy: 3, normal: 1, rookie: 0, hard: 0 },
        fastestWin: { easy: 8123, normal: 0, rookie: 0, hard: 0 },
      },
    });
  });

  it("a match with a Firebase user posts once to /live; save-result goes saving then saved with +catnip; the profile follows", async () => {
    const auth = account({ user: { uid: "uid-1", isAnonymous: true, email: null }, authStatus: "guest" });
    mockAuth.mockReturnValue(auth);
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    const h = await mount();
    h.fromGame({ type: "match-result", replay: REPLAY, summary: { takedowns: 3 }, matchId: "m7k2x9" });
    await settle();
    expect(h.saveMatch).toHaveBeenCalledTimes(1);
    expect(h.saveMatch).toHaveBeenCalledWith(
      { type: GameType.PAWLEGENDS, pawlegends: REPLAY },
      { signal: expect.any(AbortSignal) }
    );
    expect(h.all("save-result").map((m) => m.status)).toEqual(["saving", "saved"]);
    expect(h.last("save-result")).toEqual({
      ns: PAWLEGENDS_NS,
      v: 1,
      type: "save-result",
      matchId: "m7k2x9",
      status: "saved",
      catnipPaid: 20,
      catnipTotal: 140,
      fastestWin: 9000,
    });
    expect(mockSetProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        pawlegendsCatnip: { easy: 20, normal: 0, rookie: 0, hard: 0 },
        pawlegendsMatches: { easy: 1, normal: 0, rookie: 0, hard: 0 },
        pawlegendsFastestWin: { easy: 9000, normal: 0, rookie: 0, hard: 0 },
        catnipCount: 140,
      })
    );
    expect(auth.refreshProfile).toHaveBeenCalled();
  });

  it("pawlegends_save carries the backend's error code and HTTP status (the sim-drift alert, LAUNCH a.8)", async () => {
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    const saves = () =>
      mockTrack.mock.calls
        .map((c) => c[0] as { name: string; properties: Record<string, unknown> })
        .filter((e) => e.name === "pawlegends_save")
        .map((e) => e.properties);
    const rejected = jest.fn(async () => ({ ok: false, status: 400, code: "PAWLEGENDS_OUTCOME_MISMATCH", body: null }));
    const h = await mount({ saveMatch: rejected as never });
    h.fromGame({ type: "match-result", replay: REPLAY, matchId: "m9" });
    await settle();
    expect(h.last("save-result")).toMatchObject({ matchId: "m9", status: "rejected", code: "PAWLEGENDS_OUTCOME_MISMATCH" });
    expect(saves()).toEqual([{ status: "rejected", catnipPaid: 0, code: "PAWLEGENDS_OUTCOME_MISMATCH", httpStatus: 400 }]);
    // A code outside the backend's UPPER_SNAKE form never reaches PostHog as written.
    cleanup();
    mockTrack.mockClear();
    const odd = jest.fn(async () => ({ ok: false, status: 502, code: "<html>bad gateway</html>", body: null }));
    const h2 = await mount({ saveMatch: odd as never });
    h2.fromGame({ type: "match-result", replay: REPLAY, matchId: "m10" });
    await settle();
    expect(saves()).toEqual([{ status: "failed", catnipPaid: 0, code: "OTHER", httpStatus: 502 }]);
  });

  it("without a user the match is kept on the device (queued); after sign-in ADD YOUR MATCHES? sends it", async () => {
    const h = await mount();
    h.fromGame({ type: "match-result", replay: REPLAY, matchId: "m1" });
    await settle();
    expect(h.saveMatch).not.toHaveBeenCalled();
    expect(h.last("save-result")).toMatchObject({ matchId: "m1", status: "queued", catnipPaid: 0 });
    expect(window.localStorage.getItem("tt.pawlegends.queue.v1")).toContain("0000abcd");
    // Signing in later (a new mount stands in for the auth change).
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    cleanup();
    const h2 = await mount();
    expect(screen.getByRole("dialog", { name: "ADD YOUR MATCHES?" })).toBeTruthy();
    expect(h2.saveMatch).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText("ADD THEM"));
    });
    await settle();
    expect(h2.saveMatch).toHaveBeenCalledTimes(1);
    expect(eventNames()).toContain("pawlegends_guest_claim");
  });

  it("ADD THEM closes the prompt at once; the claimed matches are sent in the background (launch finding R4)", async () => {
    const h = await mount();
    h.fromGame({ type: "match-result", replay: REPLAY, matchId: "m1" });
    await settle();
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    cleanup();
    // A POST that never settles (a stalled connection).
    const stalled = jest.fn(() => new Promise<never>(() => undefined));
    await mount({ saveMatch: stalled as never });
    await act(async () => {
      fireEvent.click(screen.getByText("ADD THEM"));
    });
    expect(screen.queryByRole("dialog", { name: "ADD YOUR MATCHES?" })).toBeNull();
    expect(stalled).toHaveBeenCalledTimes(1);
  });

  it("NOT MINE forgets the device matches", async () => {
    const h = await mount();
    h.fromGame({ type: "match-result", replay: REPLAY, matchId: "m1" });
    await settle();
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    cleanup();
    const h2 = await mount();
    fireEvent.click(screen.getByText("NOT MINE"));
    await settle();
    expect(h2.saveMatch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("tt.pawlegends.queue.v1")).toBeNull();
  });
});

describe("PawlegendsHost: cards and the Meet checkout", () => {
  const owned = [
    {
      _id: "mine1",
      name: "Mochi",
      type: "FIRE",
      tier: "RARE",
      isStarter: false,
      origin: "adopt",
      owner: "uid-1",
      catImg: ART,
      sourceCat: "65a1b2c3d4e5f6a7b8c9d0ff",
    },
    { _id: "mine2", name: "Packy", type: "ICE", tier: "EPIC", origin: "pack", owner: "uid-1" },
    { _id: "mine3", name: "Scout", type: "WATER", tier: "COMMON", isStarter: true, origin: "starter", owner: "uid-1" },
  ];

  it("sends the owned cats with art and catalog id, and two unowned featured cats", async () => {
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: owned } });
    const h = await mount();
    const roster = h.last("roster") as { cats: Record<string, unknown>[] };
    expect(roster.cats[0]).toMatchObject({ id: "mine3", isStarter: true });
    expect(roster.cats.find((c) => c.id === "mine1")).toEqual({
      id: "mine1",
      name: "Mochi",
      type: "FIRE",
      tier: "RARE",
      isStarter: false,
      origin: "adopt",
      art: ART,
      catalogId: "65a1b2c3d4e5f6a7b8c9d0ff",
    });
    expect((h.last("featured") as { cats: unknown[] }).cats).toEqual([
      expect.objectContaining({ catalogId: expect.any(String), art: ART }),
      expect.objectContaining({ catalogId: expect.any(String) }),
    ]);
  });

  it("asks for the session's one offer with the featured ids, sends it after featured, and records offer-seen", async () => {
    window.localStorage.setItem(PAWLEGENDS_SESSIONS_KEY, "1");
    const h = await mount();
    expect(h.api.offer).toHaveBeenCalledWith(
      expect.objectContaining({ session: 2, catalogIds: expect.arrayContaining([CAT_A, CAT_B]), deviceId: expect.any(String) })
    );
    expect(h.last("offer")).toEqual({ ns: PAWLEGENDS_NS, v: 1, type: "offer", offer: { kind: "meet", catalogId: CAT_A } });
    h.fromGame({ type: "offer-seen", kind: "meet", catalogId: CAT_A });
    expect(h.api.offerSeen).toHaveBeenCalledWith(expect.objectContaining({ session: 2, catalogId: CAT_A }));
  });

  it("an offer for a cat outside the featured list is never sent", async () => {
    const h = await mount({ api: fakeApi({ offer: jest.fn(async () => ({ ok: true, status: 200, code: null, message: null, body: { offer: { kind: "meet", catalogId: "65a1b2c3d4e5f6a7b8c9d0ee" } } })) }) });
    expect(h.all("offer")).toHaveLength(0);
  });

  it("open-cat signed out asks for an account first; signed in opens the sheet; a purchase answers ok and a fresh roster", async () => {
    const auth = account({ user: null, authStatus: "signed-out", requireAccount: jest.fn(async () => "dismissed") });
    mockAuth.mockReturnValue(auth);
    const h = await mount();
    h.fromGame({ type: "open-cat", catalogId: CAT_A });
    await settle();
    expect(auth.requireAccount).toHaveBeenCalledWith("purchase");
    expect(screen.queryByTestId("pawlegends-cat-sheet")).toBeNull();
    expect(h.last("purchase-result")).toMatchObject({ catalogId: CAT_A, ok: false });

    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    cleanup();
    const h2 = await mount();
    h2.fromGame({ type: "open-cat", catalogId: CAT_A });
    await settle();
    expect(screen.getByTestId("pawlegends-cat-sheet").getAttribute("data-cat")).toBe(CAT_A);
    fireEvent.click(screen.getByText("stub-buy"));
    expect(h2.last("purchase-result")).toEqual({ ns: PAWLEGENDS_NS, v: 1, type: "purchase-result", catalogId: CAT_A, ok: true });
    const order = h2.posted.map((m) => m.type);
    expect(order.lastIndexOf("roster")).toBeGreaterThan(order.lastIndexOf("purchase-result"));
    expect((h2.last("roster") as { cats: Record<string, unknown>[] }).cats).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "mine-new", catalogId: CAT_A })])
    );
    expect(eventNames()).toEqual(expect.arrayContaining(["pawlegends_meet_open", "pawlegends_cat_purchase"]));
  });

  it("closing the sheet without buying answers ok:false", async () => {
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    const h = await mount();
    h.fromGame({ type: "open-cat", catalogId: CAT_B });
    await settle();
    fireEvent.click(screen.getByText("stub-close"));
    expect(screen.queryByTestId("pawlegends-cat-sheet")).toBeNull();
    expect(h.last("purchase-result")).toMatchObject({ catalogId: CAT_B, ok: false });
  });

  it("open-cat for an unknown cat does nothing", async () => {
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    const h = await mount();
    h.fromGame({ type: "open-cat", catalogId: "65a1b2c3d4e5f6a7b8c9d0ee" });
    await settle();
    expect(screen.queryByTestId("pawlegends-cat-sheet")).toBeNull();
  });

  it("notify opens the season-news form and posts the email", async () => {
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [] } });
    const h = await mount();
    h.fromGame({ type: "notify", where: "results" });
    await settle();
    expect((screen.getByTestId("pawlegends-notify-email") as HTMLInputElement).value).toBe("cat@example.com");
    const privacy = screen.getByTestId("pawlegends-notify-privacy");
    const hrefs = Array.from(privacy.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "mailto:info@tokentails.com",
      "https://docs.tokentails.com/community-and-social-impact/privacy-policy",
      "/pawlegends/terms",
    ]);
    await act(async () => {
      fireEvent.click(screen.getByTestId("pawlegends-notify-send"));
    });
    expect(h.api.notify).toHaveBeenCalledWith("cat@example.com", "results");
  });

  it("app builds: no checkout, no featured cats, no offer, open-cat dropped, starter and redeemed cats only", async () => {
    window.localStorage.setItem(PAWLEGENDS_TOKEN_KEY, TOKEN);
    window.localStorage.setItem(PAWLEGENDS_SESSIONS_KEY, "5");
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: owned } });
    const api = fakeApi();
    const h = await mount({ api, isApp: true });
    expect(api.status).not.toHaveBeenCalled();
    expect(api.refresh).not.toHaveBeenCalled();
    expect(api.offer).not.toHaveBeenCalled();
    expect(h.loadStorefront).not.toHaveBeenCalled();
    expect(h.last("app")).toMatchObject({ isApp: true, store: false, notify: false });
    expect(h.last("entitlements")).toMatchObject({ token: null });
    expect((h.last("featured") as { cats: unknown[] }).cats).toEqual([]);
    expect(h.all("offer").every((m) => m.offer === null)).toBe(true);
    expect((h.last("roster") as { cats: { id: string }[] }).cats.map((c) => c.id)).toEqual(["mine3"]);
    h.fromGame({ type: "open-cat", catalogId: CAT_A });
    await settle();
    expect(screen.queryByTestId("pawlegends-cat-sheet")).toBeNull();
  });
});

describe("PawlegendsHost: legacy returns", () => {
  it("a pl_* Checkout return fetches the token and keeps it", async () => {
    window.localStorage.setItem(PAWLEGENDS_PENDING_KEY, "pl_founder");
    mockRouter.query = { checkout: "ok", session_id: "cs_test_abcdefgh1" };
    const pending = fakeApi({
      entitlementsForSession: jest
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, code: null, message: null, body: { token: tokenFor([], []), items: [], skus: [], expiresAt: 1 } })
        .mockResolvedValue({ ok: true, status: 200, code: null, message: null, body: { token: TOKEN, items: ["frame.founder"], skus: ["pl_founder"], expiresAt: 1 } }),
    });
    const h = await mount({ api: pending });
    await settle();
    expect(pending.entitlementsForSession).toHaveBeenCalledWith("cs_test_abcdefgh1");
    expect(window.localStorage.getItem(PAWLEGENDS_TOKEN_KEY)).toBe(TOKEN);
    expect(window.localStorage.getItem(PAWLEGENDS_PENDING_KEY)).toBeNull();
    expect(h.last("entitlements")).toMatchObject({ token: TOKEN });
  });

  it("a restore link swaps in a fresh token", async () => {
    mockRouter.query = { restore: "R".repeat(32) };
    const api = fakeApi();
    await mount({ api });
    await settle();
    expect(api.verifyRestore).toHaveBeenCalledWith("R".repeat(32));
    expect(window.localStorage.getItem(PAWLEGENDS_TOKEN_KEY)).toBe(TOKEN);
  });
});
