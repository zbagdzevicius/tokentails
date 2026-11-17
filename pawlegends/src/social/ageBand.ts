/**
 * The player's age band as the server last told this device (SOCIAL-RANKED.md §2.2, `GET social` `me.ageBand`), for
 * one use only: a bot match's chat (MATCH-CHAT.md §4.4). In a bot match nobody else reads the log, but the kids rule
 * still holds: typing shows only for a known 16-17 or 18+ band; under 16, unknown, a guest or no stored value means
 * quick chat only. Written when the Friends sheet loads its state (and cleared there when signed out). Party and
 * matchmade games never use it: the relay decides their tier from the server's own record.
 */
const KEY = "pl.ageBand";

export type AgeBand = "under16" | "16-17" | "18+";

export function rememberAgeBand(band: string | null | undefined): void {
  try {
    if (band === "under16" || band === "16-17" || band === "18+")
      localStorage.setItem(KEY, band);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: quick chat only */
  }
}

/** A typed line is allowed in a bot match's chat: the last known band is 16+. */
export function soloTextAllowed(): boolean {
  try {
    const b = localStorage.getItem(KEY);
    return b === "16-17" || b === "18+";
  } catch {
    return false;
  }
}
