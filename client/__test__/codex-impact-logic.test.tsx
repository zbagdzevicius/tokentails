/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/api/api", () => ({
  apiUrl: "http://api.test",
  currentAccessToken: () => "fbtoken",
  apiFetch: jest.fn(),
}));

import {
  maxGive,
  newPledgeId,
  normalizeGoals,
  normalizeMyGives,
  pledgeWithRetry,
  sendPledge,
  currentGoal,
  deliveredGoals,
} from "@/api/rescue-goals-api";
import { fetchTokenStatus, normalizeTokenStatus, POINTS_STATUS, vaultVisible } from "@/api/token-status-api";
import { createTailsExplainer, explainerAllowed, TAILS_EXPLAINER_SEEN_KEY } from "@/components/codex/explainer";
import { giveOptions } from "@/components/codex/impact/RescueGoalCard";
import { sendTreat, TREAT_STATES, treatState, type TreatInputs } from "@/components/codex/impact/treat";
import { treatCopy } from "@/components/codex/impact/TreatCard";
import { resolveProgressTab, visibleProgressTabs } from "@/components/codex/progressTabs";
import { localSeasonTime, seasonFrozen, seasonLeft, seasonOf } from "@/components/codex/season";
import { SeasonBand } from "@/components/codex/SeasonBand";
import { GameType } from "@/models/game";

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const GOAL = {
  id: "g1",
  title: "Winter food",
  deliverable: "Food",
  status: "OPEN",
  expired: false,
  targetTails: 10000,
  raisedTails: 9500,
  remainingTails: 500,
  shelter: { name: "Pink Paw" },
};

const GIVES = normalizeMyGives({
  daily: { cap: 5000, used: 0, left: 5000 },
  balance: { tails: 2400 },
  totals: {},
  eligibility: { eligible: true, open: true },
  limits: { min: 10, max: 5000 },
})!;

describe("PROGRESS tabs (G5)", () => {
  it("IMPACT first; PET ART left out of app builds; VAULT only on web in TOKEN mode", () => {
    expect(visibleProgressTabs({ isApp: false, vault: false })).toEqual([
      "impact",
      "rewards",
      "missions",
      "tiers",
      "pet-art",
      "badges",
    ]);
    expect(visibleProgressTabs({ isApp: true, vault: true })).toEqual(["impact", "rewards", "missions", "tiers", "badges"]);
    expect(visibleProgressTabs({ isApp: false, vault: true })).toContain("vault");
  });

  it("a deep link lands on its tab; an unknown or hidden tab falls back to IMPACT", () => {
    const web = visibleProgressTabs({ isApp: false, vault: false });
    expect(resolveProgressTab("tiers", web)).toBe("tiers");
    expect(resolveProgressTab(null, web)).toBe("impact");
    expect(resolveProgressTab("vault", web)).toBe("impact");
    expect(resolveProgressTab("pet-art", visibleProgressTabs({ isApp: true, vault: false }))).toBe("impact");
  });
});

