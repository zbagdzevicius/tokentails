/**
 * Pawlegends host helpers (POC.md §8, §11): kill-switch-only flags, the roster from the player's cats, and the
 * store helpers (currency, return query, storage that may throw, no price in a checkout request).
 */
import {
  checkoutErrorLine,
  createPawlegendsApi,
  currencyFor,
  deviceId,
  priceLabel,
  readToken,
  returnActionOf,
  storeStatusOf,
  tokenSkus,
  UNDER_16_MESSAGE,
  writeToken,
  PAWLEGENDS_TOKEN_KEY,
} from "@/components/pawlegends/checkout";
import {
  PAWLEGENDS_FRAME_SRC,
  pawlegendsEnabled,
  pawlegendsFrameSrc,
  pawlegendsPickerEnabled,
} from "@/components/pawlegends/flags";
import {
  PAWLEGENDS_ROSTER_MAX,
  rosterOf,
} from "@/components/pawlegends/rosterBridge";

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};
const throwingStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const b64url = (value: string) => Buffer.from(value).toString("base64url");
const TOKEN = `${b64url(
  JSON.stringify({
    items: ["frame.founder"],
    skus: ["pl_founder"],
    expiresAt: 1,
  })
)}.${"s".repeat(43)}`;

describe("pawlegends flags (kill switches only)", () => {
  it("the page is on by default; only an off value closes it", () => {
    expect(pawlegendsEnabled(undefined)).toBe(true);
    expect(pawlegendsEnabled("")).toBe(true);
    expect(pawlegendsEnabled("1")).toBe(true);
    for (const off of ["0", "false", "no", "OFF"])
      expect(pawlegendsEnabled(off)).toBe(false);
  });

  it("the picker card is web only and follows both kill switches", () => {
    expect(pawlegendsPickerEnabled(false, undefined, undefined)).toBe(true);
    expect(pawlegendsPickerEnabled(true, undefined, undefined)).toBe(false);
    expect(pawlegendsPickerEnabled(false, "0", undefined)).toBe(false);
    expect(pawlegendsPickerEnabled(false, "1", "off")).toBe(false);
  });

  it("frames the same-origin build with embed=1", () => {
    expect(PAWLEGENDS_FRAME_SRC).toBe("/pawlegends-game/index.html?embed=1");
  });

  it("forwards a well-formed dare to the frame and nothing else (PUB-03)", () => {
    expect(pawlegendsFrameSrc("")).toBe(PAWLEGENDS_FRAME_SRC);
    expect(pawlegendsFrameSrc("?from=picker")).toBe(PAWLEGENDS_FRAME_SRC);
    expect(pawlegendsFrameSrc("?dare=9ix.0.0.1.c0")).toBe("/pawlegends-game/index.html?embed=1&dare=9ix.0.0.1.c0");
    expect(pawlegendsFrameSrc("?from=x&dare=1.7.3.2.0&utm_source=x")).toBe("/pawlegends-game/index.html?embed=1&dare=1.7.3.2.0");
    for (const bad of ["?dare=", "?dare=abc", "?dare=9ix.0.0.3.c0", "?dare=9IX.0.0.1.c0", "?dare=9ix.0.0.1.c0%26embed%3D0", "?dare=<script>", `?dare=${"1".repeat(8)}.0.0.1.0`]) {
      expect(pawlegendsFrameSrc(bad)).toBe(PAWLEGENDS_FRAME_SRC);
    }
  });
});

