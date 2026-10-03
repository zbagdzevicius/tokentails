/**
 * QA polish, Oct 3: shelter text is never HTML, Lithuanian names leave the display face, My Pets
 * lists the tiers you own first, the payout RPCs are read one request at a time per URL, and a
 * failed read never shows the raw RPC message.
 */
import { needsBodyFont, nameFont } from "@/lib/glyphs";
import { plainText } from "@/lib/plainText";
import { tierOrder } from "@/components/shared/CatsModal";
import { RpcRateLimitError, readErrorText, rpcCall, setRpcSleep } from "@/components/shelter-payouts/rpc";
import { Tier } from "@/models/cats";

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));

describe("plainText (shelter descriptions)", () => {
  it("drops pasted page markup and keeps the words", () => {
    const pasted =
      '<div data-turn-id="abc" class="text-base"><p data-start="0">Judas is <b>shy</b> &amp; sweet.</p><p>Loves&nbsp;naps.</p></div>';
    expect(plainText(pasted)).toBe("Judas is shy & sweet. Loves naps.");
  });
  it("never lets a tag through, even an escaped one", () => {
    expect(plainText('<img src=x onerror="alert(1)">Hi<script>alert(2)</script>')).toBe("Hi");
    // An entity-encoded tag becomes literal text; React escapes it when rendering.
    expect(plainText("&lt;b&gt;x&lt;/b&gt;")).toBe("<b>x</b>");
    expect(plainText(undefined)).toBe("");
  });
});

describe("nameFont (display face has no Ė Ą Č Ę Į Ų Ū)", () => {
  it("switches a Lithuanian name to the body face, whole", () => {
    expect(needsBodyFont("Piesė")).toBe(true);
    expect(needsBodyFont("ROŽINĖ PĖDUTĖ")).toBe(true);
    expect(nameFont("Piesė")).toBe("font-sans font-extrabold");
  });
  it("keeps the display face when it can draw every letter (Š and Ž included)", () => {
    expect(needsBodyFont("Žiedas Šarka")).toBe(false);
    expect(nameFont("Judas")).toBe("font-primary");
    expect(nameFont("Judas", "font-secondary")).toBe("font-secondary");
  });
});

describe("My Pets tier order", () => {
  it("puts tiers you own first, rarest first, then the empty ones", () => {
    const by = { [Tier.LEGENDARY]: [], [Tier.EPIC]: [1], [Tier.RARE]: [], [Tier.COMMON]: [1, 2] };
    expect(tierOrder(by)).toEqual([Tier.EPIC, Tier.COMMON, Tier.LEGENDARY, Tier.RARE]);
  });
});

describe("payout RPC reads", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    setRpcSleep((ms) => new Promise((r) => setTimeout(r, ms)));
  });

  it("sends one request at a time to the same RPC URL", async () => {
    let inFlight = 0;
    let max = 0;
    global.fetch = jest.fn(async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, status: 200, json: async () => ({ result: "0x1" }) } as Response;
    }) as unknown as typeof fetch;
    await Promise.all([1, 2, 3, 4].map(() => rpcCall<string>("https://rpc.example", "eth_blockNumber", [])));
    expect(max).toBe(1);
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(4);
  });

  it("keeps going after a failed call on the same URL", async () => {
    setRpcSleep(async () => {});
    let n = 0;
    global.fetch = jest.fn(async () =>
      n++ === 0
        ? ({ ok: false, status: 500, json: async () => ({}) } as Response)
        : ({ ok: true, status: 200, json: async () => ({ result: "0x2" }) } as Response)
    ) as unknown as typeof fetch;
    await expect(rpcCall("https://rpc.other", "eth_blockNumber", [])).rejects.toThrow("HTTP 500");
    await expect(rpcCall("https://rpc.other", "eth_blockNumber", [])).resolves.toBe("0x2");
  });

  it("shows plain words, never the raw RPC error", () => {
    expect(readErrorText(new RpcRateLimitError("eth_getLogs: HTTP 429"))).toMatch(/busy right now/);
    expect(readErrorText(new Error("eth_getLogs: HTTP 503"))).not.toMatch(/HTTP|eth_/);
  });
});