describe("token-status (Vault, decision #39)", () => {
  it("app builds never call it", async () => {
    const fetchImpl = jest.fn();
    expect(await fetchTokenStatus({ isApp: true, fetchImpl, base: "http://api.test" })).toEqual(POINTS_STATUS);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("any failure is POINTS, and the Vault stays hidden", async () => {
    const offline = jest.fn().mockRejectedValue(new Error("blocked"));
    const status = await fetchTokenStatus({ isApp: false, fetchImpl: offline, base: "http://api.test" });
    expect(status.mode).toBe("POINTS");
    expect(vaultVisible(status, false)).toBe(false);
    const http500 = jest.fn().mockResolvedValue(json(500, {}));
    expect((await fetchTokenStatus({ isApp: false, fetchImpl: http500, base: "http://api.test" })).mode).toBe("POINTS");
    expect(normalizeTokenStatus({ mode: "MOON" })).toEqual(POINTS_STATUS);
  });

  it("TOKEN shows the Vault on the web only", async () => {
    const ok = jest.fn().mockResolvedValue(json(200, { mode: "TOKEN", tgeAt: "2027-01-01T00:00:00Z" }));
    const status = await fetchTokenStatus({ isApp: false, fetchImpl: ok, base: "http://api.test" });
    expect(ok).toHaveBeenCalledWith("http://api.test/user/token-status", expect.anything());
    expect(vaultVisible(status, false)).toBe(true);
    expect(vaultVisible(status, true)).toBe(false);
  });
});

describe("season band (P6)", () => {
  const SEASON = {
    freezeAt: "2026-10-08T22:00:00.000Z",
    resetAt: "2026-10-08T23:00:00.000Z",
    anchorAt: "2026-10-09T00:00:00.000Z",
    startedAt: "2026-09-09T00:00:00.000Z",
    frozen: false,
  };

  it("reads the backend season and rejects a malformed one", () => {
    expect(seasonOf({ season: SEASON })?.freezeAt).toBe(SEASON.freezeAt);
    expect(seasonOf({})).toBeNull();
    expect(seasonOf({ season: { freezeAt: "nope", anchorAt: SEASON.anchorAt } })).toBeNull();
  });

  it("shows 22:00 UTC on the 8th in the viewer's local time", () => {
    expect(localSeasonTime(SEASON.freezeAt, "en-GB", "UTC")).toBe("Thu 8 Oct, 22:00");
    expect(localSeasonTime(SEASON.freezeAt, "en-GB", "Europe/Vilnius")).toBe("Fri 9 Oct, 01:00");
    render(
      <SeasonBand season={seasonOf({ season: SEASON })} now={new Date("2026-09-30T12:00:00Z")} locale="en-GB" timeZone="Asia/Tokyo" />
    );
    expect(screen.getByTestId("season-at").textContent).toBe("Fri 9 Oct, 07:00");
    expect(screen.getByTestId("season-left").textContent).toBe("8d 10h left");
  });

  it("during the freeze it names the next season's start", () => {
    const now = new Date("2026-10-08T22:30:00Z");
    expect(seasonFrozen(SEASON, now)).toBe(true);
    expect(seasonLeft(SEASON.anchorAt, now)).toBe("1h 30m");
    render(<SeasonBand season={SEASON} now={now} locale="en-GB" timeZone="UTC" />);
    expect(screen.getByTestId("season-line").textContent).toContain("The next season starts Fri 9 Oct, 00:00");
  });
});

describe("Rescue Goal gives", () => {
  it("normalises goals and picks the current and delivered ones", () => {
    const goals = normalizeGoals([
      GOAL,
      { ...GOAL, id: "g0", expired: true },
      { bad: true },
      {
        ...GOAL,
        id: "g2",
        status: "DELIVERED",
        delivery: { photoUrl: "https://cdn.test/p.webp", receiptSha256: "a".repeat(64), deliveredAt: "2026-09-01T00:00:00Z", txHash: "0x" + "b".repeat(64) },
      },
    ], "app");
    expect(goals.map((g) => g.id)).toEqual(["g1", "g0", "g2"]);
    expect(currentGoal(goals)?.id).toBe("g1");
    const delivered = deliveredGoals(goals);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].delivery?.txHash).toBeNull(); // app surface: never a hash
  });

  it("MAX is the smallest of balance, today's room, what the goal needs and the limit", () => {
    expect(maxGive({ remainingTails: 500 }, GIVES)).toBe(500);
    expect(maxGive({ remainingTails: 9000 }, GIVES)).toBe(2400);
    const opts = giveOptions(normalizeGoals([GOAL])[0], "registered", GIVES);
    expect(opts.chips.map((c) => [c.key, c.enabled])).toEqual([
      ["100", true],
      ["1000", false],
      ["max", true],
    ]);
    expect(opts.chips[2].label).toBe("MAX 500");
  });

  it("chips are off with a reason when giving is closed or the account is too new", () => {
    const goal = normalizeGoals([GOAL])[0];
    const paused = giveOptions(goal, "registered", { ...GIVES, eligibility: { ...GIVES.eligibility, open: false } });
    expect(paused.chips.every((c) => !c.enabled)).toBe(true);
    expect(paused.note).toMatch(/opens soon/);
    const young = giveOptions(goal, "registered", {
      ...GIVES,
      eligibility: { eligible: false, reason: "not-enough-games", eligibleAt: null, open: true },
    });
    expect(young.note).toMatch(/three games/);
    // Guests keep the chips on: a tap asks them to save their cat.
    expect(giveOptions(goal, "guest", null).chips.every((c) => c.enabled)).toBe(true);
  });

  it("makes RFC 4122 v4 ids, also without crypto.randomUUID", () => {
    expect(newPledgeId()).toMatch(UUID);
    const saved = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      expect(newPledgeId(() => 0.5)).toMatch(UUID);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: saved, configurable: true });
    }
  });

  it("re-sends the same pledge id after an interruption, and stops on success", async () => {
    const pledgeId = newPledgeId();
    const bodies: string[] = [];
    const ok = {
      pledge: { pledgeId, amount: 100, status: "CONFIRMED" },
      replayed: true,
      goal: { id: "g1", status: "OPEN", raisedTails: 9600, targetTails: 10000, remainingTails: 400 },
      balance: { tails: 2300 },
      daily: { cap: 5000, used: 100, left: 4900 },
    };
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(async (_u: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return json(503, { code: "PLEDGE_INTERRUPTED" });
      })
      .mockImplementationOnce(async (_u: string, init: RequestInit) => {
        bodies.push(String(init.body));
        throw new Error("network");
      })
      .mockImplementationOnce(async (_u: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return json(200, ok);
      });
    const outcome = await pledgeWithRetry({ goalId: "g1", amount: 100, pledgeId, fetchImpl }, { wait: async () => undefined });
    expect(outcome.kind).toBe("given");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(bodies.map((b) => JSON.parse(b).pledgeId)).toEqual([pledgeId, pledgeId, pledgeId]);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api.test/rescue-goals/g1/pledge");
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ accesstoken: "fbtoken" });
  });

  it("maps refusals and a goal that filled first", async () => {
    const refuse = jest.fn().mockResolvedValue(json(409, { code: "PLEDGE_DAILY_CAP", message: "cap" }));
    expect(await sendPledge({ goalId: "g1", amount: 100, pledgeId: newPledgeId(), fetchImpl: refuse })).toEqual({
      kind: "refused",
      code: "PLEDGE_DAILY_CAP",
      message: "cap",
    });
    const guest = jest.fn().mockResolvedValue(json(403, { code: "GUEST_FORBIDDEN" }));
    expect((await sendPledge({ goalId: "g1", amount: 100, pledgeId: newPledgeId(), fetchImpl: guest })).kind).toBe("signed-out");
    const refunded = jest.fn().mockResolvedValue(
      json(200, {
        pledge: { pledgeId: "x", amount: 100, status: "REFUNDED" },
        goal: { id: "g1", status: "FILLED", raisedTails: 1, targetTails: 1, remainingTails: 0 },
      })
    );
    expect((await sendPledge({ goalId: "g1", amount: 100, pledgeId: newPledgeId(), fetchImpl: refunded })).kind).toBe("returned");
  });
});

