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
        to: op === "club.remove" ? "0123456789ab" : "PL-7KQ2-M9XR",
        name: "3.7",
        thread,
        after: mid,
        msg: mid,
        k: "q",
        pid: 5,
        muted: true,
        blob: '{"v":1}',
        option: "a",
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        pushKey: "B".repeat(87),
        pushAuth: "A".repeat(22),
        cats: "invite,club",
        tz: -120,
        hideFlag: true,
        match: mid,
        visibility: "friends",
        invite: mid,
        answer: "accept",
        granted: true,
      });
      expect([op, r?.path.startsWith("/pawlegends/")]).toEqual([op, true]);
    }
    // analytics: the play stats choice for the server's events; registered only, the code only when well-formed
    const aid = `pl_${"0a".repeat(16)}`;
    expect(routeOf("analytics.consent", { granted: false, distinctId: aid })).toEqual({
      method: "POST",
      path: "/pawlegends/analytics/consent",
      body: { granted: false, distinctId: aid },
      auth: "registered",
    });
    expect(routeOf("analytics.consent", { granted: true, distinctId: "firebase-uid" })?.body).toEqual({ granted: true });
    expect(routeOf("analytics.consent", {})).toBeNull();
    // SOCIAL-INVITES.md: the fast inbox, the toast's answer, and the inviter's sim build on an invite
    expect(routeOf("social.inbox", { rev: "i12" })).toMatchObject({ method: "GET", path: "/pawlegends/social/inbox?rev=i12", auth: "registered" });
    expect(routeOf("social.inbox", { rev: "../x" })?.path).toBe("/pawlegends/social/inbox");
    expect(routeOf("invite.answer", { invite: mid, answer: "decline" })).toMatchObject({
      method: "POST",
      path: `/pawlegends/social/invite/${mid}/answer`,
      body: { answer: "decline" },
      auth: "registered",
    });
    expect(routeOf("invite.answer", { invite: "../../x", answer: "accept" })).toBeNull();
    expect(routeOf("invite.answer", { invite: mid, answer: "maybe" })).toBeNull();
    expect(routeOf("invite.send", { to: "PL-7KQ2-M9XR", sim: "33.abcdef12" })?.body).toEqual({ to: "PL-7KQ2-M9XR", sim: "33.abcdef12" });
    expect(routeOf("invite.send", { to: "PL-7KQ2-M9XR", sim: "33/../x" })?.body).toEqual({ to: "PL-7KQ2-M9XR" });
    // nicknames: suggestions while typing, and Add by the exact name (a code still wins when both are sent)
    expect(routeOf("social.search", { name: "Zyg" })).toEqual({ method: "GET", path: "/pawlegends/social/search?q=Zyg", auth: "registered" });
    expect(routeOf("social.search", { name: "a" })).toBeNull();
    expect(routeOf("social.search", { name: "<script>" })).toBeNull();
    expect(routeOf("friend.add", { name: "zygis" })?.body).toEqual({ name: "zygis" });
    expect(routeOf("friend.add", { name: "zygis", code: "PL-7KQ2-M9XR" })?.body).toEqual({ code: "PL-7KQ2-M9XR" });
    expect(routeOf("friend.add", { name: "../x/y" })).toBeNull();
  });

  it("country flags (FLAGS.md): get for any session, set only with a boolean", () => {
    expect(routeOf("flag.get", {})).toEqual({ method: "GET", path: "/pawlegends/flag", auth: "any", anon: { method: "GET", path: "/pawlegends/flag/here", auth: "none" } });
    expect(routeOf("flag.set", { hideFlag: false })?.body).toEqual({ hideFlag: false });
    expect(routeOf("flag.set", { hideFlag: "yes" })).toBeNull();
    expect(routeOf("flag.set", {})).toBeNull();
  });

  it("match history routes (MATCH-HISTORY.md): yours with the session, a friend's by code (registered)", () => {
    const id = "0123456789abcdef01234567";
    expect(routeOf("history.list", {})).toEqual({ method: "GET", path: "/pawlegends/history", auth: "any" });
    expect(routeOf("history.list", { mode: "ranked", before: id })).toEqual({ method: "GET", path: `/pawlegends/history?mode=ranked&before=${id}`, auth: "any" });
    // an unknown filter or cursor is dropped, never forwarded
    expect(routeOf("history.list", { mode: "admin", before: "../x" })?.path).toBe("/pawlegends/history");
    expect(routeOf("history.list", { code: "PL-7KQ2-M9XR" })).toEqual({ method: "GET", path: "/pawlegends/history/u/PL-7KQ2-M9XR", auth: "registered" });
    expect(routeOf("history.list", { code: "../../x" })).toBeNull();
    expect(routeOf("history.match", { match: id })).toEqual({ method: "GET", path: `/pawlegends/history/match/${id}`, auth: "any" });
    expect(routeOf("history.match", { match: id, code: "PL-7KQ2-M9XR" })?.path).toBe(`/pawlegends/history/u/PL-7KQ2-M9XR/match/${id}`);
    expect(routeOf("history.match", { match: "../admin" })).toBeNull();
    // public since Nov 17 (the founder): no privacy op
    expect(routeOf("history.privacy" as never, { visibility: "me" })).toBeNull();
  });

  it("gaps5: a party invite forwards only the Ranked duo mode", () => {
    const to = "PAW-ABCD-EFGH";
    const plain = routeOf("invite.send", { to })!;
    const ranked = routeOf("invite.send", { to, mode: "ranked" })!;
    const odd = routeOf("invite.send", { to, mode: "admin" })!;
    expect(ranked.body).toEqual({ ...(plain.body as object), mode: "ranked" });
    expect(odd.body).toEqual(plain.body);
    expect(parseApiRequest({ id: "a1", op: "invite.send", args: { to, mode: "ranked" } })?.args).toMatchObject({ mode: "ranked" });
  });

  it("progress routes (gap plan P2 rewards-cloud): the blob as one long string, guests with a session too", () => {
    const blob = JSON.stringify({ v: 1, unlocks: Array.from({ length: 200 }, (_, i) => `coat.clem.loop.x${i}`) });
    expect(blob.length).toBeGreaterThan(140);
    expect(parseApiRequest({ id: "a1", op: "progress.sync", args: { blob } })?.args).toEqual({ blob });
    expect(routeOf("progress.sync", { blob })).toEqual({ method: "POST", path: "/pawlegends/progress", body: { blob }, auth: "any" });
    expect(routeOf("progress.sync", {})).toBeNull();
    expect(routeOf("progress.sync", { blob: "x".repeat(30001) })).toBeNull();
    expect(routeOf("progress.get", {})).toEqual({ method: "GET", path: "/pawlegends/progress", auth: "any" });
    // only the blob may be long
    expect(parseApiRequest({ id: "a1", op: "progress.sync", args: { name: "x".repeat(141) } })?.args).toEqual({});
  });

  it("live ops routes (LIVEOPS.md): a public config, session claims and a one-letter vote", () => {
    expect(routeOf("liveops.config", {})).toEqual({ method: "GET", path: "/pawlegends/config", auth: "none" });
    expect(routeOf("liveops.me", {})).toEqual({ method: "GET", path: "/pawlegends/config/me", auth: "any" });
    expect(routeOf("liveops.claim", {})).toMatchObject({ method: "POST", path: "/pawlegends/config/goal/claim", auth: "any" });
    expect(routeOf("liveops.nap", {})).toMatchObject({ method: "POST", path: "/pawlegends/config/nap/claim", auth: "any" });
    expect(routeOf("liveops.vote", { option: "b" })).toEqual({ method: "POST", path: "/pawlegends/config/vote", body: { option: "b" }, auth: "any" });
    expect(routeOf("liveops.vote", { option: "c" })).toBeNull();
    expect(routeOf("liveops.vote", {})).toBeNull();
  });

  it("push routes (SHARE-PUSH.md §2): a public key, a device subscription with a long endpoint, prefs and off", () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${"x".repeat(300)}`;
    const args = { endpoint, pushKey: "B".repeat(87), pushAuth: "A".repeat(22), cats: "invite,nap", tz: -180 };
    expect(parseApiRequest({ id: "a1", op: "push.subscribe", args })?.args).toEqual(args);
    expect(routeOf("push.key", {})).toEqual({ method: "GET", path: "/pawlegends/push/key", auth: "none" });
    expect(routeOf("push.subscribe", args)).toEqual({
      method: "POST",
      path: "/pawlegends/push/subscribe",
      body: { endpoint, p256dh: "B".repeat(87), auth: "A".repeat(22), cats: "invite,nap", tz: -180 },
      auth: "any",
    });
    expect(routeOf("push.subscribe", { ...args, endpoint: "http://fcm.googleapis.com/x" })).toBeNull();
    expect(routeOf("push.subscribe", { ...args, pushKey: "short" })).toBeNull();
    expect(routeOf("push.subscribe", { ...args, cats: "invite,spam" })).toMatchObject({ body: { cats: "" } });
    expect(routeOf("push.prefs", { endpoint, cats: "" })).toEqual({ method: "POST", path: "/pawlegends/push/prefs", body: { endpoint, cats: "" }, auth: "any" });
    expect(routeOf("push.off", { endpoint })).toEqual({ method: "POST", path: "/pawlegends/push/unsubscribe", body: { endpoint }, auth: "any" });
    expect(routeOf("push.off", {})).toBeNull();
    // only the endpoint may be that long
    expect(parseApiRequest({ id: "a1", op: "push.off", args: { endpoint: "x".repeat(1001) } })?.args).toEqual({});
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
    // the social sidebar: Away, a preset note (-1 clears it), a favourite by code; free text never passes
    expect(routeOf("social.me", { away: true, note: 3 })?.body).toEqual({ away: true, note: 3 });
    expect(routeOf("social.me", { note: -1 })?.body).toEqual({ note: null });
    expect(routeOf("social.me", { note: "Looking for duo" })?.body).toEqual({});
    expect(routeOf("social.me", { code: "PL-7KQ2-M9XR", favOn: true })?.body).toEqual({ fav: { code: "PL-7KQ2-M9XR", on: true } });
    expect(routeOf("social.me", { code: "../x", favOn: true })?.body).toEqual({});
  });

  it("club and kudos routes (CLUBS-KUDOS.md §3, §5): registered only, names are list positions, club threads chat", () => {
    expect(routeOf("club.get", {})).toEqual({ method: "GET", path: "/pawlegends/clubs/me", auth: "registered" });
    expect(routeOf("club.create", { name: "3.7" })?.body).toEqual({ name: "3.7" });
    expect(routeOf("club.create", { name: "Rude words" })).toBeNull();
    expect(routeOf("club.join", { code: "CL-7KQ2M9" })?.body).toEqual({ code: "CL-7KQ2M9" });
    expect(routeOf("club.join", { code: "../x" })).toBeNull();
    expect(routeOf("club.remove", { to: "0123456789ab" })?.body).toEqual({ to: "0123456789ab" });
    expect(routeOf("club.remove", { to: "PL-7KQ2-M9XR" })).toBeNull();
    expect(routeOf("club.claim", {})).toMatchObject({ method: "POST", path: "/pawlegends/clubs/chest/claim" });
    // social sidebar round 8: the pulse names the device (m phone or tablet, d computer); anything else is dropped
    expect(routeOf("social.pulse", { rev: "r1", dev: "m" })?.path).toBe("/pawlegends/social/pulse?rev=r1&dev=m");
    expect(routeOf("social.pulse", { dev: "x" })?.path).toBe("/pawlegends/social/pulse");
    expect(routeOf("kudos.give", { room: "r1", slot: 2 })).toEqual({ method: "POST", path: "/pawlegends/kudos", body: { room: "r1", slot: 2 }, auth: "registered" });
    expect(routeOf("kudos.give", { room: "r1", slot: 12 })).toBeNull();
    const club = "cAAAAAAAAAAAAAAAAAAAAAA";
    expect(routeOf("chat.history", { thread: club })?.path).toBe(`/pawlegends/social/chat/${club}`);
    for (const op of ["club.get", "club.create", "club.join", "club.leave", "club.remove", "club.claim", "kudos.give"] as const)
      expect(routeOf(op, { name: "3.7", code: "CL-7KQ2M9", to: "0123456789ab", room: "r1", slot: 1 })?.auth).toBe("registered");
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
