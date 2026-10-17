/**
 * The /heist host side of the Heist's treat channel (Oct 15, 2026): the treat is sent in place from
 * the Heist's own screens. Every send here is a fake; nothing reaches a backend.
 */
jest.mock("@/api/api", () => ({
  apiUrl: "http://api.test",
  currentAccessToken: jest.fn(() => "fbtoken"),
  apiFetch: jest.fn(),
}));

import { currentAccessToken } from "@/api/api";
import { receiptOf, sendTreat, type DonateMe, type TreatSend } from "@/components/codex/impact/treat";
import {
  createTreatHost,
  HEIST_TREAT_CHANNEL,
  HEIST_TREAT_VERSION,
  heistOutcome,
  heistToday,
} from "@/components/heist/treatBridge";

const ORIGIN = "https://tokentails.com";
const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(send: jest.Mock, me: jest.Mock = jest.fn(async () => null)) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const win = {
    addEventListener: (_: "message", fn: (event: MessageEvent) => void) => void listeners.add(fn),
    removeEventListener: (_: "message", fn: (event: MessageEvent) => void) => void listeners.delete(fn),
  };
  const posted: Array<Record<string, unknown> & { origin: string }> = [];
  const frame = { postMessage: (message: unknown, origin: string) => void posted.push({ ...(message as Record<string, unknown>), origin }) };
  const onSent = jest.fn();
  const host = createTreatHost({ win, origin: ORIGIN, target: () => frame, send, me, onSent });
  const fromHeist = (data: Record<string, unknown>, source: unknown = frame, origin = ORIGIN) =>
    listeners.forEach((fn) => fn({ data: { channel: HEIST_TREAT_CHANNEL, v: HEIST_TREAT_VERSION, ...data }, source, origin } as MessageEvent));
  return { host, posted, fromHeist, onSent, listeners };
}

describe("heist treat host", () => {
  it("answers hello with ready, and never posts before it is asked", () => {
    const t = harness(jest.fn());
    expect(t.posted).toEqual([]);
    t.fromHeist({ type: "treat-hello" });
    expect(t.posted).toEqual([{ channel: HEIST_TREAT_CHANNEL, v: 1, type: "treat-ready", origin: ORIGIN }]);
  });

  it("sends once with the chain, answers the reqId, and repeats the same answer for the same reqId", async () => {
    const send = jest.fn(async (): Promise<TreatSend> => ({ kind: "sent", receipt: "https://arcscan.app/tx/0x1" }));
    const t = harness(send);
    t.fromHeist({ type: "treat-send", reqId: "r1", chainId: 5042, cat: "Judas" });
    t.fromHeist({ type: "treat-send", reqId: "r1", chainId: 5042, cat: "Judas" });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ chainId: 5042 });
    const results = t.posted.filter((m) => m.type === "treat-result");
    expect(results).toHaveLength(2);
    for (const r of results) expect(r).toMatchObject({ reqId: "r1", outcome: { kind: "sent", receipt: "https://arcscan.app/tx/0x1" } });
    expect(t.onSent).toHaveBeenCalledWith({ kind: "sent", receipt: "https://arcscan.app/tx/0x1" }, "Judas");
  });

  it("one send at a time: a second reqId while one is out shares its answer", async () => {
    let resolve!: (v: TreatSend) => void;
    const send = jest.fn(() => new Promise<TreatSend>((r) => (resolve = r)));
    const t = harness(send);
    t.fromHeist({ type: "treat-send", reqId: "a" });
    t.fromHeist({ type: "treat-send", reqId: "b" });
    resolve({ kind: "already-today" });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(t.posted.filter((m) => m.type === "treat-result").map((m) => m.outcome)).toEqual([{ kind: "already" }, { kind: "already" }]);
  });

  it("ignores another source, origin, channel, and malformed ids or chains", async () => {
    const send = jest.fn(async (): Promise<TreatSend> => ({ kind: "sent" }));
    const t = harness(send);
    t.fromHeist({ type: "treat-send", reqId: "x" }, {});
    t.fromHeist({ type: "treat-send", reqId: "x" }, undefined, "https://evil.example");
    t.listeners.forEach((fn) => fn({ data: { channel: "tt-heist-bridge", v: 1, type: "treat-send", reqId: "x" }, source: undefined, origin: ORIGIN } as unknown as MessageEvent));
    t.fromHeist({ type: "treat-send", reqId: "y".repeat(65) });
    t.fromHeist({ type: "treat-send", reqId: 7 });
    await flush();
    expect(send).not.toHaveBeenCalled();
    t.fromHeist({ type: "treat-send", reqId: "z", chainId: -4 });
    await flush();
    expect(send).toHaveBeenCalledWith({});
  });

  it("reads today through fetchDonateMe", async () => {
    const me = jest.fn(async (): Promise<DonateMe> => ({
      resetsAt: null,
      today: { status: "CONFIRMED" },
      confirmedCount: 1,
      onTheirWayCount: 0,
      eligibility: { eligible: true, reason: null, eligibleAt: null },
    }));
    const t = harness(jest.fn(), me);
    t.fromHeist({ type: "treat-me", reqId: "m1" });
    await flush();
    expect(t.posted.find((m) => m.type === "treat-me-result")).toMatchObject({ reqId: "m1", today: "sent" });
  });

  it("a thrown send is failed, not a crash", async () => {
    const t = harness(jest.fn(async () => Promise.reject(new Error("boom"))));
    t.fromHeist({ type: "treat-send", reqId: "e" });
    await flush();
    expect(t.posted.find((m) => m.type === "treat-result")).toMatchObject({ outcome: { kind: "failed" } });
  });

  it("stops after dispose", () => {
    const t = harness(jest.fn());
    t.host.dispose();
    expect(t.listeners.size).toBe(0);
  });

  it("maps every send and read", () => {
    expect(heistOutcome({ kind: "sent" })).toEqual({ kind: "sent" });
    expect(heistOutcome({ kind: "already-today" })).toEqual({ kind: "already" });
    expect(heistOutcome({ kind: "budget-spent" })).toEqual({ kind: "used-up" });
    expect(heistOutcome({ kind: "paused" })).toEqual({ kind: "paused" });
    for (const kind of ["failed", "retry"] as const) expect(heistOutcome({ kind })).toEqual({ kind: "failed" });
    // A refusal that a retry cannot change never shows "Try again".
    expect(heistOutcome({ kind: "signed-out" })).toEqual({ kind: "paused" });
    expect(heistOutcome({ kind: "not-eligible", reason: "email-unverified", eligibleAt: null })).toEqual({ kind: "not-eligible" });
    expect(heistOutcome({ kind: "not-eligible", reason: "guest", eligibleAt: null })).toEqual({ kind: "not-eligible" });
    expect(heistToday(null)).toBe("unknown");
    const base = { resetsAt: null, confirmedCount: 0, onTheirWayCount: 0, eligibility: { eligible: true, reason: null, eligibleAt: null } };
    expect(heistToday({ ...base, today: null })).toBe("none");
    expect(heistToday({ ...base, today: { status: "FAILED" } })).toBe("none");
    expect(heistToday({ ...base, today: { status: "PENDING" } })).toBe("sent");
  });
});

