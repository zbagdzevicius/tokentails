/**
 * Casual and Classic PvP bots trickle in (founder, 2026-11-19: "add a bot / 3s from 3s, not from 17s"): no bot seat
 * before 3 s of search, then one every 3 s, players first. The backend's matchmaker seats them
 * (backend/src/pawlegends/mm/mm-limits.ts `MM_CASUAL.fillStartMs`, `fillStepMs`, `trickleBots`: keep both copies
 * equal); the queue card shows the same schedule as bot pips. Casual 3v3 fills a whole team of bots too (a lone search
 * plays at 15 s); Classic still waits for a player on the other team. Ranked keeps its own fill (RANKED_BOTS).
 */
export const BOT_TRICKLE = Object.freeze({ startS: 3, stepS: 3 });

/**
 * The move to co-op holds the entry this long so Keep waiting can still be tapped (backend mm-limits.ts
 * `MM_CASUAL.switchGraceMs`: keep equal). The server reports it as a low-priority wait, but it is no leaver penalty: the
 * queue card shows no "Short wait after leaving matches" for it.
 */
export const COOP_SWITCH_GRACE_S = 5;

/** Bot seats open after `waitedS` seconds of search. */
export function trickleBots(waitedS: number): number {
  if (!(waitedS >= BOT_TRICKLE.startS)) return 0;
  return Math.floor((waitedS - BOT_TRICKLE.startS) / BOT_TRICKLE.stepS) + 1;
}

/**
 * The bot pips on a PvP queue card: the open bot seats, this team's empty seats first. Casual 3v3 (`botTeam`) fills the
 * other team to the last seat (the matchmaker seats a team of bots); Classic never fills the other team's last seat (it
 * needs a player there, so the card never looks full while it waits for one).
 */
export function queueBots(waitedS: number, teamSize: number, mine: number, theirs: number, botTeam = teamSize === 3): { mine: number; theirs: number } {
  const freeMine = Math.max(0, teamSize - mine);
  const freeTheirs = Math.max(0, teamSize - (botTeam ? theirs : Math.max(1, theirs)));
  const open = Math.min(trickleBots(waitedS), freeMine + freeTheirs);
  const m = Math.min(open, freeMine);
  return { mine: m, theirs: open - m };
}
