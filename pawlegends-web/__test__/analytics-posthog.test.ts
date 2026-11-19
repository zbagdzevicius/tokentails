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
  HELD_STORAGE_KEY,
  posthogHost,
  POSTHOG_US_HOST,
  type AnalyticsClient,
  type AnalyticsConsent,
} from "@/analytics/client";
import { pawlegendsAnalyticsConsent, richAnalyticsAllowed, scrubCapture, SESSION_RECORDING, stripUrlQuery } from "@/analytics";
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

function setup(consent: { now: AnalyticsConsent }, apiKey = "phc_test", host?: string, held = memoryStore()) {
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
    heldStore: () => held,
  });
  return { analytics, calls, loads, held };
}

/** An in-memory sessionStorage for the held queue (one per setup, or shared to act as a reload in the same tab). */
function memoryStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
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

describe("first visit: the held queue survives a reload in the same tab", () => {
  it("events held on the landing go out after Allow on /play (a full page load later), in order", async () => {
    const tab = memoryStore();
    const landing = setup({ now: "held" }, "phc_test", undefined, tab);
    landing.analytics.track(event("pawlegends_landing_view"));
    landing.analytics.track(event("pawlegends_landing_cta"));
    expect(JSON.parse(tab.m.get(HELD_STORAGE_KEY)!)).toHaveLength(2);
    expect(landing.loads).toHaveLength(0);
    // the next page of the same tab: a new module instance
    const consent = { now: "held" as AnalyticsConsent };
    const play = setup(consent, "phc_test", undefined, tab);
    play.analytics.track(event("match_start"));
    await flush();
    expect(play.loads).toHaveLength(0);
    consent.now = "granted";
    play.analytics.consentChanged();
    await flush();
    expect(play.calls.filter((c) => c.method === "capture").map((c) => c.args[0])).toEqual(["pawlegends_landing_view", "pawlegends_landing_cta", "match_start"]);
    expect(tab.m.has(HELD_STORAGE_KEY)).toBe(false);
  });

  it("No thanks deletes the stored events: a later page never sends them", async () => {
    const tab = memoryStore();
    const consent = { now: "held" as AnalyticsConsent };
    const one = setup(consent, "phc_test", undefined, tab);
    one.analytics.track(event("pawlegends_landing_view"));
    consent.now = "denied";
    one.analytics.consentChanged();
    expect(tab.m.has(HELD_STORAGE_KEY)).toBe(false);
    const two = setup({ now: "granted" }, "phc_test", undefined, tab);
    two.analytics.init();
    await flush();
    expect(two.calls.filter((c) => c.method === "capture")).toHaveLength(0);
  });

  it("reads back names and flat props only, at most HELD_EVENT_LIMIT", async () => {
    const tab = memoryStore();
    tab.m.set(
      HELD_STORAGE_KEY,
      JSON.stringify([{ name: "match_start", properties: { hero: "clem", nested: { a: 1 }, n: 2 } }, { name: "BAD NAME", properties: {} }, 5])
    );
    const s = setup({ now: "granted" }, "phc_test", undefined, tab);
    s.analytics.init();
    await flush();
    expect(s.calls.filter((c) => c.method === "capture").map((c) => c.args)).toEqual([["match_start", { hero: "clem", n: 2 }]]);
  });

  it("without a token nothing is stored", () => {
    const tab = memoryStore();
    const s = setup({ now: "held" }, "", undefined, tab);
    s.analytics.track(event("pawlegends_landing_view"));
    expect(tab.m.size).toBe(0);
  });
});

describe("replay, heatmaps and surveys", () => {
  it("run only after an explicit Allow, in a web browser", () => {
    expect(richAnalyticsAllowed("granted", () => true)).toBe(true);
    expect(richAnalyticsAllowed(null, () => true)).toBe(false);
    expect(richAnalyticsAllowed("denied", () => true)).toBe(false);
    expect(richAnalyticsAllowed("granted", () => false)).toBe(false);
  });

  it("replays mask every input and personal text, and leave out the game frame and canvases", () => {
    expect(SESSION_RECORDING.maskAllInputs).toBe(true);
    expect(SESSION_RECORDING.blockSelector).toContain("iframe");
    expect(SESSION_RECORDING.blockSelector).toContain("canvas");
    expect(SESSION_RECORDING.maskTextSelector).toContain("data-ph-mask");
    expect(SESSION_RECORDING.recordBody).toBe(false);
    expect(SESSION_RECORDING.recordHeaders).toBe(false);
    const src = readFileSync(resolve(__dirname, "../analytics/index.ts"), "utf8");
    // extensions bundled from our origin, never an external script host; flags stay off
    expect(src).toContain("disable_external_dependency_loading: true");
    expect(src).toContain('import("posthog-js/dist/posthog-recorder")');
    expect(src).toContain("advanced_disable_feature_flags: true");
    expect(src).toContain("enable_recording_console_log: false");
  });

  it("URL props lose their query and hash (party codes, dare seeds); replay snapshots pass untouched", () => {
    expect(stripUrlQuery("https://pawlegends.app/play?party=ABC123#x")).toBe("https://pawlegends.app/play");
    const cr = scrubCapture({
      event: "match_start",
      properties: { $current_url: "https://pawlegends.app/play?party=ABC123", hero: "clem", $set: { $initial_current_url: "https://pawlegends.app/?ref=x" } },
    });
    expect(cr.properties).toEqual({
      $current_url: "https://pawlegends.app/play",
      hero: "clem",
      $set: { $initial_current_url: "https://pawlegends.app/" },
      $geoip_disable: true,
    });
    const snap = { event: "$snapshot", properties: { $current_url: "https://pawlegends.app/play?party=1" } };
    expect(scrubCapture(snap)).toBe(snap);
    expect(snap.properties.$current_url).toContain("?party=1");
  });
});
