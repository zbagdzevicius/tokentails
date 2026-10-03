/*
 * The season band (plan G5 P6). A season is one codex phase. The backend owns every instant
 * (`season` in `GET /user/airdrop/progression`, from `seasonTimes()` in
 * backend/src/user/codex-reset.ts): counters freeze at 22:00 UTC on the 8th (`freezeAt`), the reset
 * runs at 23:00 UTC (`resetAt`) and the next season starts at 00:00 UTC on the 9th (`anchorAt`).
 *
 * The client never computes these dates (the old `getNextMonthStartUtc` counted to the 1st, which
 * was wrong); it only shows them in the viewer's local time.
 */

export interface SeasonTimes {
  freezeAt: string;
  resetAt: string;
  anchorAt: string;
  startedAt: string | null;
  frozen: boolean;
}

const iso = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

/** The `season` object of a progression response, or null when it is missing or malformed. */
export function seasonOf(progression: unknown): SeasonTimes | null {
  if (!progression || typeof progression !== "object") return null;
  const raw = (progression as { season?: unknown }).season;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const freezeAt = iso(s.freezeAt);
  const anchorAt = iso(s.anchorAt);
  if (!freezeAt || !anchorAt || Date.parse(freezeAt) > Date.parse(anchorAt)) return null;
  return {
    freezeAt,
    resetAt: iso(s.resetAt) ?? freezeAt,
    anchorAt,
    startedAt: iso(s.startedAt),
    frozen: s.frozen === true,
  };
}

/**
 * Whether the season's counters stopped: between `freezeAt` and `anchorAt` by the clock when it is
 * known (the band may stay open across the freeze), else the backend's flag.
 */
export function seasonFrozen(season: SeasonTimes, now: Date | null): boolean {
  if (!now) return season.frozen;
  const t = now.getTime();
  return t >= Date.parse(season.freezeAt) && t < Date.parse(season.anchorAt);
}

/**
 * "Thu 8 Oct, 23:00" in the viewer's locale and time zone (or the given ones, for tests). The
 * weekday makes the day unambiguous where the UTC date and the local date differ.
 */
export function localSeasonTime(at: string, locale?: string, timeZone?: string): string {
  const date = new Date(at);
  const day = date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone });
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone });
  return `${day}, ${time}`;
}

/** "5d 3h", "3h 12m" or "12m" until `at`; null once it passed. */
export function seasonLeft(at: string, now: Date): string | null {
  const ms = Date.parse(at) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
