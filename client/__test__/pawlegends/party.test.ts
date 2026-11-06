/**
 * Party play on the /pawlegends host (docs/plans/moba/MULTIPLAYER.md §5.3, §6, lane P9): the `?party=` link is
 * forwarded validated to the frame and stripped from the address bar; the bridge answers a ticket request only to
 * its own frame at the exact game origin and never sends an access token into it; tickets are minted with the
 * host's session; a party result goes to `/live` once, with retries, and its status back to the game.
 */
import {
  createPawlegendsBridge,
  PAWLEGENDS_NS,
  partyResultOf,
  type PawlegendsBridgeHandlers,
  type PawlegendsBridgeTimers,
} from "@/components/pawlegends/bridge";
import {
  PAWLEGENDS_FRAME_SRC,
  PAWLEGENDS_PARTY_LINK,
  partyCodeOf,
  pawlegendsFrameSrc,
  withoutParty,
} from "@/components/pawlegends/flags";
import { PARTY_SAVE_RETRIES_MS, PARTY_TICKETS_PER_MINUTE, PartySaves, PartyTickets } from "@/components/pawlegends/partySaves";

const ORIGIN = "https://tokentails.com";
const TICKET = `eyJhdWQiOiJwbC1wYXJ0eSIsInYiOjF9.${"A".repeat(43)}`;
const RESULT = { v: 2 as const, room: "r0om12abc", slot: 1, simVersion: 11, ticks: 9000, outcome: "won" as const, finalHash: "0a1b2c3d" };
const env = (type: string, extra: Record<string, unknown> = {}) => ({ ns: PAWLEGENDS_NS, v: 1, type, ...extra });

function harness(handlers: PawlegendsBridgeHandlers = {}) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const win = {
    addEventListener: (_: "message", fn: (event: MessageEvent) => void) => void listeners.add(fn),
    removeEventListener: (_: "message", fn: (event: MessageEvent) => void) => void listeners.delete(fn),
  };
  const posted: Array<{ message: Record<string, unknown>; origin: string }> = [];
  const frame = { postMessage: (message: unknown, origin: string) => void posted.push({ message: message as Record<string, unknown>, origin }) };
  const timers: PawlegendsBridgeTimers = { setTimeout: () => 0, clearTimeout: () => undefined, now: () => 0 };
  const fromGame = (data: unknown, source: unknown = frame, from = ORIGIN) =>
    listeners.forEach((fn) => fn({ data, source, origin: from } as MessageEvent));
  const bridge = createPawlegendsBridge({ win, target: () => frame, origin: ORIGIN, handlers, timers });
  return { bridge, posted, fromGame };
}

describe("party links on the host (P9)", () => {
  it("forwards a valid party code to the frame, upper-cased, next to a dare", () => {
    expect(pawlegendsFrameSrc("?party=k7qx2m")).toBe(`${PAWLEGENDS_FRAME_SRC}&party=K7QX2M`);
    expect(pawlegendsFrameSrc("?party=K7Q-X2M")).toBe(`${PAWLEGENDS_FRAME_SRC}&party=K7QX2M`);
    expect(pawlegendsFrameSrc("?dare=abc12.3.1.0.zz&party=K7QX2M")).toBe(`${PAWLEGENDS_FRAME_SRC}&dare=abc12.3.1.0.zz&party=K7QX2M`);
  });

  it("validates: anything off the alphabet or the length is dropped", () => {
    for (const bad of ["?party=K7QX2", "?party=K7QX0M", "?party=<script>", "?party=K7QX2M%26embed%3D0", "?party="])
      expect(pawlegendsFrameSrc(bad)).toBe(PAWLEGENDS_FRAME_SRC);
    expect(partyCodeOf("?party=abcdef")).toBe("ABCDEF");
    expect(partyCodeOf("?party=abcdeo")).toBeNull();
  });

  it("strips party from the address bar and keeps everything else", () => {
    expect(withoutParty("https://tokentails.com/pawlegends?party=K7QX2M&x=1#h")).toBe("/pawlegends?x=1#h");
    expect(withoutParty("https://tokentails.com/pawlegends?party=K7QX2M")).toBe("/pawlegends");
    expect(withoutParty("https://tokentails.com/pawlegends?x=1")).toBeNull();
  });

  it("the party share link is only the tokentails.com embed URL", () => {
    expect(PAWLEGENDS_PARTY_LINK.test("https://tokentails.com/pawlegends?party=K7QX2M")).toBe(true);
    for (const bad of ["https://evil.com/pawlegends?party=K7QX2M", "https://tokentails.com/pawlegends?party=K7QX2M&x=1", "http://tokentails.com/pawlegends?party=K7QX2M"])
      expect(PAWLEGENDS_PARTY_LINK.test(bad)).toBe(false);
  });
});

