/**
 * @jest-environment jsdom
 *
 * useImpact and the impact fallback chain (plan G11): CDN impact.json, then GET /impact, then the
 * bundled baseline; 3 s abort per source; no retry on 429; snapshot normalisation.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  baselineImpact,
  formatUnits18,
  IMPACT_TIMEOUT_MS,
  loadImpact,
  loadImpactForPage,
  ImpactResult,
  isDevBaseline,
  isDevHost,
  LoadImpactOptions,
  normalizeImpact,
  railCopyState,
  railIsDeployed,
  resetImpactRateLimits,
} from "@/api/impact-api";
import { RAIL_CHIP_COPY } from "@/components/claims/rail-copy";
import { useImpact } from "@/hooks/useImpact";
import baseline from "@/public/impact/snapshot.json";

const CDN = "https://cdn.test/impact/impact.json";
const API = "https://api.test/impact";
const SOURCES = [
  { source: "cdn" as const, url: CDN },
  { source: "api" as const, url: API },
];

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    ...(baseline as Record<string, unknown>),
    _baseline: undefined,
    ...overrides,
  };
}

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => resetImpactRateLimits());

describe("normalizeImpact", () => {
  it("keeps well-formed outcomes and pledge rows, newest first, and drops the rest", () => {
    const impact = normalizeImpact({
      ...baseline,
      outcomes: {
        published: 2,
        items: [
          { id: "a", type: "treatment", date: "2026-09-01", animalName: "Mila", amountWei: "1000", symbol: "USDC", tier: "shelter-confirmed" },
          { id: "b", type: "adoption", date: "2026-09-20", animalName: "Tom" },
          { type: "adoption" },
          "junk",
          { id: "c", type: "supplies", date: "2026-09-10", amountWei: "1.5", symbol: "USDC" },
        ],
      },
      pledges: {
        status: "active",
        rows: [
          { month: "2026-08", symbol: "USDC", pledgedWei: "10", paidWei: "10" },
          { month: "2026-09", symbol: "USDC", pledgedWei: "10", paidWei: "4" },
          { month: "Sept", symbol: "USDC", pledgedWei: "1", paidWei: "1" },
          { month: "2026-07", symbol: "USDC", pledgedWei: "-1", paidWei: "0" },
        ],
      },
    })!;
    expect(impact.outcomes.items.map((o) => o.id)).toEqual(["b", "c", "a"]);
    // A non-integer amount is dropped, with its symbol.
    expect(impact.outcomes.items[1]).toMatchObject({ amountWei: null, symbol: null });
    expect(impact.pledges.rows.map((r) => r.month)).toEqual(["2026-09", "2026-08"]);
  });

  it("accepts the committed baseline and keeps its stamp", () => {
    const n = normalizeImpact(baseline);
    expect(n?._v).toBe(1);
    expect(n?._baseline?.stampedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(baselineImpact()?.source).toBe("baseline");
  });

  it("rejects other versions and missing dates", () => {
    expect(normalizeImpact({ ...snapshot(), _v: 2 })).toBeNull();
    expect(normalizeImpact({ ...snapshot(), generatedAt: "nope" })).toBeNull();
    expect(normalizeImpact(null)).toBeNull();
    expect(normalizeImpact([])).toBeNull();
  });

  it("fills a partial snapshot with safe values and drops bad country codes", () => {
    const n = normalizeImpact({
      _v: 1,
      generatedAt: "2026-10-01T00:00:00.000Z",
      shelters: {
        countries: ["LT", "lt", "XYZ", 4],
        items: [{ slug: "a", name: "A", countryCode: "es" }],
      },
      money: { bySymbol: { USDC: "100", BAD: "1.5" } },
    });
    expect(n).not.toBeNull();
    expect(n!.shelters.countries).toEqual(["LT"]);
    expect(n!.shelters.items[0].countryCode).toBeNull();
    expect(n!.money.bySymbol).toEqual({ USDC: "100" });
    expect(n!.rail.state).toBe("not-deployed");
    expect(n!.players.registeredAllTime).toBeNull();
    expect(n!.money.custody).toBe("held-by-token-tails");
  });
});

describe("normalizeImpact: hashes and addresses", () => {
  const TX = "0x" + "ab".repeat(32);
  const ADDR = "0x" + "cd".repeat(20);
  it("keeps well-formed tx hashes and addresses", () => {
    const n = normalizeImpact(
      snapshot({
        money: { lastTxHash: TX },
        chain: { chainId: 5042, contract: ADDR },
        rail: { state: "live", splitAddress: ADDR },
        outcomes: { published: 1, items: [{ id: "o", type: "food", date: "2026-09-01T00:00:00Z", payoutTxHash: TX }] },
      })
    )!;
    expect(n.money.lastTxHash).toBe(TX);
    expect(n.chain.contract).toBe(ADDR);
    expect(n.rail.splitAddress).toBe(ADDR);
    expect(n.outcomes.items[0].payoutTxHash).toBe(TX);
  });

  it.each([
    ["javascript:alert(1)"],
    ["0x1234"],
    ["0x" + "g".repeat(64)],
    [TX + "/../evil"],
    ["<b>hi</b>"],
    [42],
  ])("drops a bad or tampered value %p to null", (bad) => {
    const n = normalizeImpact(
      snapshot({
        money: { lastTxHash: bad },
        chain: { chainId: 5042, contract: bad },
        rail: { state: "live", splitAddress: bad },
        shelters: { items: [{ slug: "s", name: "S", publicWallet: bad }] },
        outcomes: { published: 1, items: [{ id: "o", type: "food", date: "2026-09-01T00:00:00Z", payoutTxHash: bad }] },
      })
    )!;
    expect(n.money.lastTxHash).toBeNull();
    expect(n.chain.contract).toBeNull();
    expect(n.rail.splitAddress).toBeNull();
    expect(n.shelters.items[0].publicWallet).toBeNull();
    expect(n.outcomes.items[0].payoutTxHash).toBeNull();
  });
});

describe("rail copy state", () => {
  it("reads each rail state the same way on every surface", () => {
    expect(railCopyState("not-deployed")).toBe("soon");
    expect(railCopyState(null)).toBe("soon");
    expect(railCopyState("paused")).toBe("paused");
    expect(railCopyState("live")).toBe("open");
    expect(railCopyState("exhausted")).toBe("exhausted");
    expect(railIsDeployed("paused")).toBe(true);
    expect(railIsDeployed("not-deployed")).toBe(false);
    expect(RAIL_CHIP_COPY.paused).not.toMatch(/soon/);
    expect(RAIL_CHIP_COPY.paused).toMatch(/paused/);
  });
});

describe("loadImpact fallback chain", () => {
  it("uses the CDN when it answers", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [string]>(async () =>
      response(200, snapshot({ bucket: "cdn" }))
    );
    const result = await loadImpact({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sources: SOURCES,
      baseline,
    });
    expect(result?.source).toBe("cdn");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(CDN);
  });

  it("falls back to the API, then to the baseline", async () => {
    const api = jest.fn(async (url: string) =>
      url === CDN
        ? response(404, {})
        : response(200, snapshot({ bucket: "api" }))
    );
    expect(
      (
        await loadImpact({
          fetchImpl: api as unknown as typeof fetch,
          sources: SOURCES,
          baseline,
        })
      )?.source
    ).toBe("api");

    const down = jest.fn(async () => {
      throw new TypeError("network");
    });
    const result = await loadImpact({
      fetchImpl: down as unknown as typeof fetch,
      sources: SOURCES,
      baseline,
    });
    expect(result?.source).toBe("baseline");
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("ignores an invalid body and moves on", async () => {
    const fetchImpl = jest.fn(async (url: string) =>
      url === CDN ? response(200, { _v: 99 }) : response(200, snapshot())
    );
    expect(
      (
        await loadImpact({
          fetchImpl: fetchImpl as unknown as typeof fetch,
          sources: SOURCES,
        })
      )?.source
    ).toBe("api");
  });

  it("never shows a dev-sourced baseline in a production build", async () => {
    const fetchImpl = jest.fn(async () => response(500, {}));
    const dev = { ...baseline, _baseline: { stampedAt: "2026-10-01T00:00:00Z", from: "localhost:3005" } };
    const prod = { ...baseline, _baseline: { stampedAt: "2026-10-01T00:00:00Z", from: "api.tokentails.com" } };
    expect(isDevBaseline(normalizeImpact(dev))).toBe(true);
    expect(isDevBaseline(normalizeImpact(prod))).toBe(false);
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(await loadImpact({ fetchImpl, sources: SOURCES, baseline: dev })).toBeNull();
      expect((await loadImpact({ fetchImpl, sources: SOURCES, baseline: prod }))?.source).toBe("baseline");
    } finally {
      env.NODE_ENV = previous;
    }
    // Dev and test builds keep it, for offline work.
    expect((await loadImpact({ fetchImpl, sources: SOURCES, baseline: dev }))?.source).toBe("baseline");
  });

  it("recognises local dev hosts", () => {
    for (const h of ["localhost:3005", "127.0.0.1:3005", "[::1]:3005", "app.localhost", "0.0.0.0"]) {
      expect([h, isDevHost(h)]).toEqual([h, true]);
    }
    for (const h of ["api.tokentails.com", "tokentails.com", "", null]) {
      expect([h, isDevHost(h)]).toEqual([h, false]);
    }
  });

  it("returns null with no source and no baseline", async () => {
    const fetchImpl = jest.fn(async () => response(500, {}));
    expect(await loadImpact({ fetchImpl, sources: SOURCES })).toBeNull();
  });

  it("aborts a hanging source after 3 s and tries the next", async () => {
    jest.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
        signals.push(init!.signal!);
        if (url === API) return Promise.resolve(response(200, snapshot()));
        return new Promise<Response>((_, reject) => {
          init!.signal!.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        });
      });
      const pending = loadImpact({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sources: SOURCES,
      });
      await act(async () => {
        jest.advanceTimersByTime(IMPACT_TIMEOUT_MS - 1);
      });
      expect(signals[0].aborted).toBe(false);
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(signals[0].aborted).toBe(true);
      await expect(pending).resolves.toMatchObject({ source: "api" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("never retries a 429 and skips that source until Retry-After", async () => {
    let now = 1_000_000;
    const fetchImpl = jest.fn(async (url: string) =>
      url === API
        ? response(429, {}, { "retry-after": "60" })
        : response(503, {})
    );
    const opts = {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sources: SOURCES,
      baseline,
      now: () => now,
    };
    expect((await loadImpact(opts))?.source).toBe("baseline");
    expect(fetchImpl.mock.calls.filter(([u]) => u === API)).toHaveLength(1);
    await loadImpact(opts);
    expect(fetchImpl.mock.calls.filter(([u]) => u === API)).toHaveLength(1);
    now += 61_000;
    await loadImpact(opts);
    expect(fetchImpl.mock.calls.filter(([u]) => u === API)).toHaveLength(2);
  });

  it("rejects when the caller aborts", async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn(
      (_: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init!.signal!.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const pending = loadImpact({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sources: SOURCES,
      signal: controller.signal,
      baseline,
    });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });
});

describe("loadImpact with an already-aborted signal", () => {
  it("sends no request and rejects", async () => {
    resetImpactRateLimits();
    const fetchImpl = jest.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadImpact({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sources: SOURCES,
        signal: controller.signal,
        baseline,
      })
    ).rejects.toBeDefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("loadImpactForPage", () => {
  it("reads only the committed baseline in app builds", async () => {
    const spy = jest.fn();
    const original = global.fetch;
    global.fetch = spy as unknown as typeof fetch;
    try {
      const result = await loadImpactForPage(true);
      expect(result?.source).toBe("baseline");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      global.fetch = original;
    }
  });
});

describe("useImpact", () => {
  it("renders initial data and does not fetch on the web", () => {
    const load = jest.fn();
    const initial = baselineImpact();
    const { result } = renderHook(() => useImpact({ initial, load }));
    expect(result.current.impact).toBe(initial!.impact);
    expect(result.current.loading).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("fetches without initial data and passes the baseline and a 3 s timeout", async () => {
    const fresh = normalizeImpact(snapshot({ bucket: "fresh" }))!;
    const load = jest.fn<Promise<ImpactResult>, [LoadImpactOptions]>(async () => ({
      impact: fresh,
      source: "api" as const,
    }));
    const { result } = renderHook(() => useImpact({ load }));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe("api");
    expect(result.current.impact?.bucket).toBe("fresh");
    expect(load.mock.calls[0][0]).toMatchObject({ timeoutMs: 3000 });
    expect(normalizeImpact(load.mock.calls[0][0].baseline)).not.toBeNull();
  });

  it("refetches in app builds and keeps live data over an older baseline", async () => {
    const previous = process.env.NEXT_PUBLIC_IS_APP;
    process.env.NEXT_PUBLIC_IS_APP = "true";
    try {
      const live = {
        impact: normalizeImpact(snapshot({ bucket: "live" }))!,
        source: "cdn" as const,
      };
      const load = jest.fn(async () => baselineImpact());
      const { result } = renderHook(() => useImpact({ initial: live, load }));
      await waitFor(() => expect(load).toHaveBeenCalled());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.source).toBe("cdn");
      expect(result.current.impact?.bucket).toBe("live");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_IS_APP;
      else process.env.NEXT_PUBLIC_IS_APP = previous;
    }
  });

  it("does not refetch when the caller passes a new inline load on each render", async () => {
    const calls = jest.fn();
    const { result, rerender } = renderHook(() =>
      useImpact({
        load: async () => {
          calls();
          return baselineImpact();
        },
      })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender();
    rerender();
    await act(async () => {});
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("aborts on unmount", async () => {
    let signal: AbortSignal | undefined;
    const load = jest.fn((opts: { signal?: AbortSignal }) => {
      signal = opts.signal;
      return new Promise<null>(() => {});
    });
    const { unmount } = renderHook(() => useImpact({ load }));
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe("formatUnits18", () => {
  it.each([
    ["0", "0.00"],
    ["1230000000000000000", "1.23"],
    ["5000000000000000", "0.01"],
    ["4999999999999999", "0.00"],
    ["1234567000000000000000", "1,234.57"],
    ["bad", "0.00"],
  ])("%s -> %s", (wei, out) => {
    expect(formatUnits18(wei)).toBe(out);
  });
});
