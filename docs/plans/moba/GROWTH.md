# Paw Legends growth: invites, creator codes, the first-purchase gift, consent

Gap package P3 `growth-web` (research `gaps.md` F1, S1, $1, $2, CR1). Cosmetic and attribution only: nothing here is read
by the sim, the replay record or the hash, and no price shows in the iOS or Android apps.

## 1. The consent bar never sits over a match (F1)

- `pawlegends-web/components/pawlegends/PawlegendsConsent.tsx` hides while the game frame runs a match and shows again on
  Home or the results screen. The match state comes from `matchPresence.ts`: the bridge's relayed game events
  (`match_start`, `mp_match_start` start; `match_end`, `mp_match_end`, `title_view`, a `match-result`, a `party-result`
  or a fresh `ready` end), plus the frame's own `html[data-match="live"]` (same origin) for a player who turned the
  game's stats off.
- On a phone (`(max-height: 500px), (max-width: 560px)`) it is a one-line strip at the top of Home.
- Nothing is tracked before the choice: gtm.js still waits for Allow (`analytics/gtm.ts`).
- Checks: `__test__/pawlegends/growth-web.test.tsx`, `e2e/pawlegends-consent-match.spec.ts` (844×390 and 1440×900).

## 2. Invite and comeback codes (S1)

| Rule | Value (`backend/src/pawlegends/growth/growth.rules.ts`) |
|---|---|
| Who may accept | a new player (no saved match, or an account made in the last 14 days) or one back after 21+ days without a saved match |
| Matches to finish | 3 verified matches within 30 days of accepting; a forfeit or a match under 60 s of game time does not count |
| Reward | both players claim one Rare store coat (the first of `INVITE_COATS` they do not own) |
| Once | an account accepts one invite ever; a device accepts one invite ever; swapped codes are refused |
| Caps | an inviter earns at most 5 coats and has at most 10 open invites |
| Rate limits | per account and per IP on every route; redeeming has a daily bucket too |

- Link: `https://pawlegends.app/?ref=CODE`; the landing sends `?ref=` on to `/play` (`routes.json` `playQueryKeys`).
  The web host keeps the code on the device, drops it from the address bar and redeems it once the visitor is signed in
  (`components/pawlegends/invite.ts`).
- The game's Social sheet (Friends tab) has the invite row: the code, progress, Invite (share or copy), Code (type a
  friend's code, works in the apps) and Claim coat (`pawlegends/src/share/invite.ts`). API ops `growth.invite`,
  `growth.redeem`, `growth.claim`.
- The match counter is written only by the `/live` save (`applyInviteProgress`, after the Game row exists).
- Routes: `GET /pawlegends/growth/invite`, `POST /pawlegends/growth/invite/redeem {code, deviceId?}`,
  `POST /pawlegends/growth/invite/claim` (registered accounts).

## 3. Creator codes ($1, CR1)

- `pawlegends.app/creators` explains the program. A creator gets a code from an admin:
  `POST /pawlegends/growth/creators {code, name, shareBps?, active?}` (PermissionGuard MANAGER; default share 20%, GDD
  §8.6; at most 30%).
- The web store sheet has "Have a creator code?". The code is checked as typed (`GET /pawlegends/growth/creators/:code`)
  and again at `POST /pawlegends/checkout/account` (400 `PAWLEGENDS_CREATOR_UNKNOWN`). A valid code stays on the
  account's purchases for 30 days. It is written into the Stripe metadata (`creator`) and onto the purchase row
  (`creatorCode`).
- Payout report: `GET /pawlegends/growth/creators-report?from=&to=` (MANAGER): paid orders per code, gross and the
  creator's share per currency. Refunded orders are not owed.

## 4. The first-purchase gift ($2)

- Before an account's first paid order the web store sheet offers 5 Rare coats (`FIRST_GIFT_COATS`), a fixed choice
  with no chance involved. Owned coats and coats in the order itself cannot be picked.
- The choice goes into the checkout (`giftCoat`), is checked (409 `PAWLEGENDS_GIFT_UNAVAILABLE`), and is written into
  the Stripe metadata (`gift_coat`) and the purchase row. The webhook grants it once per account ever (the unique
  `pawlegendsfirstgifts` row). A refund of that order revokes the coat with the order's items.

## 5. Not done here

- Founder call #7 ("Illustration" label on store art): not applied until the founder confirms.
- Creator payouts are a report only: paying creators (Stripe Connect or manual transfer) and a creator kit (a giveaway
  coat, early reveals) are follow-ups.
- Invite redemption from a deep link inside the native apps (the apps redeem by typing the code).
