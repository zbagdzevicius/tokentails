/**
 * Casual and Classic PvP bots trickle in (founder, 2026-11-17): no bot seat before 17 s of search, then one every 3 s,
 * players first. The backend's matchmaker seats them (backend/src/pawlegends/mm/mm-limits.ts `MM_CASUAL.fillStartMs`,
 * `fillStepMs`, `trickleBots`: keep both copies equal); the queue card shows the same schedule as bot pips. Ranked keeps
 * its own fill (RANKED_BOTS).
 */
export const BOT_TRICKLE = Object.freeze({ startS: 17, stepS: 3 });

/** Bot seats open after `waitedS` seconds of search. */
export function trickleBots(waitedS: number): number {
  if (!(waitedS >= BOT_TRICKLE.startS)) return 0;
  return Math.floor((waitedS - BOT_TRICKLE.startS) / BOT_TRICKLE.stepS) + 1;
}

/**
 * The bot pips on a PvP queue card: the open bot seats, never the last seat of the other team (a PvP match needs a
 * player there, so the card never looks full while it waits for one). Fills this team's empty seats first.
 */
export function queueBots(waitedS: number, teamSize: number, mine: number, theirs: number): { mine: number; theirs: number } {
  const freeMine = Math.max(0, teamSize - mine);
  const freeTheirs = Math.max(0, teamSize - Math.max(1, theirs));
  const open = Math.min(trickleBots(waitedS), freeMine + freeTheirs);
  const m = Math.min(open, freeMine);
  return { mine: m, theirs: open - m };
}
