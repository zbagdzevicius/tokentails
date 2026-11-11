/**
 * The host half of the game's API ops (docs/plans/moba/SOCIAL-RANKED.md §13): the op list is the shared one, every op
 * maps to one route the host builds (never a URL from the game), registered-only ops short-circuit for guests, and
 * the answers go back by id.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  PAWLEGENDS_API_OPS,
  PawlegendsApi,
  parseApiRequest,
  routeOf,
  type PawlegendsApiRoute,
} from "@/components/pawlegends/apiBridge";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "shared", "pawlegends-bridge.fixtures.json"), "utf8")
) as { apiOps: string[] };

describe("pawlegends api bridge (host)", () => {
  it("the op list is the shared one", () => {
    expect([...PAWLEGENDS_API_OPS]).toEqual(fixture.apiOps);
  });

  it("drops unknown ops, nested args and unknown keys", () => {
    expect(parseApiRequest({ id: "a1", op: "admin.reports" })).toBeNull();
    expect(parseApiRequest({ id: "a1", op: "report.send", args: [1] })).toBeNull();
    expect(parseApiRequest({ id: "a1", op: "report.send", args: { room: "r1", url: "https://evil", x: { y: 1 } } })).toEqual({
      id: "a1",
      op: "report.send",
      args: { room: "r1" },
    });
  });

  it("builds every route itself; paths never come from the game", () => {
    expect(routeOf("report.send", { room: "r1", slot: 3, reason: "cheat", tick: 90, note: "hi" })).toEqual({
      method: "POST",
      path: "/pawlegends/reports",
      body: { room: "r1", slot: 3, reason: "cheat", tick: 90, note: "hi" },
      auth: "any",
    });
    expect(routeOf("report.send", { room: "../admin", slot: 3, reason: "cheat" })).toBeNull();
    expect(routeOf("friend.add", { code: "PL-7KQ2-M9XR" })?.body).toEqual({ code: "PL-7KQ2-M9XR" });
    expect(routeOf("friend.add", { room: "r1", slot: 1 })?.body).toEqual({ room: "r1", slot: 1 });
    expect(routeOf("friend.remove", { code: "PL-7KQ2-M9XR" })?.path).toBe("/pawlegends/social/friends/PL-7KQ2-M9XR");
    expect(routeOf("friend.remove", { code: "../../x" })).toBeNull();
    expect(routeOf("board.get", { kind: "weekly", page: 2 })).toMatchObject({ path: "/pawlegends/boards/weekly?page=2", auth: "none" });
    expect(routeOf("board.get", { kind: "friends" })).toMatchObject({ path: "/pawlegends/boards/friends/me", auth: "registered" });
    expect(routeOf("ranked.status", {})).toMatchObject({ auth: "none" });
    const thread = "dAAAAAAAAAAAAAAAAAAAAAA";
    const mid = "0123456789abcdef01234567";
    for (const op of PAWLEGENDS_API_OPS) {
      const r = routeOf(op, {
        code: "PL-7KQ2-M9XR",
        room: "r1",
        slot: 1,
        reason: "afk",
        kind: op === "chat.report" ? "spam" : "global",
        ageBand: "18+",
        to: "PL-7KQ2-M9XR",
        thread,
        after: mid,
        msg: mid,
        k: "q",
        pid: 5,
        muted: true,
      });
      expect([op, r?.path.startsWith("/pawlegends/")]).toEqual([op, true]);
    }
  });

  it("chat routes (CHAT-AVATARS.md §4): opaque thread and message ids only, text up to 240, the avatar mapped", () => {
    const thread = "dAAAAAAAAAAAAAAAAAAAAAA";
    const mid = "0123456789abcdef01234567";
    expect(routeOf("chat.list", {})).toMatchObject({ method: "GET", path: "/pawlegends/social/chat", auth: "registered" });
    expect(routeOf("chat.open", { code: "PL-7KQ2-M9XR" })?.path).toBe("/pawlegends/social/chat/dm/PL-7KQ2-M9XR");
    expect(routeOf("chat.history", { thread, before: mid })?.path).toBe(`/pawlegends/social/chat/${thread}?before=${mid}`);
    expect(routeOf("chat.history", { thread: "../admin" })).toBeNull();
    expect(routeOf("chat.since", { thread, after: mid })?.path).toBe(`/pawlegends/social/chat/${thread}/since/${mid}`);
    expect(routeOf("chat.send", { thread, k: "t", text: "gg wp" })?.body).toEqual({ k: "t", text: "gg wp" });
    expect(routeOf("chat.send", { thread, k: "q", pid: 5 })?.body).toEqual({ k: "q", id: 5 });
    expect(routeOf("chat.send", { thread, k: "img", text: "x" })).toBeNull();
    expect(routeOf("chat.report", { msg: mid, kind: "contact" })?.body).toEqual({ msg: mid, kind: "contact" });
    expect(routeOf("chat.report", { msg: mid, kind: "cheat" })).toBeNull();
    expect(routeOf("chat.mute", { thread, muted: true })?.body).toEqual({ muted: true });
    expect(parseApiRequest({ id: "a1", op: "chat.send", args: { thread, k: "t", text: "x".repeat(240) } })?.args.text).toHaveLength(240);
    expect(parseApiRequest({ id: "a1", op: "chat.send", args: { thread, k: "t", text: "x".repeat(241) } })?.args.text).toBeUndefined();
    expect(routeOf("social.me", { avatarKind: "hero", avatarRef: "sage", frame: "frame.store.goldpaw" })?.body).toEqual({
      avatar: { kind: "hero", hero: "sage" },
      frame: "frame.store.goldpaw",
    });
    expect(routeOf("social.me", { avatarKind: "cat", avatarRef: "0123456789abcdef01234567", frame: "none" })?.body).toEqual({
      avatar: { kind: "cat", catId: "0123456789abcdef01234567" },
      frame: null,
    });
    expect(routeOf("social.me", { avatarKind: "photo", avatarRef: "https://x" })?.body).toEqual({});
  });

  function api(signedIn: boolean) {
    const answers: unknown[] = [];
    const calls: PawlegendsApiRoute[] = [];
    const a = new PawlegendsApi({
      fetch: async (route) => {
        calls.push(route);
        return { status: route.path === "/pawlegends/reports" ? 201 : 200, body: { ok: true } };
      },
      answer: (...args) => answers.push(args),
      signedIn: () => signedIn,
    });
    return { a, answers, calls };
  }

  it("guests: registered-only ops answer 403 without a call; reports go through", async () => {
    const g = api(false);
    await g.a.request({ id: "a1", op: "social.get", args: {} });
    await g.a.request({ id: "a2", op: "report.send", args: { room: "r1", slot: 3, reason: "afk" } });
    expect(g.calls.map((c) => c.path)).toEqual(["/pawlegends/reports"]);
    expect(g.answers).toEqual([
      ["a1", false, 403, { code: "need_account" }],
      ["a2", true, 201, { ok: true }],
    ]);
  });

  it("bad args answer 400; over 60 a minute answers 429", async () => {
    const s = api(true);
    await s.a.request({ id: "a1", op: "friend.accept", args: {} });
    expect(s.answers[0]).toEqual(["a1", false, 400]);
    for (let i = 0; i < 61; i++) await s.a.request({ id: `b${i}`, op: "ranked.status", args: {} });
    expect(s.answers[s.answers.length - 1]).toEqual(["b60", false, 429]);
  });
});