describe("treat card: seven states from DONATE_* codes", () => {
  const RAIL = { enabled: true, state: "live" as const, treatsLeftToday: 10, resetsAt: "2026-10-01T00:00:00Z" };
  const ME = {
    resetsAt: "2026-10-01T00:00:00Z",
    today: null,
    confirmedCount: 0,
    onTheirWayCount: 0,
    eligibility: { eligible: true, reason: null, eligibleAt: null },
  };
  const base: TreatInputs = { viewer: "registered", rail: RAIL, railLoaded: true, me: ME, meLoaded: true, send: null };

  it("covers every state", () => {
    const seen = new Set<string>();
    const cases: Array<[Partial<TreatInputs>, string]> = [
      [{}, "ready"],
      [{ send: { kind: "sent" } }, "on-its-way"],
      [{ send: { kind: "sent" }, me: { ...ME, today: { status: "PENDING" } } }, "on-its-way"],
      // Sent, then the refetched row says the treat arrived.
      [{ send: { kind: "sent" }, me: { ...ME, today: { status: "CONFIRMED" } } }, "sent-today"],
      [{ me: { ...ME, today: { status: "SENT" } } }, "on-its-way"],
      [{ send: { kind: "already-today" } }, "sent-today"],
      [{ me: { ...ME, today: { status: "CONFIRMED" } } }, "sent-today"],
      // Guests may send too (Oct 8, 2026).
      [{ viewer: "guest" }, "ready"],
      [{ me: { ...ME, eligibility: { eligible: false, reason: "account-too-new", eligibleAt: null } } }, "not-eligible"],
      [{ send: { kind: "paused" } }, "paused"],
      [{ rail: { ...RAIL, state: "not-deployed", enabled: false } }, "paused"],
      [{ rail: null }, "paused"],
      [{ send: { kind: "budget-spent" } }, "budget-spent"],
      [{ rail: { ...RAIL, state: "exhausted", treatsLeftToday: 0 } }, "budget-spent"],
      [{ send: { kind: "failed" } }, "failed"],
      [{ me: { ...ME, today: { status: "FAILED" } } }, "failed"],
    ];
    for (const [patch, kind] of cases) {
      const state = treatState({ ...base, ...patch });
      expect([JSON.stringify(patch), state.kind]).toEqual([JSON.stringify(patch), kind]);
      seen.add(state.kind);
      expect(treatCopy(state, "Pink Paw").line).not.toMatch(/USDC|wallet|explorer|hash/i);
    }
    expect(Array.from(seen).sort()).toEqual([...TREAT_STATES].sort());
    expect(treatState({ ...base, railLoaded: false }).kind).toBe("loading");
  });

  it("a guest token refused by the account route sends on the no-account route (Oct 8, 2026)", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(403, { code: "GUEST_FORBIDDEN" }))
      .mockResolvedValueOnce(json(200, {}));
    expect(await sendTreat({ fetchImpl })).toEqual({ kind: "sent" });
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api.test/shelter/donate");
    expect(fetchImpl.mock.calls[1][0]).toBe("http://api.test/shelter/donate/guest");
    expect((fetchImpl.mock.calls[1][1] as RequestInit).headers).not.toHaveProperty("accesstoken");
  });

  it("maps the donate codes", async () => {
    const answer = (status: number, body: unknown) => jest.fn().mockResolvedValue(json(status, body));
    expect(await sendTreat({ fetchImpl: answer(200, {}) })).toEqual({ kind: "sent" });
    expect(await sendTreat({ fetchImpl: answer(429, { code: "DONATE_ALREADY_TODAY" }) })).toEqual({ kind: "already-today" });
    expect(await sendTreat({ fetchImpl: answer(409, { code: "DONATE_PAUSED" }) })).toEqual({ kind: "paused" });
    expect(await sendTreat({ fetchImpl: answer(409, { code: "DONATE_BUDGET_SPENT" }) })).toEqual({ kind: "budget-spent" });
    expect(await sendTreat({ fetchImpl: answer(424, { code: "DONATE_SEND_FAILED" }) })).toEqual({ kind: "failed" });
    expect(await sendTreat({ fetchImpl: answer(403, { code: "DONATE_NOT_ELIGIBLE", reason: "account-too-new" }) })).toEqual({
      kind: "not-eligible",
      reason: "account-too-new",
      eligibleAt: null,
    });
    expect(await sendTreat({ fetchImpl: answer(429, {}) })).toEqual({ kind: "retry" });
    const send = answer(200, {});
    await sendTreat({ fetchImpl: send });
    expect(JSON.parse(String((send.mock.calls[0][1] as RequestInit).body))).toEqual({ source: "page" });
  });
});

describe("Tails explainer queue", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it("waits during a running scene and opens on a menu or game-over screen", () => {
    const store = memory();
    const queue = createTailsExplainer(() => store);
    expect(queue.request()).toBe(true);
    const running = { gameType: GameType.MATCH_3, isStarted: true, gameStop: null };
    expect(queue.shouldShow(running)).toBe(false);
    expect(queue.pending()).toBe(true);
    expect(queue.shouldShow({ ...running, gameStop: { points: 3 } })).toBe(true);
    expect(queue.shouldShow({ gameType: null })).toBe(true);
    expect(explainerAllowed({ gameType: GameType.MATCH_3, isStarted: false })).toBe(true);
    queue.dismiss();
    expect(store.data.get(TAILS_EXPLAINER_SEEN_KEY)).toBe("1");
    expect(queue.request()).toBe(false);
    expect(queue.shouldShow(null)).toBe(false);
  });

  it("survives blocked storage", () => {
    const queue = createTailsExplainer(() => {
      throw new Error("blocked");
    });
    expect(queue.request()).toBe(true);
    queue.dismiss();
    expect(queue.seen()).toBe(true);
  });
});
