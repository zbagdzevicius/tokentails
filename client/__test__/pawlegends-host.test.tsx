/**
 * @jest-environment jsdom
 */
/**
 * The /pawlegends host (`/play` on pawlegends.app): the same-origin iframe with `embed=1`, the kill switch, sign-in
 * requests, `session {signedIn, progress}`, saves through /live with `save-result` (and the profile following the
 * answer), the "ADD YOUR MATCHES?" claim, the shelter champions' art (never for sale), notify-me, audio volumes, app
 * builds (no checkout), and the legacy `pl_*` token and returns. NO-TOKENTAILS.md: no roster, featured cats, Meet
 * offer, cat checkout or exit to the Token Tails games, whatever an older game build sends.
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
const mockRouter = { replace, pathname: "/pawlegends/play", query: {} as Record<string, string>, isReady: true };
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
// Sign-in: the account sheet (sign out, delete) is tested on its own; here only that the host opens it.
jest.mock("@/components/pawlegends/PawlegendsAccount", () => ({
  PawlegendsAccountSheet: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="pawlegends-account-sheet">
      <button type="button" onClick={onClose}>
        stub-close-account
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
import PawlegendsPage, { PAWLEGENDS_SEO } from "@/pages/pawlegends/play";
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
    me: ok({ items: [], season: null }),
    passClaim: ok({ items: [], season: null }),
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
  render(
    <PawlegendsHost
      api={api}
      navigate={navigate}
      isApp={false}
      saveMatch={saveMatch as never}
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
  return { api, navigate, saveMatch, frame, posted, origins, fromGame, last, all };
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

describe("/pawlegends/play page", () => {
  it("frames the same-origin build with embed=1 and no sandbox, noindex meta", async () => {
    render(<PawlegendsPage />);
    await settle();
    const frame = screen.getByTestId(PAWLEGENDS_FRAME_TESTID);
    expect(frame.getAttribute("src")).toBe("/pawlegends-game/index.html?embed=1");
    expect(frame.getAttribute("title")).toBe(PAWLEGENDS_TITLE);
    expect(frame.hasAttribute("sandbox")).toBe(false);
    expect(seoProps).toHaveBeenCalledWith(expect.objectContaining({ path: "/pawlegends/play", noindex: true }));
  });

  it("keeps noindex and the sitemap exclusion in step, and one length phrase in both metas (PUB-08)", () => {
    // LAUNCH.md a.8 step 1 lifts both together: flip `noindex: true` above and this exclusion in the same commit.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sitemap = require("../next-sitemap.config.js");
    expect(sitemap.exclude).toEqual(expect.arrayContaining(["/pawlegends", "/pawlegends/play", "/pawlegends/terms"]));
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

  it("the terms page: store items and the pass, the withdrawal notice, age limits, the operator and a contact; no cat sale", () => {
    render(<PawlegendsTermsPage />);
    const text = screen.getByTestId("pawlegends-terms").textContent ?? "";
    expect(text).toMatch(/store items/);
    expect(text).toMatch(/14-day withdrawal right/);
    // the purchase button is the consent (Nov 12: no tick box)
    expect(text).toMatch(/Buy now · delivered instantly/);
    expect(text).toMatch(/By pressing that button you ask us to deliver the item right away and\s+confirm that you lose the 14-day withdrawal right once it is delivered/);
    expect(text).not.toMatch(/tick a box/);
    // NO-TOKENTAILS.md: no named cat for sale, no Meet card; the operator is named once, where the law needs it
    expect(text).not.toMatch(/\$5|Companion Kitten|Meet|named cat|card skin/);
    expect(text.match(/Token Tails/g)).toEqual(["Token Tails"]);
    expect(text).toContain("operated by Token Tails MB");
    expect(text).not.toMatch(/Starter|Founder|500|pack|MVP|2027-06-30/i);
    expect(text).toMatch(/€30/);
    expect(text).toMatch(/€200/);
    expect(text).toContain(UNDER_16_MESSAGE);
    expect(text).toMatch(/info@tokentails\.com/);
  });
});

describe("PawlegendsHost: shell", () => {
  it("posts only to its own origin; the store is reachable on the web; an older build's exit leaves nowhere", async () => {
    const h = await mount();
    expect(h.origins.every((o) => o === window.location.origin)).toBe(true);
    expect(h.last("app")).toEqual({ ns: PAWLEGENDS_NS, v: 1, type: "app", isApp: false, store: true, notify: true });
    expect(h.last("session")).toMatchObject({ signedIn: false, progress: null });
    // no host close button over the game, and NO-TOKENTAILS.md: no way out to the Token Tails games hub
    expect(screen.queryByRole("button", { name: "Back to games" })).toBeNull();
    expect(screen.queryByTestId("pawlegends-exit")).toBeNull();
    h.fromGame({ type: "exit" });
    expect(h.navigate).not.toHaveBeenCalled();
    expect(eventNames()).toContain("pawlegends_open");
  });

  it("strips ?from=picker after reporting it", async () => {
    mockRouter.query = { from: "picker" };
    await mount();
    expect(replace).toHaveBeenCalledWith({ pathname: "/pawlegends/play", query: {} }, undefined, { shallow: true, scroll: false });
  });

  it("reports the landing A/B arm (?lv=) on pawlegends_open and strips lv and from, keeping other keys", async () => {
    mockRouter.query = { from: "legends_hero", lv: "B", utm_source: "ad" };
    window.history.replaceState(null, "", "/pawlegends/play?from=legends_hero&lv=B&utm_source=ad");
    try {
      await mount();
      const open = mockTrack.mock.calls.map(([e]) => e as { name: string; properties: Record<string, unknown> }).find((e) => e.name === "pawlegends_open");
      expect(open?.properties).toEqual({ from: "legends_hero", landing_variant: "B" });
      expect(replace).toHaveBeenCalledWith({ pathname: "/pawlegends/play", query: { utm_source: "ad" } }, undefined, { shallow: true, scroll: false });
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("an unknown ?lv= is not reported as an arm", async () => {
    mockRouter.query = { lv: "Z" };
    window.history.replaceState(null, "", "/pawlegends/play?lv=Z");
    try {
      await mount();
      const open = mockTrack.mock.calls.map(([e]) => e as { name: string; properties: Record<string, unknown> }).find((e) => e.name === "pawlegends_open");
      expect(open?.properties).not.toHaveProperty("landing_variant");
      expect(replace).toHaveBeenCalledWith({ pathname: "/pawlegends/play", query: {} }, undefined, { shallow: true, scroll: false });
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("sends the shell's mute and both volumes", async () => {
    const h = await mount();
    expect(h.last("audio")).toEqual({ ns: PAWLEGENDS_NS, v: 1, type: "audio", muted: false, music: 0.4, sfx: 0.6 });
  });

  it("tracks pawlegends_bridge_timeout when the game never answers hello, then shows the timeout panel (R1)", () => {
    jest.useFakeTimers();
    try {
      mockTrack.mockClear();
      render(<PawlegendsHost api={fakeApi()} navigate={jest.fn()} isApp={false} pollMs={0} />);
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

  it("account chip: sign-in opens the sheet, sign-out signs out, manage and delete open the account sheet", async () => {
    const signOut = jest.fn(async () => undefined);
    const auth = account({ user: null, authStatus: "signed-out", signOut });
    mockAuth.mockReturnValue(auth);
    const h = await mount();
    h.fromGame({ type: "account", action: "sign-in" });
    expect(auth.requireAccount).toHaveBeenCalledWith("sign-in");
    h.fromGame({ type: "account", action: "sign-out" });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("pawlegends-account-sheet")).toBeNull();
    h.fromGame({ type: "account", action: "manage" });
    await settle();
    expect(screen.getByTestId("pawlegends-account-sheet")).toBeTruthy();
    fireEvent.click(screen.getByText("stub-close-account"));
    await settle();
    expect(screen.queryByTestId("pawlegends-account-sheet")).toBeNull();
    h.fromGame({ type: "account", action: "delete" });
    await settle();
    expect(screen.getByTestId("pawlegends-account-sheet")).toBeTruthy();
    h.fromGame({ type: "account", action: "make-admin" });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("session tells the game how the player signed in (never the email)", async () => {
    mockAuth.mockReturnValue(account({ user: { uid: "uid-1", isAnonymous: false, email: "cat@example.com", providers: ["apple.com"] } }));
    mockProfile.mockReturnValue({ profile: { name: "Pat", cats: [] } });
    const h = await mount();
    expect(h.last("session")).toMatchObject({ signedIn: true, name: "Pat", provider: "apple" });
    expect(JSON.stringify(h.all("session"))).not.toContain("cat@example.com");
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

  it("UX pass 2: session carries the signed-in player's profile name, cleaned; never for a guest", async () => {
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: [], name: "  Žygis <b>Paw</b>son\u0007  " } });
    const h = await mount();
    expect(h.last("session")).toMatchObject({ signedIn: true, name: "Žygis bPaw/bson" });
  });

  it("UX pass 2: a guest's session has no name", async () => {
    mockProfile.mockReturnValue({ profile: { cats: [], name: "Someone" } });
    const h = await mount();
    expect(h.last("session")).not.toHaveProperty("name");
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

describe("PawlegendsHost: no Token Tails cat feed (NO-TOKENTAILS.md)", () => {
  const owned = [
    { _id: "mine1", name: "Mochi", type: "FIRE", tier: "RARE", isStarter: false, origin: "adopt", owner: "uid-1", catImg: ART, sourceCat: "65a1b2c3d4e5f6a7b8c9d0ff" },
    { _id: "mine3", name: "Scout", type: "WATER", tier: "COMMON", isStarter: true, origin: "starter", owner: "uid-1" },
  ];
  const CHAMPS = { cats: [{ catalogId: CAT_A, forSale: true, cat: { _id: CAT_A, name: "Lambo", type: "STELLAR", tier: "RARE", catImg: ART, blessing: { _id: "b1", status: "WAITING" } } }] };

  it("sends no roster, featured cats or Meet offer; the champions carry art only, never for sale", async () => {
    window.localStorage.setItem(PAWLEGENDS_SESSIONS_KEY, "5");
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: owned } });
    const api = fakeApi({ champions: jest.fn(async () => ({ ok: true, status: 200, code: null, message: null, body: CHAMPS })) });
    const h = await mount({ api });
    expect(h.all("roster")).toHaveLength(0);
    expect(h.all("featured")).toHaveLength(0);
    expect(h.all("offer")).toHaveLength(0);
    expect(api.offer).not.toHaveBeenCalled();
    expect(h.last("champions")).toEqual({ ns: PAWLEGENDS_NS, v: 1, type: "champions", cats: [{ catalogId: CAT_A, forSale: false, catImg: ART }] });
  });

  it("an older game's open-cat, offer-seen, champion-offer and skin-preview open nothing and ask nothing", async () => {
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: owned } });
    const h = await mount();
    h.fromGame({ type: "open-cat", catalogId: CAT_A });
    h.fromGame({ type: "offer-seen", kind: "meet", catalogId: CAT_A });
    h.fromGame({ type: "champion-offer", catalogId: CAT_A });
    h.fromGame({ type: "skin-preview", catalogId: CAT_A });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.api.offer).not.toHaveBeenCalled();
    expect(h.api.offerSeen).not.toHaveBeenCalled();
    expect(h.all("purchase-result")).toHaveLength(0);
    expect(eventNames()).not.toEqual(expect.arrayContaining(["pawlegends_meet_open"]));
  });

  it("the loading banners lead back to the Paw Legends landing, never the Token Tails games", async () => {
    jest.useFakeTimers();
    try {
      render(<PawlegendsHost api={fakeApi()} navigate={jest.fn()} isApp={false} pollMs={0} />);
      act(() => {
        jest.advanceTimersByTime(PAWLEGENDS_HELLO_TIMEOUT_MS + 10);
      });
      const out = screen.getByTestId("pawlegends-timeout-exit");
      expect(out.getAttribute("href")).toBe("/pawlegends");
      expect(screen.getByTestId("pawlegends-timeout").textContent).not.toMatch(/token ?tails|games/i);
    } finally {
      jest.useRealTimers();
    }
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
    expect(hrefs).toEqual(["mailto:info@tokentails.com", "https://pawlegends.app/privacy", "/pawlegends/terms"]);
    expect(privacy.textContent).not.toMatch(/token ?tails keeps/i);
    await act(async () => {
      fireEvent.click(screen.getByTestId("pawlegends-notify-send"));
    });
    expect(h.api.notify).toHaveBeenCalledWith("cat@example.com", "results");
  });

  it("app builds: no checkout, no offer, no cat feed", async () => {
    window.localStorage.setItem(PAWLEGENDS_TOKEN_KEY, TOKEN);
    mockAuth.mockReturnValue(account());
    mockProfile.mockReturnValue({ profile: { cats: owned } });
    const api = fakeApi();
    const h = await mount({ api, isApp: true });
    expect(api.status).not.toHaveBeenCalled();
    expect(api.refresh).not.toHaveBeenCalled();
    expect(api.offer).not.toHaveBeenCalled();
    expect(h.last("app")).toMatchObject({ isApp: true, store: false, notify: false });
    expect(h.last("entitlements")).toMatchObject({ token: null });
    expect(h.all("roster")).toHaveLength(0);
    expect(h.all("featured")).toHaveLength(0);
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
