/**
 * @jest-environment jsdom
 */
/**
 * The /swordcat host (Swordcat plan §5.1): the iframe gets `embed=1`, no sandbox; the exit button
 * goes back to /game; the unavailable state without a URL; the rotate hint on portrait touch
 * screens; and the page redirects to /game while its flag is off.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
const mockAuth = jest.fn((): unknown => undefined);
jest.mock("@/context/FirebaseAuthContext", () => ({
  useOptionalFirebaseAuth: () => mockAuth(),
  FirebaseAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const replace = jest.fn(() => Promise.resolve(true));
jest.mock("next/router", () => ({ useRouter: () => ({ replace, pathname: "/swordcat", query: {}, isReady: true }) }));
jest.mock("@/components/seo/SeoHead", () => ({ SeoHead: () => null }));
// Treats (plan §12): the reads are stubbed, the POST goes through the `treatFetch` prop. Nothing reaches
// api.tokentails.com: global fetch throws if anything tries.
const mockTrack = jest.fn();
jest.mock("@/analytics", () => ({
  analytics: { track: (e: unknown) => mockTrack(e) },
  buildEvent: (name: string, props: unknown) => ({ name, props }),
}));
const mockStatus = jest.fn();
jest.mock("@/api/shelter-api", () => ({ SHELTER_API: { getDonateStatus: () => mockStatus(), donate: jest.fn() } }));
const mockMe = jest.fn();
jest.mock("@/components/codex/impact/treat", () => ({
  ...jest.requireActual("@/components/codex/impact/treat"),
  fetchDonateMe: () => mockMe(),
}));

import {
  SWORDCAT_EXIT_GUTTER_PX,
  SWORDCAT_EXIT_INSET_PX,
  SWORDCAT_EXIT_PATH,
  SWORDCAT_EXIT_SIZE_PX,
  SWORDCAT_FRAME_TESTID,
  SWORDCAT_ROTATE_HINT_KEY,
  SWORDCAT_ROTATE_HINT_MS,
  SwordcatHost,
} from "@/components/swordcat/SwordcatHost";
import SwordcatPage from "@/pages/swordcat";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";
import { acquireGameSuspension } from "@/lib/game/gameRegistry";
import { SWORDCAT_HELLO_SLOW_MS, SWORDCAT_HELLO_TIMEOUT_MS, SWORDCAT_NS } from "@/components/swordcat/bridge";
import { sentTodayOf, swordcatRailOf, treatAmountLabel, treatReceiptOf } from "@/components/swordcat/SwordcatHost";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

beforeEach(() => {
  mockAuth.mockReset().mockReturnValue(undefined);
  mockTrack.mockClear();
  mockStatus.mockReset().mockResolvedValue(null);
  mockMe.mockReset().mockResolvedValue(null);
  replace.mockClear();
  window.localStorage.clear();
  mockMatchMedia(false);
});

describe("SwordcatHost", () => {
  it("frames the game with embed=1, the allow list and no sandbox", () => {
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    const frame = screen.getByTestId(SWORDCAT_FRAME_TESTID) as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("https://swordcat.tokentails.com/?embed=1");
    expect(frame.getAttribute("title")).toBe(SWORDCAT_TITLE);
    expect(frame.getAttribute("allow")).toBe("autoplay; fullscreen; gamepad");
    expect(frame.hasAttribute("sandbox")).toBe(false);
  });

  it("appends embed=1 with & when the URL has a query", () => {
    render(<SwordcatHost url="/swordcat-game/?lang=en" navigate={jest.fn()} />);
    expect(screen.getByTestId(SWORDCAT_FRAME_TESTID).getAttribute("src")).toBe("/swordcat-game/?lang=en&embed=1");
  });

  it("goes back to /game from the exit button", () => {
    const navigate = jest.fn();
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to games" }));
    expect(navigate).toHaveBeenCalledWith(SWORDCAT_EXIT_PATH);
    expect(SWORDCAT_EXIT_PATH).toBe("/game");
  });

  it("says the game is not available without a valid URL, with a way back", () => {
    render(<SwordcatHost url={null} navigate={jest.fn()} />);
    expect(screen.getByText(`${SWORDCAT_TITLE} is not available right now.`)).toBeTruthy();
    expect(screen.queryByTestId(SWORDCAT_FRAME_TESTID)).toBeNull();
    expect(screen.getByRole("link", { name: "Back to games" }).getAttribute("href")).toBe("/game");
  });

  it("frames the same-origin build by default (no NEXT_PUBLIC_SWORDCAT_URL in tests)", () => {
    render(<SwordcatHost navigate={jest.fn()} />);
    expect(screen.getByTestId(SWORDCAT_FRAME_TESTID).getAttribute("src")).toBe("/swordcat-game/index.html?embed=1");
  });

  it("makes the frame inert while a GameModal suspends the games", () => {
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    const host = screen.getByTestId("swordcat-host");
    let release: () => void = () => undefined;
    act(() => {
      release = acquireGameSuspension();
    });
    expect(host.getAttribute("data-suspended")).toBe("1");
    act(() => release());
    expect(host.getAttribute("data-suspended")).toBeNull();
  });

  it("shows the rotate hint on portrait touch screens until it is dismissed, and remembers that", () => {
    mockMatchMedia(true);
    const { unmount } = render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    expect(screen.getByText("Turn your phone sideways for the best view")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss hint" }));
    expect(screen.queryByTestId("swordcat-rotate-hint")).toBeNull();
    expect(window.localStorage.getItem(SWORDCAT_ROTATE_HINT_KEY)).toBe("1");
    unmount();
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    expect(screen.queryByTestId("swordcat-rotate-hint")).toBeNull();
  });

  it("hides the rotate hint by itself after a few seconds, without remembering it", () => {
    jest.useFakeTimers();
    try {
      mockMatchMedia(true);
      render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
      expect(screen.getByTestId("swordcat-rotate-hint")).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(SWORDCAT_ROTATE_HINT_MS);
      });
      expect(screen.queryByTestId("swordcat-rotate-hint")).toBeNull();
      expect(window.localStorage.getItem(SWORDCAT_ROTATE_HINT_KEY)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the exit button in the frame's top-left corner, inside the gutter the game keeps free", () => {
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    const exit = screen.getByTestId("swordcat-exit");
    // (jsdom reorders the calc() terms)
    for (const [value, side] of [[exit.style.top, "top"], [exit.style.left, "left"]] as const) {
      expect(value).toContain(`env(safe-area-inset-${side})`);
      expect(value).toContain(`${SWORDCAT_EXIT_INSET_PX}px`);
    }
    // 44 px at every width (no lg 64 px), and it fits the game's embed gutter (Swordcat ui.css --embed-gut)
    expect(screen.getByRole("button", { name: "Back to games" }).className).toMatch(/lg:!h-\[44px\] lg:!w-\[44px\]/);
    expect(SWORDCAT_EXIT_INSET_PX + SWORDCAT_EXIT_SIZE_PX).toBeLessThanOrEqual(SWORDCAT_EXIT_GUTTER_PX);
    // the frame fills the safe area (inside an iframe the game reads no insets of its own)
    const frame = screen.getByTestId(SWORDCAT_FRAME_TESTID) as HTMLIFrameElement;
    for (const side of ["top", "bottom"]) expect(frame.style.height).toContain(`safe-area-inset-${side}`);
    for (const side of ["left", "right"]) expect(frame.style.width).toContain(`safe-area-inset-${side}`);
  });

  it("on a slow load: a 'still loading' note after 10 s, the fallback panel later, and a late ready clears both", () => {
    jest.useFakeTimers();
    try {
      render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
      const host = screen.getByTestId("swordcat-host");
      expect(host.getAttribute("data-bridge")).toBe("connecting");
      expect(screen.queryByTestId("swordcat-slow")).toBeNull();
      act(() => {
        jest.advanceTimersByTime(SWORDCAT_HELLO_SLOW_MS + 100);
      });
      expect(host.getAttribute("data-bridge")).toBe("slow");
      expect(screen.getByText(`Still loading ${SWORDCAT_TITLE}…`)).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(SWORDCAT_HELLO_TIMEOUT_MS);
      });
      expect(host.getAttribute("data-bridge")).toBe("timeout");
      expect(screen.getByText(`${SWORDCAT_TITLE} is taking too long to load.`)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Back to games" }).getAttribute("href")).toBe("/game");
      // the game finally answers (hello never stopped): connected, the fallback goes away
      const frame = screen.getByTestId(SWORDCAT_FRAME_TESTID) as HTMLIFrameElement;
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { ns: SWORDCAT_NS, v: 1, type: "ready", version: "1" },
            origin: "https://swordcat.tokentails.com",
            source: frame.contentWindow,
          })
        );
      });
      expect(host.getAttribute("data-bridge")).toBe("ready");
      expect(screen.queryByTestId("swordcat-timeout")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("Reload remounts the frame and starts connecting again", () => {
    jest.useFakeTimers();
    try {
      render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
      const before = screen.getByTestId(SWORDCAT_FRAME_TESTID);
      act(() => {
        jest.advanceTimersByTime(SWORDCAT_HELLO_SLOW_MS + 100);
      });
      fireEvent.click(screen.getByRole("button", { name: "Reload" }));
      expect(screen.getByTestId("swordcat-host").getAttribute("data-bridge")).toBe("connecting");
      expect(screen.getByTestId(SWORDCAT_FRAME_TESTID)).not.toBe(before);
      expect(screen.queryByTestId("swordcat-slow")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows no rotate hint in landscape or with a mouse", () => {
    render(<SwordcatHost url="https://swordcat.tokentails.com/" navigate={jest.fn()} />);
    expect(screen.queryByTestId("swordcat-rotate-hint")).toBeNull();
  });
});

describe("/swordcat page", () => {
  it("redirects to /game and renders nothing when the NEXT_PUBLIC_SWORDCAT kill switch is off", () => {
    const prev = process.env.NEXT_PUBLIC_SWORDCAT;
    process.env.NEXT_PUBLIC_SWORDCAT = "0";
    try {
      const { container } = render(<SwordcatPage />);
      expect(container.innerHTML).toBe("");
      expect(replace).toHaveBeenCalledWith("/game");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SWORDCAT;
      else process.env.NEXT_PUBLIC_SWORDCAT = prev;
    }
  });

  it("renders the host and does not redirect when NEXT_PUBLIC_SWORDCAT is unset (on by default)", () => {
    const prev = process.env.NEXT_PUBLIC_SWORDCAT;
    delete process.env.NEXT_PUBLIC_SWORDCAT;
    replace.mockClear();
    try {
      render(<SwordcatPage />);
      expect(screen.getByTestId("swordcat-host")).toBeTruthy();
      expect(replace).not.toHaveBeenCalledWith("/game");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_SWORDCAT = prev;
    }
  });
});

// ---- Phase TT4: treats through the host (plan §12.1 item 7, §12.2) ------------------------------

const GAME = "https://swordcat.tokentails.com";
const TX = "0x" + "ab".repeat(32);
const LIVE_STATUS = {
  enabled: true,
  railState: "live",
  chainId: 5042,
  amountWei: "10000000000000000",
  remainingTodayWei: "960000000000000000",
  treatsLeftToday: 96,
  resetsAt: "2026-10-16T00:00:00.000Z",
  splitAddress: "0x457c89e10a6e66633Eda5Bf82fD086FEbB5DB147",
  chains: [{ chainId: 5042, main: true, enabled: true, railState: "live", coin: "USDC", amountWei: "10000000000000000", remainingTodayWei: "1", treatsLeftToday: 96, splitAddress: null, explorer: "https://explorer.arc.io" }],
};

// jsdom has no Response: a minimal one with json() and clone().
function json(status: number, body: unknown): Response {
  const make = (): Response =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body, clone: () => make() }) as unknown as Response;
  return make();
}

async function readyHost(treatFetch: jest.Mock) {
  const view = render(<SwordcatHost url={`${GAME}/`} navigate={jest.fn()} treatFetch={treatFetch} />);
  const frame = screen.getByTestId(SWORDCAT_FRAME_TESTID) as HTMLIFrameElement;
  const posted: Array<Record<string, unknown>> = [];
  jest.spyOn(frame.contentWindow!, "postMessage").mockImplementation(((message: unknown, origin: string) => {
    expect(origin).toBe(GAME);
    posted.push(message as Record<string, unknown>);
  }) as never);
  const fromGame = (data: Record<string, unknown>) =>
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { ns: SWORDCAT_NS, v: 1, ...data }, origin: GAME, source: frame.contentWindow }));
    });
  fromGame({ type: "ready", version: "1" });
  // let the rail and me reads resolve
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  return { view, posted, fromGame, settle, ofType: (type: string) => posted.filter((m) => m.type === type) };
}

describe("SwordcatHost treats", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BE_URL = "https://api.test.invalid";
    global.fetch = jest.fn(() => Promise.reject(new Error("no network in tests"))) as never;
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.NEXT_PUBLIC_BE_URL;
  });

  it("maps the rail: live with an amount, exhausted, paused or unknown as soon", () => {
    expect(swordcatRailOf(LIVE_STATUS as never, false)).toEqual({ state: "live", amountLabel: "0.01 USDC" });
    expect(swordcatRailOf(LIVE_STATUS as never, true)).toEqual({ state: "live", amountLabel: "$0.01" });
    expect(swordcatRailOf({ ...LIVE_STATUS, treatsLeftToday: 0, chains: [] } as never, false)).toEqual({ state: "exhausted" });
    expect(swordcatRailOf({ ...LIVE_STATUS, railState: "exhausted", chains: [] } as never, false)).toEqual({ state: "exhausted" });
    expect(swordcatRailOf({ ...LIVE_STATUS, railState: "paused", enabled: false, chains: [] } as never, false)).toEqual({ state: "paused" });
    expect(swordcatRailOf({ ...LIVE_STATUS, railState: "not-deployed", enabled: false, chains: [] } as never, false)).toEqual({ state: "soon" });
    expect(swordcatRailOf(null, false)).toEqual({ state: "soon" });
    expect(treatAmountLabel("0", "USDC", false)).toBeUndefined();
    expect(sentTodayOf({ today: { status: "PENDING" } } as never)).toBe(true);
    expect(sentTodayOf({ today: { status: "FAILED" } } as never)).toBe(false);
    expect(sentTodayOf(null)).toBe(false);
  });

  it("builds receipt links only from a clean response, and none in the app build", () => {
    const body = { txHash: TX, chainId: 5042, amountWei: "10000000000000000", explorerUrl: `https://explorer.arc.io/tx/${TX}` };
    expect(treatReceiptOf(body, false)).toEqual({
      explorerUrl: `https://explorer.arc.io/tx/${TX}`,
      receiptPath: `/shelter-payouts/receipt?chain=5042&tx=${TX}`,
      amountLabel: "0.01 USDC",
    });
    expect(treatReceiptOf(body, true)).toEqual({});
    expect(treatReceiptOf({ txHash: "0x1", chainId: "x", explorerUrl: "http://x" }, false)).toEqual({});
  });

  it("sends treat-state after ready, then one treat per request with receipt links, and treat_sent", async () => {
    mockStatus.mockResolvedValue(LIVE_STATUS);
    const treatFetch = jest.fn(async () =>
      json(200, { txHash: TX, chainId: 5042, amountWei: "10000000000000000", explorerUrl: `https://explorer.arc.io/tx/${TX}` })
    );
    const h = await readyHost(treatFetch);
    expect(h.ofType("treat-state").at(-1)).toEqual({ ns: SWORDCAT_NS, v: 1, type: "treat-state", rail: "live", sentToday: false, amountLabel: "0.01 USDC" });
    h.fromGame({ type: "cat-saved", slot: "pickles", kind: "lost", catId: "6a3055e21d6649b19b03688a", catName: "Judas" });
    h.fromGame({ type: "treat-request", requestId: "r1", slot: "pickles", catId: "6a3055e21d6649b19b03688a", catName: "Judas" });
    h.fromGame({ type: "treat-request", requestId: "r1", slot: "pickles", catName: "Judas" });
    await h.settle();
    expect(treatFetch).toHaveBeenCalledTimes(1);
    const [url, init] = treatFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test.invalid/shelter/donate/guest");
    expect(JSON.parse(String(init.body))).toEqual({ source: "page" });
    const results = h.ofType("treat-result");
    expect(results[0]).toEqual({
      ns: SWORDCAT_NS,
      v: 1,
      type: "treat-result",
      requestId: "r1",
      kind: "sent",
      explorerUrl: `https://explorer.arc.io/tx/${TX}`,
      receiptPath: `/shelter-payouts/receipt?chain=5042&tx=${TX}`,
      amountLabel: "0.01 USDC",
    });
    expect(h.ofType("treat-state").at(-1)!.sentToday).toBe(true);
    expect(mockTrack).toHaveBeenCalledWith({ name: "treat_sent", props: { status: "ok" } });
    // A repeat of an answered request gets the same answer, no new POST.
    h.fromGame({ type: "treat-request", requestId: "r1", slot: "pickles", catName: "Judas" });
    await h.settle();
    expect(treatFetch).toHaveBeenCalledTimes(1);
    expect(h.ofType("treat-result").at(-1)!.kind).toBe("sent");
    // A new request the same day: already-today without a POST.
    h.fromGame({ type: "treat-request", requestId: "r2", slot: "pebble", catName: "Simas" });
    await h.settle();
    expect(treatFetch).toHaveBeenCalledTimes(1);
    expect(h.ofType("treat-result").at(-1)).toEqual({ ns: SWORDCAT_NS, v: 1, type: "treat-result", requestId: "r2", kind: "already-today" });
    expect(global.fetch).not.toHaveBeenCalled();
    for (const m of h.posted) expect(JSON.stringify(m)).not.toMatch(/accesstoken|message/);
  });

  it("starts with sentToday when today's row is on its way, and answers without a POST", async () => {
    mockStatus.mockResolvedValue(LIVE_STATUS);
    mockMe.mockResolvedValue({ today: { status: "SENT" } });
    const treatFetch = jest.fn();
    const h = await readyHost(treatFetch);
    await h.settle();
    expect(h.ofType("treat-state").at(-1)!.sentToday).toBe(true);
    h.fromGame({ type: "treat-request", requestId: "r1", slot: "pickles", catName: "Judas" });
    await h.settle();
    expect(treatFetch).not.toHaveBeenCalled();
    expect(h.ofType("treat-result").at(-1)!.kind).toBe("already-today");
  });

  it.each([
    [429, { code: "DONATE_ALREADY_TODAY", message: "x" }, "already-today"],
    [409, { code: "DONATE_PAUSED", message: "x" }, "paused"],
    [409, { code: "DONATE_BUDGET_SPENT", message: "x" }, "budget-spent"],
    [424, { code: "DONATE_SEND_FAILED", message: "x" }, "failed"],
    [503, { message: "Treats without an account are paused right now." }, "paused"],
    [429, {}, "retry"],
  ])("maps HTTP %s %j to %s with no free text", async (status, body, kind) => {
    mockStatus.mockResolvedValue(LIVE_STATUS);
    const treatFetch = jest.fn(async () => json(status, body));
    const h = await readyHost(treatFetch);
    h.fromGame({ type: "treat-request", requestId: "r9", slot: "pickles", catName: "Judas" });
    await h.settle();
    expect(h.ofType("treat-result").at(-1)).toEqual({ ns: SWORDCAT_NS, v: 1, type: "treat-result", requestId: "r9", kind });
  });

  it("a Try again while a slow send is in flight waits for it and gets the same result, with one POST", async () => {
    mockStatus.mockResolvedValue(LIVE_STATUS);
    let finish: (r: Response) => void = () => undefined;
    const treatFetch = jest.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    const h = await readyHost(treatFetch);
    h.fromGame({ type: "treat-request", requestId: "r1", slot: "pickles", catName: "Judas" });
    await h.settle();
    // the game timed out after 15 s and the player pressed Try again
    h.fromGame({ type: "treat-request", requestId: "r2", slot: "pickles", catName: "Judas" });
    await h.settle();
    expect(h.ofType("treat-result")).toEqual([]);
    finish(json(200, { txHash: TX, chainId: 5042, amountWei: "10000000000000000", explorerUrl: `https://explorer.arc.io/tx/${TX}` }));
    await h.settle();
    expect(treatFetch).toHaveBeenCalledTimes(1);
    const results = h.ofType("treat-result");
    expect(results.map((m) => [m.requestId, m.kind])).toEqual([
      ["r1", "sent"],
      ["r2", "sent"],
    ]);
    expect(results[1].receiptPath).toBe(`/shelter-payouts/receipt?chain=5042&tx=${TX}`);
  });

  it("a sign-in reads today's row again and clears sent-today for the new identity", async () => {
    mockStatus.mockResolvedValue(LIVE_STATUS);
    mockMe.mockResolvedValue({ today: { status: "SENT" } });
    const treatFetch = jest.fn(async () => json(200, { txHash: TX, chainId: 5042 }));
    const h = await readyHost(treatFetch);
    await h.settle();
    expect(h.ofType("treat-state").at(-1)!.sentToday).toBe(true);
    // the guest signs in: the account has no treat today
    mockMe.mockResolvedValue({ today: null });
    mockAuth.mockReturnValue({ user: { isAnonymous: false }, authStatus: "ready" });
    h.view.rerender(<SwordcatHost url={`${GAME}/`} navigate={jest.fn()} treatFetch={treatFetch} />);
    await h.settle();
    expect(h.ofType("treat-state").at(-1)!.sentToday).toBe(false);
    h.fromGame({ type: "treat-request", requestId: "r5", slot: "pickles", catName: "Judas" });
    await h.settle();
    expect(treatFetch).toHaveBeenCalledTimes(1);
    // a failed read keeps what the page knows
    mockMe.mockResolvedValue(null);
    mockAuth.mockReturnValue(undefined);
    h.view.rerender(<SwordcatHost url={`${GAME}/`} navigate={jest.fn()} treatFetch={treatFetch} />);
    await h.settle();
    expect(h.ofType("treat-state").at(-1)!.sentToday).toBe(true);
  });

  it("answers retry when the network fails, and ignores a malformed request", async () => {
    const treatFetch = jest.fn(async () => {
      throw new Error("offline");
    });
    const h = await readyHost(treatFetch);
    h.fromGame({ type: "treat-request", requestId: "bad id", slot: "pickles", catName: "Judas" });
    await h.settle();
    expect(treatFetch).not.toHaveBeenCalled();
    h.fromGame({ type: "treat-request", requestId: "r3", slot: "pickles", catName: "Judas" });
    await h.settle();
    expect(h.ofType("treat-result").at(-1)!.kind).toBe("retry");
    expect(mockTrack).toHaveBeenCalledWith({ name: "treat_sent", props: { status: "offline" } });
  });
});