describe("the bridge's party messages (P9)", () => {
  it("a ticket request from our frame reaches the host; one from another window or origin is ignored", () => {
    const asked: string[] = [];
    const h = harness({ onPartyTicketRequest: (id) => asked.push(id) });
    h.fromGame(env("party-ticket-request", { id: "k2j9x8" }));
    h.fromGame(env("party-ticket-request", { id: "evil1" }), {});
    h.fromGame(env("party-ticket-request", { id: "evil2" }), undefined, "https://evil.example");
    h.fromGame(env("party-ticket-request", { id: "BAD ID" }));
    expect(asked).toEqual(["k2j9x8"]);
  });

  it("answers only once the game is ready, to the exact game origin, with the ticket and never an access token", () => {
    const h = harness();
    h.bridge.partyTicket("k2j9x8", TICKET);
    expect(h.posted.filter((p) => p.message.type === "party-ticket")).toHaveLength(0);
    h.fromGame(env("ready", { version: "1" }));
    h.bridge.partyTicket("k2j9x8", TICKET);
    const sent = h.posted.filter((p) => p.message.type === "party-ticket");
    expect(sent).toEqual([{ message: env("party-ticket", { id: "k2j9x8", ticket: TICKET }), origin: ORIGIN }]);
    for (const p of h.posted) {
      const text = JSON.stringify(p.message);
      expect(text).not.toMatch(/accesstoken|"fb[A-Za-z0-9]/i);
      expect(p.origin).toBe(ORIGIN);
    }
  });

  it("a malformed ticket is never posted; no ticket answers null with the error code", () => {
    const h = harness();
    h.fromGame(env("ready", { version: "1" }));
    h.bridge.partyTicket("k2j9x8", "fbSECRET-ACCESS-TOKEN");
    expect(h.posted.filter((p) => p.message.type === "party-ticket")).toHaveLength(0);
    h.bridge.partyTicket("k2j9x8", null, "PAWLEGENDS_PARTY_TICKET_UNAVAILABLE");
    expect(h.posted.at(-1)!.message).toEqual(env("party-ticket", { id: "k2j9x8", ticket: null, error: "PAWLEGENDS_PARTY_TICKET_UNAVAILABLE" }));
  });

  it("a party result reaches the host only when its matchId is its room", () => {
    const got: unknown[] = [];
    const h = harness({ onPartyResult: (r, id) => got.push([id, r]) });
    h.fromGame(env("party-result", { matchId: "r0om12abc", result: RESULT }));
    h.fromGame(env("party-result", { matchId: "other", result: RESULT }));
    h.fromGame(env("party-result", { matchId: "r0om12abc", result: { ...RESULT, finalHash: "XYZ" } }));
    expect(got).toEqual([["r0om12abc", RESULT]]);
    expect(partyResultOf({ ...RESULT, slot: 3 })).toBeNull();
    expect(partyResultOf({ ...RESULT, outcome: "quit" })).toBeNull();
    expect(partyResultOf({ ...RESULT, extra: 1 })).toEqual(RESULT);
  });
});

describe("party tickets (P9)", () => {
  it("mints with the host's session and answers the game; a failure answers null", async () => {
    const answers: unknown[] = [];
    const mint = jest
      .fn()
      .mockResolvedValueOnce({ ticket: TICKET, status: 200, code: null })
      .mockResolvedValueOnce({ ticket: null, status: 503, code: "PAWLEGENDS_PARTY_TICKET_UNAVAILABLE" })
      .mockResolvedValueOnce({ ticket: null, status: 0, code: null })
      .mockRejectedValueOnce(new Error("boom"));
    const t = new PartyTickets({ mint, answer: (...a) => answers.push(a) });
    await t.request("a1");
    await t.request("a2");
    await t.request("a3");
    await t.request("a4");
    expect(answers).toEqual([
      ["a1", TICKET],
      ["a2", null, "PAWLEGENDS_PARTY_TICKET_UNAVAILABLE"],
      ["a3", null, "NETWORK"],
      ["a4", null, "NETWORK"],
    ]);
  });

  it("one in flight and at most 10 a minute", async () => {
    let now = 0;
    const answers: unknown[][] = [];
    let release: () => void = () => undefined;
    const mint = jest.fn(() => new Promise<{ ticket: string; status: number; code: null }>((r) => (release = () => r({ ticket: TICKET, status: 200, code: null }))));
    const t = new PartyTickets({ mint, answer: (...a) => answers.push(a), now: () => now });
    const first = t.request("a1");
    await t.request("a2");
    expect(answers).toEqual([["a2", null, "RATE_LIMITED"]]);
    release();
    await first;
    const fast = new PartyTickets({ mint: async () => ({ ticket: TICKET, status: 200, code: null }), answer: (...a) => answers.push(a), now: () => now });
    for (let i = 0; i < PARTY_TICKETS_PER_MINUTE + 1; i++) await fast.request(`b${i}`);
    expect(answers.at(-1)).toEqual([`b${PARTY_TICKETS_PER_MINUTE}`, null, "RATE_LIMITED"]);
    now += 61_000;
    await fast.request("c1");
    expect(answers.at(-1)).toEqual(["c1", TICKET]);
  });
});

describe("party saves (P9, §6)", () => {
  const ok = { ok: true, status: 200, code: null, body: { difficulty: "easy", outcome: "won", catnipPaid: 12, catnipCount: 140 } };

  it("posts once to /live and reports saving then saved with the catnip", async () => {
    const statuses: unknown[] = [];
    const save = jest.fn().mockResolvedValue(ok);
    const s = new PartySaves({ save, onStatus: (id, st, d) => statuses.push([id, st, d.answer?.catnipPaid ?? null]) });
    await s.submit(RESULT);
    await s.submit(RESULT);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(RESULT);
    expect(statuses).toEqual([
      ["r0om12abc", "saving", null],
      ["r0om12abc", "saved", 12],
    ]);
  });

  it("retries a network or server failure 3 times (2 s, 6 s, 18 s), then fails", async () => {
    const waits: number[] = [];
    const statuses: string[] = [];
    const save = jest.fn().mockResolvedValue({ ok: false, status: 503, code: null });
    const s = new PartySaves({ save, onStatus: (_id, st) => statuses.push(st), schedule: (fn, ms) => (waits.push(ms), fn()) });
    await s.submit(RESULT);
    expect(waits).toEqual([...PARTY_SAVE_RETRIES_MS]);
    expect(save).toHaveBeenCalledTimes(4);
    expect(statuses.at(-1)).toBe("failed");
  });

  it("a duplicate and the AFK refusal are final (saved, with their code); a forged result is rejected", async () => {
    const run = async (r: { ok: boolean; status: number; code: string | null }) => {
      const statuses: string[] = [];
      await new PartySaves({ save: async () => r as never, onStatus: (_i, st) => statuses.push(st) }).submit(RESULT);
      return statuses.at(-1);
    };
    expect(await run({ ok: false, status: 409, code: "PAWLEGENDS_DUPLICATE" })).toBe("saved");
    expect(await run({ ok: false, status: 409, code: "PAWLEGENDS_PARTY_AFK" })).toBe("saved");
    expect(await run({ ok: false, status: 400, code: "PAWLEGENDS_REPLAY_INVALID" })).toBe("rejected");
    expect(await run({ ok: false, status: 403, code: "PAWLEGENDS_PARTY_SLOT" })).toBe("rejected");
  });
});
