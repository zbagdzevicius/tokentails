/**
 * @jest-environment jsdom
 */
/**
 * The /pawlegends host (POC.md §8.2, §11.4, §11.5): the same-origin iframe with `embed=1`, the exit to /game, the
 * kill switch, the store (closed store refuses intents, the sheet's age band, consent and under-16 block, the
 * Checkout redirect), app builds (no store, no purchased items), saves through /live, and the Checkout return.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
const mockAuth = jest.fn((): unknown => undefined);
jest.mock("@/context/FirebaseAuthContext", () => ({
  useOptionalFirebaseAuth: () => mockAuth(),
  FirebaseAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
const mockProfile = jest.fn((): unknown => ({ profile: null }));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => mockProfile(),
}));
const replace = jest.fn(() => Promise.resolve(true));
const mockRouter = {
  replace,
  pathname: "/pawlegends",
  query: {} as Record<string, string>,
  isReady: true,
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
const seoProps = jest.fn();
jest.mock("@/components/seo/SeoHead", () => ({
  SeoHead: (props: unknown) => (seoProps(props), null),
}));
jest.mock("@/components/ui/GameModal", () => ({
  GameModal: ({
    title,
    children,
  }: {
    title: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div role="dialog" aria-label={String(title)}>
      {children}
    </div>
  ),
}));
jest.mock("@/components/ui/modal", () => ({
  ActionRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalButton: (props: Record<string, unknown>) => {
    const rest = Object.fromEntries(
      Object.entries(props).filter(
        ([key]) =>
          !["children", "busy", "icon", "variant", "size"].includes(key)
      )
    );
    return (
      <button type="button" {...rest}>
        {props.children as React.ReactNode}
      </button>
    );
  },
}));

import {
  PawlegendsHost,
  PAWLEGENDS_FRAME_TESTID,
  PAWLEGENDS_PENDING_KEY,
} from "@/components/pawlegends/PawlegendsHost";
import PawlegendsPage from "@/pages/pawlegends";
import PawlegendsTermsPage from "@/pages/pawlegends/terms";
import { PAWLEGENDS_NS } from "@/components/pawlegends/bridge";
import {
  PAWLEGENDS_AGE_KEY,
  PAWLEGENDS_TOKEN_KEY,
  UNDER_16_MESSAGE,
  type PawlegendsApi,
} from "@/components/pawlegends/checkout";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { GameType } from "@/models/game";

const b64url = (value: string) => Buffer.from(value).toString("base64url");
const tokenFor = (skus: string[], items: string[]) =>
  `${b64url(JSON.stringify({ skus, items, expiresAt: 9e15 }))}.${"s".repeat(
    43
  )}`;
const TOKEN = tokenFor(["pl_founder"], ["frame.founder"]);

const REPLAY = {
  v: 1,
  simVersion: 1,
  seed: 7,
  difficulty: "easy",
  hero: "clem",
  trick: "pounce",
  ticks: 9000,
  inputs: "AA==",
  outcome: "won",
  finalHash: "0000abcd",
};

const STATUS_OPEN = {
  ok: true,
  status: 200,
  code: null,
  message: null,
  body: {
    store: true,
    email: true,
    termsVersion: "2026-10-17",
    skus: [
      {
        sku: "pl_founder",
        label: "Pawlegends Founder",
        cents: { usd: 999, eur: 999 },
        deliveredNow: "Founder coats",
        deliveredAtMvp: "Season 1 pass",
      },
    ],
  },
};
const STATUS_CLOSED = {
  ...STATUS_OPEN,
  body: { ...STATUS_OPEN.body, store: false },
};

function fakeApi(
  over: Partial<Record<keyof PawlegendsApi, jest.Mock>> = {}
): PawlegendsApi & Record<string, jest.Mock> {
  const ok = (body: unknown) =>
    jest.fn(async () => ({
      ok: true,
      status: 200,
      code: null,
      message: null,
      body,
    }));
  return {
    status: jest.fn(async () => STATUS_OPEN),
    checkout: ok({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }),
    entitlementsForSession: ok({
      token: TOKEN,
      items: ["frame.founder"],
      skus: ["pl_founder"],
      expiresAt: 1,
    }),
    refresh: ok({
      token: TOKEN,
      items: ["frame.founder"],
      skus: ["pl_founder"],
      expiresAt: 1,
    }),
    restore: ok({ ok: true }),
    verifyRestore: ok({ token: TOKEN, items: [], skus: [], expiresAt: 1 }),
    notify: ok({ ok: true }),
    confirmNotify: ok({ ok: true }),
    ...over,
  } as never;
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });

async function mount(
  props: Partial<React.ComponentProps<typeof PawlegendsHost>> = {}
) {
  const api = (props.api as ReturnType<typeof fakeApi>) ?? fakeApi();
  const navigate = jest.fn();
  const saveMatch = jest.fn(async () => ({
    ok: true,
    status: 201,
    code: null,
  }));
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
  const frame = screen.getByTestId(
    PAWLEGENDS_FRAME_TESTID
  ) as HTMLIFrameElement;
  const posted: Array<Record<string, unknown>> = [];
  const origins: string[] = [];
  jest.spyOn(frame.contentWindow!, "postMessage").mockImplementation(((
    message: unknown,
    origin: string
  ) => {
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
  const last = (type: string) =>
    [...posted].reverse().find((m) => m.type === type);
  return { api, navigate, saveMatch, frame, posted, origins, fromGame, last };
}

beforeEach(() => {
  // Nothing reaches the API: the page's default store client gets a failing fetch (status 0, store closed).
  (globalThis as { fetch?: unknown }).fetch = jest.fn(() =>
    Promise.reject(new Error("no network"))
  );
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
    expect(frame.getAttribute("src")).toBe(
      "/pawlegends-game/index.html?embed=1"
    );
    expect(frame.getAttribute("title")).toBe(PAWLEGENDS_TITLE);
    expect(frame.hasAttribute("sandbox")).toBe(false);
    expect(seoProps).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/pawlegends", noindex: true })
    );
  });

  it("the kill switch sends players to /game", () => {
    process.env.NEXT_PUBLIC_PAWLEGENDS = "0";
    const { container } = render(<PawlegendsPage />);
    expect(container.innerHTML).toBe("");
    expect(replace).toHaveBeenCalledWith("/game");
  });

  it("the terms page states the refund date, withdrawal, age limits and a contact", () => {
    render(<PawlegendsTermsPage />);
    const text = screen.getByTestId("pawlegends-terms").textContent ?? "";
    expect(text).toMatch(/2027-06-30/);
    expect(text).toMatch(/60 days/);
    expect(text).toMatch(/14-day withdrawal/);
    expect(text).toMatch(/€30/);
    expect(text).toMatch(/€200/);
    expect(text).toContain(UNDER_16_MESSAGE);
    expect(text).toMatch(/info@tokentails\.com/);
  });
});

describe("PawlegendsHost", () => {
  it("posts only to its own origin, says the store is open, and the exit goes to /game", async () => {
    const h = await mount();
    expect(h.origins.every((o) => o === window.location.origin)).toBe(true);
    expect(h.last("app")).toMatchObject({ isApp: false, store: true });
    expect(h.last("session")).toMatchObject({ signedIn: false });
    fireEvent.click(screen.getByRole("button", { name: "Back to games" }));
    expect(h.navigate).toHaveBeenCalledWith("/game");
  });

  it("a closed store (missing backend secret) refuses the intent and tells the game", async () => {
    const h = await mount({
      api: fakeApi({ status: jest.fn(async () => STATUS_CLOSED) }),
    });
    expect(h.last("app")).toMatchObject({ store: false });
    h.fromGame({ type: "purchase-intent", sku: "pl_founder" });
    expect(screen.queryByTestId("pawlegends-sheet")).toBeNull();
    expect(h.last("purchase-result")).toMatchObject({
      sku: "pl_founder",
      ok: false,
    });
  });

  it("the sheet shows both delivery lines; Buy needs an age band, an email and consent, then redirects to Checkout", async () => {
    const h = await mount();
    h.fromGame({ type: "purchase-intent", sku: "pl_founder" });
    expect(screen.getByTestId("pawlegends-now").textContent).toBe(
      "Founder coats"
    );
    expect(screen.getByTestId("pawlegends-mvp").textContent).toBe(
      "Season 1 pass"
    );
    expect(
      screen.getByText(/Delivered at MVP launch \(target 2027-04-30\)/)
    ).toBeTruthy();
    const buy = screen.getByTestId("pawlegends-buy") as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("18 or older"));
    expect(buy.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("pawlegends-consent"));
    // The email is required: the age band, the spend cap and the once-only packs are kept with it (§8.5).
    expect(buy.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("pawlegends-email"), {
      target: { value: "cat@example.com" },
    });
    expect(buy.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(buy);
    });
    await settle();
    expect(h.api.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: "pl_founder",
        ageBand: "18+",
        consentVersion: "2026-10-17",
        deviceId: expect.any(String),
        email: "cat@example.com",
      })
    );
    expect(
      Object.keys((h.api.checkout as jest.Mock).mock.calls[0][0])
    ).not.toContain("cents");
    expect(h.navigate).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test_1"
    );
    expect(window.localStorage.getItem(PAWLEGENDS_PENDING_KEY)).toBe(
      "pl_founder"
    );
    expect(window.localStorage.getItem(PAWLEGENDS_AGE_KEY)).toBe("18+");
  });

  it("hides restore and notify when the backend has no email (status.email false)", async () => {
    const noMail = {
      ...STATUS_OPEN,
      body: { ...STATUS_OPEN.body, email: false },
    };
    const h = await mount({
      api: fakeApi({ status: jest.fn(async () => noMail) }),
    });
    h.fromGame({ type: "purchase-intent", sku: "pl_founder" });
    expect(screen.getByTestId("pawlegends-sheet")).toBeTruthy();
    expect(screen.queryByTestId("pawlegends-restore-form")).toBeNull();
    expect(screen.queryByTestId("pawlegends-restore")).toBeNull();
    expect(screen.queryByTestId("pawlegends-notify")).toBeNull();
  });

  it("under 16 blocks the purchase with the guardian line", async () => {
    const h = await mount();
    h.fromGame({ type: "purchase-intent", sku: "pl_founder" });
    fireEvent.click(screen.getByLabelText("Under 16"));
    expect(screen.getByTestId("pawlegends-under16").textContent).toBe(
      UNDER_16_MESSAGE
    );
    expect(
      (screen.getByTestId("pawlegends-buy") as HTMLButtonElement).disabled
    ).toBe(true);
    expect(h.api.checkout).not.toHaveBeenCalled();
  });

  it("closing the sheet answers purchase-result ok:false", async () => {
    const h = await mount();
    h.fromGame({ type: "purchase-intent", sku: "pl_founder" });
    fireEvent.click(screen.getByText("NOT NOW"));
    expect(screen.queryByTestId("pawlegends-sheet")).toBeNull();
    expect(h.last("purchase-result")).toMatchObject({ ok: false });
  });

  it("app builds: no store, no purchased items, intents refused, no store status read", async () => {
    window.localStorage.setItem(PAWLEGENDS_TOKEN_KEY, TOKEN);
    const api = fakeApi();
    const h = await mount({ api, isApp: true });
    expect(api.status).not.toHaveBeenCalled();
    expect(api.refresh).not.toHaveBeenCalled();
    expect(h.last("app")).toMatchObject({ isApp: true, store: false });
    expect(h.last("entitlements")).toMatchObject({ token: null });
    h.fromGame({ type: "purchase-intent", sku: "pl_starter" });
    expect(screen.queryByTestId("pawlegends-sheet")).toBeNull();
    expect(h.last("purchase-result")).toMatchObject({ ok: false });
  });

  it("web builds send the stored token after refreshing it", async () => {
    window.localStorage.setItem(PAWLEGENDS_TOKEN_KEY, TOKEN);
    const h = await mount();
    expect(h.api.refresh).toHaveBeenCalledWith(TOKEN);
    expect(h.last("entitlements")).toMatchObject({ token: TOKEN });
  });

  it("a match result with a Firebase user posts once to /live as PAWLEGENDS", async () => {
    mockAuth.mockReturnValue({
      user: { uid: "uid-1", isAnonymous: true },
      authStatus: "ready",
    });
    const h = await mount();
    h.fromGame({
      type: "match-result",
      replay: REPLAY,
      summary: { takedowns: 3 },
    });
    await settle();
    expect(h.saveMatch).toHaveBeenCalledTimes(1);
    expect(h.saveMatch).toHaveBeenCalledWith({
      type: GameType.PAWLEGENDS,
      pawlegends: REPLAY,
    });
    expect(screen.getByTestId("pawlegends-note").textContent).toBe(
      "Match saved"
    );
  });

  it("without a user the match queues and posts after sign-in", async () => {
    const h = await mount();
    h.fromGame({ type: "match-result", replay: REPLAY });
    await settle();
    expect(h.saveMatch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("tt.pawlegends.queue.v1")).toContain(
      "0000abcd"
    );
  });

  it("sends the signed-in player's cats as the roster", async () => {
    mockAuth.mockReturnValue({
      user: { uid: "uid-1", isAnonymous: false },
      authStatus: "ready",
    });
    mockProfile.mockReturnValue({
      profile: {
        cats: [
          {
            _id: "cat1",
            name: "Mochi",
            type: "FIRE",
            tier: "RARE",
            isStarter: true,
            origin: "starter",
            owner: "uid-1",
          },
        ],
      },
    });
    const h = await mount();
    expect(h.last("session")).toMatchObject({ signedIn: true });
    expect(h.last("roster")).toMatchObject({
      cats: [
        {
          id: "cat1",
          name: "Mochi",
          type: "FIRE",
          tier: "RARE",
          isStarter: true,
          origin: "starter",
        },
      ],
    });
  });

  it("the Checkout return fetches the token, keeps it, and tells the game the purchase landed", async () => {
    window.localStorage.setItem(PAWLEGENDS_PENDING_KEY, "pl_founder");
    mockRouter.query = { checkout: "ok", session_id: "cs_test_abcdefgh1" };
    const pending = fakeApi({
      entitlementsForSession: jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          code: null,
          message: null,
          body: { token: tokenFor([], []), items: [], skus: [], expiresAt: 1 },
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          code: null,
          message: null,
          body: {
            token: TOKEN,
            items: ["frame.founder"],
            skus: ["pl_founder"],
            expiresAt: 1,
          },
        }),
    });
    const h = await mount({ api: pending });
    await settle();
    expect(pending.entitlementsForSession).toHaveBeenCalledWith(
      "cs_test_abcdefgh1"
    );
    expect(
      (pending.entitlementsForSession as jest.Mock).mock.calls.length
    ).toBeGreaterThanOrEqual(2);
    expect(window.localStorage.getItem(PAWLEGENDS_TOKEN_KEY)).toBe(TOKEN);
    expect(window.localStorage.getItem(PAWLEGENDS_PENDING_KEY)).toBeNull();
    expect(h.last("entitlements")).toMatchObject({ token: TOKEN });
    expect(replace).toHaveBeenCalledWith(
      { pathname: "/pawlegends", query: {} },
      undefined,
      { shallow: true, scroll: false }
    );
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
