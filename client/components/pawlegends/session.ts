/**
 * What the `/pawlegends` host tells the game in its `session` message: whether an account is signed in and the
 * account's server progress (the `/heist` `session.ts` pattern). The fields come from `GET /user/profile`
 * (`PROFILE_PROJECTION`), written only by the replay-verified branch of `POST /user/catbassadors/live`.
 */
import { PAWLEGENDS_LEVELS, PAWLEGENDS_MAX_TICKS } from "@/shared-contracts/caps";
import { progressOf, type PawlegendsProgress } from "./bridge";

/** The profile fields `/live` maintains for Pawlegends, keyed by difficulty. */
export interface PawlegendsProfileFields {
  pawlegendsCatnip?: unknown;
  pawlegendsMatches?: unknown;
  pawlegendsFastestWin?: unknown;
  catnipCount?: unknown;
}

/** Server progress from a profile, every level present. Null when the profile has no Pawlegends fields. */
export function progressFromProfile(profile: PawlegendsProfileFields | null | undefined): PawlegendsProgress | null {
  if (!profile) return null;
  const { pawlegendsCatnip, pawlegendsMatches, pawlegendsFastestWin } = profile;
  if (pawlegendsCatnip == null && pawlegendsMatches == null && pawlegendsFastestWin == null) return null;
  return progressOf({ catnip: pawlegendsCatnip, matches: pawlegendsMatches, fastestWin: pawlegendsFastestWin });
}

/** The answer of a saved `/live` call (`IPawlegendsLiveResult`), read defensively. */
export interface PawlegendsLiveAnswer {
  difficulty: string;
  outcome: "won" | "lost";
  catnipPaid: number;
  catnipCount: number | null;
  fastestWin: number | null;
}

const int = (value: unknown, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null;

export function liveAnswerOf(body: unknown): PawlegendsLiveAnswer | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.difficulty !== "string" || !PAWLEGENDS_LEVELS.includes(b.difficulty)) return null;
  if (b.outcome !== "won" && b.outcome !== "lost") return null;
  const fastest = int(b.fastestWin, PAWLEGENDS_MAX_TICKS);
  return {
    difficulty: b.difficulty,
    outcome: b.outcome,
    catnipPaid: int(b.catnipPaid, 10_000) ?? 0,
    catnipCount: int(b.catnipCount, 100_000_000),
    fastestWin: fastest && fastest > 0 ? fastest : null,
  };
}

/**
 * The profile after one saved match, so the next `session` carries it without a refetch: one more match on the
 * difficulty, the first-win catnip and the fastest win the server answered. Null fields are left alone.
 */
export function profileAfterSave(
  profile: PawlegendsProfileFields | null | undefined,
  answer: PawlegendsLiveAnswer
): Required<Pick<PawlegendsProfileFields, "pawlegendsCatnip" | "pawlegendsMatches" | "pawlegendsFastestWin">> & {
  catnipCount?: number;
} {
  const now = progressFromProfile(profile) ?? progressOf({})!;
  const level = answer.difficulty;
  const matches = { ...now.matches, [level]: Math.min(PAWLEGENDS_MAX_TICKS, (now.matches[level] ?? 0) + 1) };
  const catnip = { ...now.catnip, [level]: (now.catnip[level] ?? 0) + answer.catnipPaid };
  const fastestWin = { ...now.fastestWin };
  if (answer.fastestWin) fastestWin[level] = answer.fastestWin;
  return {
    pawlegendsCatnip: catnip,
    pawlegendsMatches: matches,
    pawlegendsFastestWin: fastestWin,
    ...(answer.catnipCount !== null ? { catnipCount: answer.catnipCount } : {}),
  };
}

/** How the page was opened, for `pawlegends_open {from}`: the picker link carries `?from=picker`. */
export function openedFrom(search: string): string {
  const from = new URLSearchParams(search).get("from");
  return from && /^[a-z0-9_-]{1,24}$/i.test(from) ? from : "direct";
}
