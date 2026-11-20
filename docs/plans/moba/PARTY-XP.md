# Party XP bonus

Founder, Nov 20: "create a feature that party gives 50%+ xp boost". Playing with friends pays more Legends Pass Season
XP. It is paid on the server, inside the one party score writer; the game only shows it.

## Rule

| Party mates in the match | Bonus on the match's Season XP |
|---|---|
| 0 (solo, or only strangers from the queue) | none |
| 1 | +50% |
| 2 or more (a full 3v3 party, a 5v5 premade) | +75% |

Why it scales: a full party is the best experience and the hardest to organise, so it earns a little more; capping at
+75% keeps a 5-stack of alts from multiplying XP without limit.

- **Which XP.** Season XP (the Legends Pass): the match part (result, takedowns, scaled per minute for short modes) is
  multiplied, then the first win of the day is added flat (it is a daily bonus, not match XP). Yarn, catnip, champion
  mastery and the account level (which counts matches) are unchanged.
- **Who is a party mate.** Another human from the player's own pre-made party, seated in the same room:
  - a friends' own party room: every member at the start;
  - Quick Play co-op (Ranked vs AI included): the friend party that queued together, never the strangers it was
    matched with or a backfill;
  - casual PvP and 5v5 Classic: the matchmaker's pre-made groups (`premade`).
  The relay stores the groups on the room when it starts (`StoredRoom.premade`, `party-bonus.ts premadeAtStart`).
- **Anti-abuse.** A mate counts only when its seat is ticketed, is not the same account or guest key as the player,
  and was not flown by a bot for more than half the match (the same AFK rule that gates the save). Only verified
  party matches pay (pure bot practice and Practice mode pay no Season XP at all). A room made before this release has
  no `premade` and pays no bonus.
- **Caps.** The party writer's daily cap (30 scored party matches a UTC day) counts matches, not XP: a match over it
  pays 0 Season XP, bonus included. The bonus never touches the solo gates (solo saves are never party matches). No
  XP cap needed raising.

## Where

- Backend: `backend/src/pawlegends/party-bonus.ts` (`premadeAtStart` for the relay, `partyMatesOf` for the writer),
  `pawlegends-catalog.ts` (`PARTY_XP_BONUS`, `partyXpBonusPct`, `seasonXpFor({partyPct})`),
  `pawlegends-season.service.ts` (`addSeasonXp`: `partyMates` in, `partyBonus: {mates, pct, xp}` out),
  `pawlegends-party-live.ts` (passes `partyMatesOf(room, slot, ticks)`), `party/party-relay.ts` (stores `premade`).
- `POST /user/catbassadors/live` (party): `season.partyBonus` (docs/API.md).
- Game (`pawlegends/src/meta/partyBonus.ts`, mirror of the numbers):
  - party lobby title: "Party bonus +50% XP" (+75% with three), or "Invite a friend: +50% XP" while alone;
  - queue card (a friend party searching): the same chip;
  - Home's Party pill: "Play with friends · +50% XP";
  - results, Pass block: "Party bonus +50%: +N Season XP" (the local Treat Track adds the same bonus; the server's
    Season XP is the one that counts).
  The client counts its own friends from the last friend lobby it saw (`partyClient.friendMates`); a player matched
  into another party's room as a stranger sees no chip, and the server decides either way.

## Tests

- `backend/src/pawlegends/party-bonus.spec.ts`: the numbers, the groups at the start, who counts, caps, the writer.
- `pawlegends/tests/unit/party-bonus.test.ts`: chip, lobby, queue card, Home pill, results line.
- `pawlegends/tests/e2e/mp/party-xp.spec.ts`: two players in a party see the chip, play, surrender, and both results
  show the line (relay harness: `playwright test -c playwright.mp.config.ts party-xp`).
