/**
 * pawlegends.app's coarse country for PostHog (analytics/country.ts, docs/plans/moba/POSTHOG-PRIVACY.md): GeoIP stays
 * off, events carry our own ISO `country` (the game's flag cache, this tab's answer, or the backend's
 * `/pawlegends/flag/here`), identified persons get it as `$set`, and unknown means no `country` at all.
 */
import { addCountry, cleanCountry, COUNTRY_SESSION_KEY, GAME_FLAG_KEY, gameFlagCountry, loadCountry, setCountryForTests } from "@/analytics/country";
import { scrubCapture } from "@/analytics";

const kv = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const NOW = 1_700_000_000_000;

describe("country for analytics", () => {
  afterEach(() => setCountryForTests(null));

  it("accepts only a real ISO alpha-2 code", () => {
    expect(cleanCountry("LT")).toBe("LT");
    for (const bad of ["XX", "T1", "lt", "LTU", "", null, 7, "1.2.3.4"]) expect(cleanCountry(bad)).toBeNull();
  });

  it("uses the game's fresh flag cache first (hidden flags too), without a network call", async () => {
    const fetch = jest.fn();
    const local = kv({ [GAME_FLAG_KEY]: JSON.stringify({ cc: "LT", at: NOW - 1000 }), "pl.flagHide": "1" });
    expect(await loadCountry({ apiBase: "https://api.example", fetch, local, session: kv(), now: () => NOW })).toBe("LT");
    expect(fetch).not.toHaveBeenCalled();
    expect(gameFlagCountry(JSON.stringify({ cc: "LT", at: NOW - 13 * 3_600_000 }), NOW)).toBeNull();
    expect(gameFlagCountry("not json", NOW)).toBeNull();
  });

  it("otherwise asks the backend once per tab, with no credentials, and keeps only the code", async () => {
    const fetch = jest.fn(async () => ({ ok: true, json: async () => ({ cc: "DE" }) }));
    const session = kv();
    expect(await loadCountry({ apiBase: "https://api.example/", fetch, local: kv(), session, now: () => NOW })).toBe("DE");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/pawlegends/flag/here");
    expect(init.credentials).toBe("omit");
    expect(session.m.get(COUNTRY_SESSION_KEY)).toBe("DE");
    setCountryForTests(null);
    expect(await loadCountry({ apiBase: "https://api.example", fetch, local: kv(), session, now: () => NOW })).toBe("DE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("unknown, an error or a slow backend: no country (never a guess)", async () => {
    const unknown = jest.fn(async () => ({ ok: true, json: async () => ({ cc: null }) }));
    expect(await loadCountry({ apiBase: "https://api.example", fetch: unknown, local: kv(), session: kv() })).toBeNull();
    const failing = jest.fn(async () => {
      throw new Error("down");
    });
    expect(await loadCountry({ apiBase: "https://api.example", fetch: failing, local: kv(), session: kv() })).toBeNull();
    const slow = jest.fn(() => new Promise<never>(() => undefined));
    expect(await loadCountry({ apiBase: "https://api.example", fetch: slow, local: kv(), session: kv(), timeoutMs: 5 })).toBeNull();
    expect(await loadCountry({ apiBase: "", fetch: unknown, local: kv(), session: kv() })).toBeNull();
  });

  it("every event carries it with GeoIP still off; the person only for an identified player", () => {
    setCountryForTests("LT");
    const anon = scrubCapture({ event: "match_start", properties: { hero: "clem", $process_person_profile: false } });
    expect(anon.properties).toEqual({ hero: "clem", $process_person_profile: false, $geoip_disable: true, country: "LT" });
    expect((anon as { $set?: unknown }).$set).toBeUndefined();
    const known = scrubCapture({ event: "match_end", properties: { $process_person_profile: true }, $set: { a: 1 } as Record<string, unknown> });
    expect(known.$set).toEqual({ a: 1, country: "LT" });
    const ident = scrubCapture({ event: "$identify", properties: {} });
    expect((ident as { $set?: unknown }).$set).toEqual({ country: "LT" });
    const snap = { event: "$snapshot", properties: {} as Record<string, unknown> };
    expect(scrubCapture(snap).properties.country).toBeUndefined();
  });

  it("no known country: an event prop of that name is dropped, nothing set on the person", () => {
    const cr = addCountry({ event: "x", properties: { country: "FR", $process_person_profile: true } as Record<string, unknown> }, null);
    expect(cr.properties).toEqual({ $process_person_profile: true });
    expect((cr as { $set?: unknown }).$set).toBeUndefined();
  });
});
