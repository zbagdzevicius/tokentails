/**
 * /heist host helpers (plan G2): server progress for the Heist, the frame URL, `heist_open {from}`,
 * the game suspension stand-in, and referral attribution for `/heist?ref=X`.
 */
import { registerHeistSuspension } from "@/components/heist/suspension";
import {
  HEIST_FRAME_PATH,
  heistFrameSrc,
  openedFrom,
  progressFromProfile,
} from "@/components/heist/session";
import { capturePendingRef, PENDING_REF_KEY, sendPendingRefOnPromotion } from "@/context/auth/pendingRef";
import {
  __resetGameRegistryForTests,
  acquireGameSuspension,
  getRegisteredGames,
} from "@/lib/game/gameRegistry";

describe("progressFromProfile", () => {
  it("maps heistScore and heistStars slots to level ids, leaving untouched levels out", () => {
    expect(progressFromProfile({ heistScore: [180, 0, 95], heistStars: [7, 0, 1] })).toEqual({
      levels: {
        "heist-01": { won: true, bestScore: 180, stars: 7 },
        "heist-03": { won: true, bestScore: 95, stars: 1 },
      },
    });
  });

  it("returns null without Heist fields and ignores junk values", () => {
    expect(progressFromProfile(null)).toBeNull();
    expect(progressFromProfile({})).toBeNull();
    expect(progressFromProfile({ heistScore: ["x", -4, null], heistStars: [9] })).toEqual({
      levels: { "heist-01": { won: true, bestScore: 0, stars: 1 } },
    });
  });
});

describe("heistFrameSrc", () => {
  it("always embeds with embed=1 and forwards QA params only when allowed", () => {
    expect(heistFrameSrc("", false)).toBe(`${HEIST_FRAME_PATH}?embed=1`);
    expect(heistFrameSrc("?qa=1&replay=solution", false)).toBe(`${HEIST_FRAME_PATH}?embed=1`);
    expect(heistFrameSrc("?qa=1&replay=solution&level=heist-02&x=1", true)).toBe(
      `${HEIST_FRAME_PATH}?embed=1&qa=1&replay=solution&level=heist-02`
    );
    expect(heistFrameSrc("?replay=solution", true)).toBe(`${HEIST_FRAME_PATH}?embed=1`);
    expect(heistFrameSrc("?qa=1&level=%3Cscript%3E", true)).toBe(`${HEIST_FRAME_PATH}?embed=1&qa=1`);
  });
});

describe("heistFrameSrc payouts deep link", () => {
  it("forwards ?payouts and #payouts to the game, outside the QA gate", () => {
    expect(heistFrameSrc("?payouts", false)).toBe(`${HEIST_FRAME_PATH}?embed=1&payouts=1`);
    expect(heistFrameSrc("?from=landing&payouts=1", false)).toBe(`${HEIST_FRAME_PATH}?embed=1&payouts=1`);
    expect(heistFrameSrc("", false, "#payouts")).toBe(`${HEIST_FRAME_PATH}?embed=1&payouts=1`);
    expect(heistFrameSrc("?payouts=0", false)).toBe(`${HEIST_FRAME_PATH}?embed=1`);
    expect(heistFrameSrc("", false, "#other")).toBe(`${HEIST_FRAME_PATH}?embed=1`);
  });
});

describe("openedFrom", () => {
  it("reads ?from for heist_open, defaulting to direct", () => {
    expect(openedFrom("?from=picker")).toBe("picker");
    expect(openedFrom("")).toBe("direct");
    expect(openedFrom("?from=jane@example.com")).toBe("direct");
  });
});

describe("registerHeistSuspension", () => {
  afterEach(() => __resetGameRegistryForTests());

  it("pauses the Heist while any GameModal holds the suspension, and resumes after the last", () => {
    const events: string[] = [];
    const unregister = registerHeistSuspension({
      onSuspend: () => events.push("pause"),
      onResume: () => events.push("resume"),
    });
    expect(getRegisteredGames()).toHaveLength(1);
    const releaseSheet = acquireGameSuspension();
    const releaseModal = acquireGameSuspension();
    releaseSheet();
    expect(events).toEqual(["pause"]);
    releaseModal();
    expect(events).toEqual(["pause", "resume"]);
    unregister();
    expect(getRegisteredGames()).toHaveLength(0);
  });

  it("starts paused under an open modal and resumes when unregistered", () => {
    const events: string[] = [];
    acquireGameSuspension();
    const unregister = registerHeistSuspension({
      onSuspend: () => events.push("pause"),
      onResume: () => events.push("resume"),
    });
    expect(events).toEqual(["pause"]);
    unregister();
    expect(events).toEqual(["pause", "resume"]);
  });
});

describe("/heist?ref=X referral (F5.7)", () => {
  it("a guest who arrives at /heist?ref=X and signs up later is attributed to X", async () => {
    const map = new Map<string, string>();
    const store = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    };
    const referrer = "64e2e0000000000000000f01";
    // The optional-mode provider on /heist captures `?ref` from the URL (router.query.ref).
    expect(capturePendingRef(new URLSearchParams(`?ref=${referrer}`).get("ref"), null, store)).toBe(referrer);
    // Later, on any page, the first profile after promotion sends it once.
    const send = jest.fn(async () => ({}));
    await expect(sendPendingRefOnPromotion({ _id: "64e2e0000000000000000a01", promotedNow: false }, send, store)).resolves.toBe("skipped");
    await expect(sendPendingRefOnPromotion({ _id: "64e2e0000000000000000a01", promotedNow: true }, send, store)).resolves.toBe("sent");
    expect(send).toHaveBeenCalledWith(referrer);
    expect(map.has(PENDING_REF_KEY)).toBe(false);
  });
});
