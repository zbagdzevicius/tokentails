/**
 * Party XP bonus (docs/plans/moba/PARTY-XP.md; founder, Nov 20: "create a feature that party gives 50%+ xp boost").
 * A party match played with other humans from the player's own pre-made party pays +50% match XP with one mate, +75%
 * with two or more. The server pays it (backend `party-bonus.ts`, the `/live` party writer); this mirror shows it: the
 * chip on the party lobby and the queue card, the Party button's line, and the results' Pass block. Pure, first-load safe
 * (no imports).
 */

/** Keep in step with the backend's PARTY_XP_BONUS (pawlegends-catalog.ts). */
export const PARTY_XP_BONUS = Object.freeze({ oneMate: 50, moreMates: 75 });

/** +50% with one party mate, +75% with two or more, 0 alone. */
export function partyBonusPct(mates: number): number {
  const n = Math.floor(Number(mates) || 0);
  if (n <= 0) return 0;
  return n === 1 ? PARTY_XP_BONUS.oneMate : PARTY_XP_BONUS.moreMates;
}

/** The XP the bonus adds to a match's XP (the backend rounds the same way). */
export function partyBonusXp(matchXp: number, mates: number): number {
  const pct = partyBonusPct(mates);
  return pct > 0 ? Math.round((Math.max(0, matchXp) * pct) / 100) : 0;
}

/** The Party button's line on Home ("Play with friends · +50% XP"). */
export const PARTY_BUTTON_LINE = `Play with friends · +${PARTY_XP_BONUS.oneMate}% XP`;

/**
 * The chip on the party lobby and the queue card. `mates` = the other humans in the player's own party: with none, a
 * dim hint that a friend adds the bonus.
 */
export function partyBonusChipHtml(mates: number): string {
  const pct = partyBonusPct(mates);
  if (pct > 0) return `<span class="pp-xp-bonus on" data-testid="party-xp-bonus" data-pct="${pct}">Party bonus +${pct}% XP</span>`;
  return `<span class="pp-xp-bonus" data-testid="party-xp-bonus" data-pct="0">Invite a friend: +${PARTY_XP_BONUS.oneMate}% XP</span>`;
}

/** The results' Pass block line ("Party bonus +50%: +40 Season XP"). */
export function partyBonusLineHtml(b: { pct: number; xp: number } | null | undefined): string {
  if (!b || b.pct <= 0 || b.xp <= 0) return '';
  return `<p class="bonus party" data-testid="results-party-bonus" data-pct="${b.pct}">Party bonus +${b.pct}%: +${b.xp} Season XP</p>`;
}

/**
 * Other humans from this player's own friend party in the current party view: the members of the last friend lobby
 * (`friends`, the ids seen before a Quick Play match added strangers) still in the party, never the player itself.
 */
export function friendMates(view: { you: string; members: readonly { id: string }[] } | null | undefined, friends: ReadonlySet<string>): number {
  if (!view) return 0;
  return view.members.filter((m) => m.id !== view.you && friends.has(m.id)).length;
}
