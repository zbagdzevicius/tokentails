/**
 * pawlegends.app on the one Token Tails PostHog project: the env names (NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
 * NEXT_PUBLIC_POSTHOG_HOST, US Cloud by default), consent gating that follows the Paw Legends consent bar exactly like
 * GTM (nothing loads or leaves before Allow where the bar asks; No thanks drops it), and one identity: a signed-in account
 * is identified by a hash of its uid (never the uid or an email), sign-out resets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountDistinctId,
  createAnalytics,
  HELD_EVENT_LIMIT,
  posthogHost,
  POSTHOG_US_HOST,
  type AnalyticsClient,
  type AnalyticsConsent,
} from "@/analytics/client";
import { pawlegendsAnalyticsConsent } from "@/analytics";
import { PAWLEGENDS_GAME_EVENTS } from "@/analytics/pawlegends-events";

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeClient() {
  const calls: { method: string; args: unknown[] }[] = [];
  const client: AnalyticsClient = {
    capture: (...args) => calls.push({ method: "capture", args }),
    register: (...args) => calls.push({ method: "register", args }),
    identify: (...args) => calls.push({ method: "identify", args }),
    reset: (...args) => calls.push({ method: "reset", args }),
    get_distinct_id: () => "anon-1",
  };
  return { client, calls };
}

function setup(consent: { now: AnalyticsConsent }, apiKey = "phc_test", host?: string) {
  const { client, calls } = fakeClient();
  const loads: { apiKey: string; host: string }[] = [];
  const analytics = createAnalytics({
    apiKey,
    host,
    consent: () => consent.now,
    load: async (k, h) => {
      loads.push({ apiKey: k, host: h });
      return client;
    },
    superProperties: () => ({ app: "core", platform: "web" as never, device_tier: "high" }),
    hash: async (text) => `hash(${text})`.padEnd(80, "0"),
  });
  return { analytics, calls, loads };
}

const event = (name: string) => ({ name, properties: {} }) as never;

describe("env wiring", () => {
  it("reads NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN and NEXT_PUBLIC_POSTHOG_HOST, never the old key name", () => {
    const src = readFileSync(resolve(__dirname, "../analytics/index.ts"), "utf8");
    expect(src).toContain("process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN");
    expect(src).toContain("process.env.NEXT_PUBLIC_POSTHOG_HOST");
    expect(src).not.toContain("NEXT_PUBLIC_POSTHOG_KEY");
    expect(src).toContain('person_profiles: "identified_only"');
  });

  it("the host comes from env, https only, with the US host as the fallback", async () => {
    expect(POSTHOG_US_HOST).toBe("https://us.i.posthog.com");
    expect(posthogHost("https://us.i.posthog.com/")).toBe("https://us.i.posthog.com");
    for (const bad of [undefined, "", "http://us.i.posthog.com", "nonsense"]) expect(posthogHost(bad)).toBe(POSTHOG_US_HOST);
    const consent = { now: "granted" as AnalyticsConsent };
    const { analytics, loads } = setup(consent, "phc_test");
    expect(analytics.host).toBe(POSTHOG_US_HOST);
    analytics.init();
    await flush();
    expect(loads).toEqual([{ apiKey: "phc_test", host: POSTHOG_US_HOST }]);
  });

  it("without a token nothing loads", async () => {
    const { analytics, loads } = setup({ now: "granted" }, "");
    analytics.init();
    analytics.track(event("pawlegends_landing_view"));
    await flush();
    expect(analytics.enabled).toBe(false);
    expect(loads).toHaveLength(0);
  });
});

describe("consent gating", () => {
  it("held: posthog-js is not loaded and nothing is captured; Allow sends what waited, in order", async () => {
    const consent = { now: "held" as AnalyticsConsent };
    const { analytics, calls, loads } = setup(consent);
    analytics.init();
    analytics.track(event("pawlegends_landing_view"));
    analytics.track(event("pawlegends_landing_cta"));
    await flush();
    expect(loads).toHaveLength(0);
    expect(calls).toHaveLength(0);
    consent.now = "granted";
    analytics.consentChanged();
    await flush();
    expect(loads).toHaveLength(1);
    expect(calls.filter((c) => c.method === "capture").map((c) => c.args[0])).toEqual(["pawlegends_landing_view", "pawlegends_landing_cta"]);
  });

  it("keeps at most HELD_EVENT_LIMIT events while held", async () => {
    const consent = { now: "held" as AnalyticsConsent };
    const { analytics, calls } = setup(consent);
    for (let i = 0; i < HELD_EVENT_LIMIT + 10; i++) analytics.track(event("match_start"));
    consent.now = "granted";
    analytics.consentChanged();
    await flush();
    expect(calls.filter((c) => c.method === "capture")).toHaveLength(HELD_EVENT_LIMIT);
  });

  it("No thanks drops the queue and nothing is ever loaded", async () => {
    const consent = { now: "held" as AnalyticsConsent };
    const { analytics, calls, loads } = setup(consent);
    analytics.track(event("pawlegends_landing_view"));
    consent.now = "denied";
    analytics.consentChanged();
    analytics.track(event("match_start"));
    analytics.identify("uid-1");
    await flush();
    expect(loads).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("follows the bar like GTM: a choice wins; with none, asked visitors are held and others granted; never in the app", () => {
    const web = () => true;
    expect(pawlegendsAnalyticsConsent(null, () => true, web)).toBe("held");
    expect(pawlegendsAnalyticsConsent(null, () => false, web)).toBe("granted");
    expect(pawlegendsAnalyticsConsent("granted", () => true, web)).toBe("granted");
    expect(pawlegendsAnalyticsConsent("denied", () => false, web)).toBe("denied");
    expect(pawlegendsAnalyticsConsent("granted", () => false, () => false)).toBe("denied");
  });
});

describe("identity", () => {
  it("identifies a signed-in account by a hash of its uid, never the uid itself", async () => {
    const id = await accountDistinctId("firebase-uid-123", async (t) => (t === "pawlegends:firebase-uid-123" ? "a".repeat(64) : "b".repeat(64)));
    expect(id).toBe(`pl_${"a".repeat(32)}`);
    const real = await accountDistinctId("firebase-uid-123");
    expect(real).toMatch(/^pl_[0-9a-f]{32}$/);
    expect(real).not.toContain("firebase-uid-123");
  });

  it("an identify before consent waits; after Allow it is applied once; sign-out resets", async () => {
    const consent = { now: "held" as AnalyticsConsent };
    const { analytics, calls } = setup(consent);
    analytics.identify("uid-1");
    await flush();
    expect(calls).toHaveLength(0);
    consent.now = "granted";
    analytics.consentChanged();
    await flush();
    await flush();
    const identifies = calls.filter((c) => c.method === "identify");
    expect(identifies).toHaveLength(1);
    expect(String(identifies[0]!.args[0])).toMatch(/^pl_/);
    expect(String(identifies[0]!.args[0])).not.toContain("uid-1@");
    analytics.identify("uid-1");
    await flush();
    expect(calls.filter((c) => c.method === "identify")).toHaveLength(1);
    expect(analytics.distinctId()).toBe("anon-1");
    analytics.reset();
    expect(calls.filter((c) => c.method === "reset")).toHaveLength(1);
    // a guest's sign-out (never identified) keeps its anonymous id
    analytics.reset();
    expect(calls.filter((c) => c.method === "reset")).toHaveLength(1);
  });
});

describe("funnel events relayed from the game", () => {
  it("the host allowlist carries the play path, unlocks, chat, settings and invites", () => {
    for (const e of ["title_view", "play_open", "play_start", "practice_try", "match_start", "match_end", "second_match", "mode_unlock", "champ_unlock", "store_open", "checkout_start", "store_item_granted", "party_share", "party_invite", "chat_open", "settings_change"])
      expect(PAWLEGENDS_GAME_EVENTS).toContain(e);
  });
});