describe("rosterOf", () => {
  it("keeps valid cats only, starters first, known fields only", () => {
    const roster = rosterOf([
      {
        _id: "a1",
        name: "Biscuit",
        type: "FIRE",
        tier: "RARE",
        origin: "pack",
        owner: "uid",
      },
      {
        _id: "s1",
        name: "  Scout\n",
        type: "WATER",
        tier: "COMMON",
        isStarter: true,
        origin: "starter",
        starterBreed: "SCOUT",
      },
      { _id: "bad", name: "No type", tier: "RARE" },
      { _id: "a1", name: "Duplicate", type: "FIRE", tier: "RARE" },
      { _id: "x<y", name: "Bad id", type: "FIRE", tier: "RARE" },
      {
        _id: "o1",
        name: "Odd",
        type: "FIRE",
        tier: "RARE",
        origin: "stolen",
        starterBreed: "DRAGON",
      },
      null,
    ]);
    expect(roster).toEqual([
      {
        id: "s1",
        name: "Scout",
        type: "WATER",
        tier: "COMMON",
        isStarter: true,
        origin: "starter",
        starterBreed: "SCOUT",
      },
      {
        id: "a1",
        name: "Biscuit",
        type: "FIRE",
        tier: "RARE",
        isStarter: false,
        origin: "pack",
      },
      { id: "o1", name: "Odd", type: "FIRE", tier: "RARE", isStarter: false },
    ]);
  });

  it("caps the list and cuts long names", () => {
    const cats = Array.from({ length: 40 }, (_, i) => ({
      _id: `c${i}`,
      name: "N".repeat(50),
      type: "ICE",
      tier: "EPIC",
    }));
    const roster = rosterOf(cats);
    expect(roster).toHaveLength(PAWLEGENDS_ROSTER_MAX);
    expect(roster[0].name).toHaveLength(32);
    expect(rosterOf(null)).toEqual([]);
  });
});

