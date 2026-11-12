/**
 * The /pawlegends session payload: the session progress read from the profile and moved forward by a `/live` answer.
 * (The roster and featured-cat payloads were removed with the cats-become-skins feature: NO-TOKENTAILS.md.)
 */
import { liveAnswerOf, openedFrom, profileAfterSave, progressFromProfile } from "@/components/pawlegends/session";

describe("session progress", () => {
  it("reads the profile fields, every level present", () => {
    expect(progressFromProfile({})).toBeNull();
    expect(progressFromProfile({ pawlegendsMatches: { easy: 2 } })).toEqual({
      catnip: { easy: 0, normal: 0, rookie: 0, hard: 0 },
      matches: { easy: 2, normal: 0, rookie: 0, hard: 0 },
      fastestWin: { easy: 0, normal: 0, rookie: 0, hard: 0 },
    });
  });

  it("a /live answer moves the profile forward (one match, the first-win catnip, the fastest win)", () => {
    const answer = liveAnswerOf({ difficulty: "normal", outcome: "won", catnipPaid: 40, catnipCount: 300, fastestWin: 12000 })!;
    expect(
      profileAfterSave({ pawlegendsCatnip: { easy: 20 }, pawlegendsMatches: { easy: 4, normal: 1 }, pawlegendsFastestWin: { easy: 9000 } }, answer)
    ).toEqual({
      pawlegendsCatnip: { easy: 20, normal: 40, rookie: 0, hard: 0 },
      pawlegendsMatches: { easy: 4, normal: 2, rookie: 0, hard: 0 },
      pawlegendsFastestWin: { easy: 9000, normal: 12000, rookie: 0, hard: 0 },
      catnipCount: 300,
    });
    expect(liveAnswerOf({ difficulty: "nightmare", outcome: "won" })).toBeNull();
    expect(liveAnswerOf({ difficulty: "easy", outcome: "lost", catnipPaid: 0, catnipCount: 5, fastestWin: null })).toMatchObject({
      fastestWin: null,
    });
  });

  it("openedFrom reads ?from= and defaults to direct", () => {
    expect(openedFrom("?from=picker")).toBe("picker");
    expect(openedFrom("")).toBe("direct");
    expect(openedFrom("?from=<x>")).toBe("direct");
  });
});