describe("sendTreat source and receipt (additive, Oct 15, 2026)", () => {
  it("keeps source page by default and sends source heist when asked", async () => {
    const page = jest.fn().mockResolvedValue(json(200, {}));
    expect(await sendTreat({ fetchImpl: page })).toEqual({ kind: "sent" });
    expect(JSON.parse(String((page.mock.calls[0][1] as RequestInit).body))).toEqual({ source: "page" });
    const heist = jest.fn().mockResolvedValue(json(200, { explorerUrl: "https://arcscan.app/tx/0x2" }));
    expect(await sendTreat({ fetchImpl: heist, source: "heist", chainId: 5042 })).toEqual({ kind: "sent", receipt: "https://arcscan.app/tx/0x2" });
    expect(JSON.parse(String((heist.mock.calls[0][1] as RequestInit).body))).toEqual({ source: "heist", chainId: 5042 });
    expect((heist.mock.calls[0][1] as RequestInit).headers).toHaveProperty("accesstoken", "fbtoken");
  });

  it("without an account it goes to the guest route with source heist", async () => {
    (currentAccessToken as jest.Mock).mockReturnValueOnce(null);
    const f = jest.fn().mockResolvedValue(json(200, {}));
    await sendTreat({ fetchImpl: f, source: "heist" });
    expect(f.mock.calls[0][0]).toBe("http://api.test/shelter/donate/guest");
    expect(JSON.parse(String((f.mock.calls[0][1] as RequestInit).body))).toEqual({ source: "heist" });
  });

  it("only keeps an https receipt", () => {
    expect(receiptOf({ explorerUrl: "https://arcscan.app/tx/0x1" })).toBe("https://arcscan.app/tx/0x1");
    for (const bad of ["http://x.test", "javascript:alert(1)", "/x", 3, null]) expect(receiptOf({ explorerUrl: bad })).toBeUndefined();
    expect(receiptOf(null)).toBeUndefined();
  });
});