describe("pawlegends store helpers", () => {
  it("EUR for European time zones, USD otherwise; labels with VAT-inclusive cents", () => {
    expect(currencyFor("Europe/Vilnius")).toBe("eur");
    expect(currencyFor("America/New_York")).toBe("usd");
    expect(currencyFor(null)).toBe("usd");
    expect(priceLabel(999, "eur")).toBe("€9.99");
    expect(priceLabel(2000, "usd")).toBe("$20.00");
  });

  it("reads the return query", () => {
    expect(
      returnActionOf({ checkout: "ok", session_id: "cs_test_abcdefgh123" })
    ).toEqual({ kind: "checkout-ok", sessionId: "cs_test_abcdefgh123" });
    expect(returnActionOf({ checkout: "ok", session_id: "nope" })).toBeNull();
    expect(returnActionOf({ checkout: "cancel" })).toEqual({
      kind: "checkout-cancel",
    });
    expect(returnActionOf({ restore: "A".repeat(32) })).toEqual({
      kind: "restore",
      t: "A".repeat(32),
    });
    expect(returnActionOf({ notify: "short" })).toBeNull();
  });

  it("storage survives a blocked browser and keeps only well-formed tokens", () => {
    expect(readToken(throwingStorage)).toBeNull();
    expect(() => writeToken(TOKEN, throwingStorage)).not.toThrow();
    expect(deviceId(throwingStorage)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    const storage = memoryStorage();
    writeToken("garbage", storage);
    expect(storage.map.has(PAWLEGENDS_TOKEN_KEY)).toBe(false);
    writeToken(TOKEN, storage);
    expect(readToken(storage)).toBe(TOKEN);
    const id = deviceId(storage);
    expect(deviceId(storage)).toBe(id);
  });

  it("tokenSkus reads the payload for display only", () => {
    expect(tokenSkus(TOKEN)).toEqual(["pl_founder"]);
    expect(tokenSkus(null)).toEqual([]);
  });

  it("a checkout request carries a SKU and a currency, never a price, and no accesstoken", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          url: "https://checkout.stripe.com/c/pay/cs_test_1",
          sessionId: "cs_test_1",
        }),
        { status: 200 }
      );
    });
    const api = createPawlegendsApi("https://api.example", fetchImpl);
    const result = await api.checkout({
      sku: "pl_founder",
      currency: "eur",
      ageBand: "18+",
      consentVersion: "2026-10-17",
      deviceId: "device-123",
      email: "cat@example.com",
      ...({ cents: 1 } as object),
    } as never);
    expect(result.ok).toBe(true);
    expect(result.body?.url).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_1"
    );
    expect(calls[0].url).toBe("https://api.example/pawlegends/checkout");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toEqual({
      sku: "pl_founder",
      currency: "eur",
      ageBand: "18+",
      consentVersion: "2026-10-17",
      deviceId: "device-123",
      email: "cat@example.com",
    });
    expect(JSON.stringify(calls[0].init?.headers ?? {})).not.toMatch(
      /accesstoken/i
    );
    expect(calls[0].init?.credentials).toBe("omit");
  });

  it("sends the Token Tails session as accesstoken, and retries without it when it is refused", async () => {
    const calls: { headers: Record<string, string>; url: string }[] = [];
    const api = createPawlegendsApi(
      "https://api.example",
      async (url, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        calls.push({ headers, url: String(url) });
        return headers.accesstoken
          ? new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
              status: 401,
            })
          : new Response(
              JSON.stringify({
                url: "https://checkout.stripe.com/c/pay/cs_test_2",
              }),
              { status: 200 }
            );
      },
      () => "fbexpired-token"
    );
    const req = {
      sku: "pl_starter",
      currency: "usd",
      ageBand: "18+",
      consentVersion: "x",
      deviceId: "device-123",
      email: "a@b.co",
    } as const;
    const result = await api.checkout(req);
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.headers.accesstoken ?? null)).toEqual([
      "fbexpired-token",
      null,
    ]);
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.example/pawlegends/checkout/account",
      "https://api.example/pawlegends/checkout",
    ]);
    // A non-Firebase value is never sent.
    const plain = createPawlegendsApi(
      "https://api.example",
      async (_u, init) => {
        expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/accesstoken/);
        return new Response(
          JSON.stringify({ url: "https://checkout.stripe.com/x" }),
          { status: 200 }
        );
      },
      () => "not-a-firebase-token"
    );
    expect((await plain.checkout(req)).ok).toBe(true);
  });

  it("refused checkouts map to short lines; a 503 says the store is closed", async () => {
    const api = createPawlegendsApi(
      "https://api.example",
      async () =>
        new Response(
          JSON.stringify({
            code: "PAWLEGENDS_STRIPE_UNAVAILABLE",
            message: "Checkout is not configured",
          }),
          { status: 503 }
        )
    );
    const result = await api.checkout({
      sku: "pl_starter",
      currency: "usd",
      ageBand: "18+",
      consentVersion: "x",
      deviceId: "device-123",
      email: "a@b.co",
    });
    expect(result.ok).toBe(false);
    expect(checkoutErrorLine(result)).toMatch(/closed/);
    expect(
      checkoutErrorLine({ status: 403, code: "PAWLEGENDS_UNDER_16" })
    ).toBe(UNDER_16_MESSAGE);
    expect(checkoutErrorLine({ status: 0, code: null })).toMatch(/connection/);
    const offline = createPawlegendsApi("https://api.example", async () => {
      throw new Error("offline");
    });
    expect((await offline.status()).status).toBe(0);
  });

  it("storeStatusOf drops malformed SKUs and counts an empty table as closed", () => {
    expect(storeStatusOf({ store: true, skus: [] }).store).toBe(false);
    const status = storeStatusOf({
      store: true,
      skus: [
        {
          sku: "pl_starter",
          label: "Starter",
          cents: { usd: 99, eur: 99 },
          deliveredNow: "a",
          deliveredAtMvp: "b",
        },
        {
          sku: "pl_unknown",
          label: "x",
          cents: { usd: 1, eur: 1 },
          deliveredNow: "a",
          deliveredAtMvp: "b",
        },
      ],
    });
    expect(status.store).toBe(true);
    expect(status.skus.map((s) => s.sku)).toEqual(["pl_starter"]);
  });
});
