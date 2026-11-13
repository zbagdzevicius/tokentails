# Clubs and good-teammate kudos

Status: shipped 2026-11-13 (gap plan P6, `~/Downloads/paw-legends/research/gaps.md` rows S2, W2, B1). No sim change.

## 1. What players see

- **Social → Clubs.** Without a club: a generated name ("Swift Comets") with a 🎲 reroll and **Create**, or a club code
  and **Join**. In a club: the club card (crest, name, `CL-XXXXXX` code, Copy), the **club chest** bar with three tiers,
  **Open chest** when a tier is waiting, the **Good teammate** card, and Members / 💬 Chat / Leave in the footer.
- **Club chat** opens the DM thread sheet on the club's thread: sender names over each line, Mute, report a line.
- **PvP results**: "Good teammates?" with one 👍 per human teammate. A party mate's button reads "party mate".

## 2. Rules

- Registered accounts only (guests see the sign-in panel). One club per account, 30 members, a 1 h wait after leaving.
  Up to 2 new clubs a day per account.
- Names are two words from fixed lists (`clubs.contracts.ts`), never typed, for every age band, so no moderation queue.
- Blocks: a block either way between a joiner and any member refuses the join with the same answer as a full or unknown
  club. Lines from anyone blocked either way are hidden in club chat.
- The owner can remove a member (second tap confirms); that account cannot join that club again. The owner leaving hands
  the club to the longest-standing member; the last member out deletes the club and its chat.
- Club chat is the friends chat (`chat.service.ts`, thread kind `club`): the same filter, rate limits, cooldowns,
  `chat_mute`, reports, and age tiers. The tier is the strictest of all members, so one under-16 or one account without
  an age band makes the club quick-chat only.

## 3. Chests (no randomness, so no odds)

- **Club chest**, per ISO week (Monday 00:00 UTC): tiers at 8, 20 and 40 verified wins. A win counts when a registered
  member's party or PvP save passes `/user/catbassadors/live` (`applyClubChest`, after the Game row exists), once per
  room, at most 6 per member per UTC day, not over the party daily cap. A member who added a win that week claims each
  reached tier once (this week and last week), whatever club.
- **Good-teammate chest**, per UTC month: tiers at 3, 8 and 15 thumbs-ups received; paid at once when reached.
- Both pay the next item of the current Legends Pass **free row** the player does not own (earned items, shown in the
  apps too), else Yarn (150 club, 100 kudos). Owned rows get source `club` or `kudos`.

## 4. Kudos checks (server)

`POST /pawlegends/kudos {room, slot}`: the stored room is ended, verified, PvP (`config.mode: 'pvp'`), not voided, and
ended under 2 h ago; both players are seated on the same team (3 or 5 a side); the teammate is registered; the two are
not in one `premade` slot group of the matched party (a friends' own party room has no `mm` doc: all pre-made); no block
either way; 40 a day; once per teammate per match.

## 5. Files

Backend `backend/src/pawlegends/clubs/**`, `backend/src/pawlegends/kudos/**`, the `club` thread kind in
`social/chat.service.ts`, the `/live` hook in `pawlegends-party-live.ts`, the purge in `social/social-purge.ts`.
Game `pawlegends/src/social/clubs/**`, `social/kudos.ts`, `ui/css/clubs.css`, the Clubs tab in `social/socialSheet.ts`.
Bridge ops `club.get|create|join|leave|remove|claim`, `kudos.give` (game, host, `shared/pawlegends-bridge.fixtures.json`).

## 6. Follow-ups

- Club-only cosmetics (a club title or frame) need catalogue entries in both copies of the catalogue.
- Solo verified wins do not fill the chest yet (party and PvP only).
- A club badge on Home, club search and a recruiting list.
