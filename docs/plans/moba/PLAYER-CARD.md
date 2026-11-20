# Player Card

A player asked (Nov 20, Lithuanian): "on these leaderboards you should be able to tap a nickname and see the player's
profile and their stats, with a button to add them as a friend right away". The founder: "please implement that. even
from match history".

## One place per thing

The Player Card is the Profile screen in its read-only mode (`pawlegends/src/ui/profile/profileScreen.ts` with
`friend`). It is not a second profile with different data. It shows the same identity, level ring, title, border,
flag, rank crest, top champions, season stats (matches, wins and win rate, KDA, MVPs, favourites) and recent matches
as your own profile. A tap on a recent match opens its scoreboard inside the card. Your own code (your Boards row, your
seat) opens your own profile with Edit profile, so there is never a duplicate control.

## Where it opens

| Place | How | Source prop |
|---|---|---|
| Boards, every tab with players (Level, Country, Ranked), my pinned row | the name is a button (`data-player`); my row opens my own profile | `boards` |
| Match history detail, both teams (Profile → Matches, and the history sheet) | the name button (`data-profile`) | `history` |
| End-of-match scoreboard (PvP and matchmade rooms) | a human's name (`data-pslot`); the server names the seat (`history.seat`) | `results` |
| Your party's rows on the results screen | the same, when the room is known | `results` |
| Home's friends panel (FRIENDS.md, Nov 20) | a friend's row; opens on Overview, with Message, Invite, Join, Watch, Ask to join, Invite later, Favourite, Remove and Block | `friends` |

Not wired: Recent players (no code by design, gated by `allowRecent` and the age band), the in-match Tab scoreboard (a
tap there mutes), and party lobby seats (no codes in the party view).

## Bots

A bot or a persona never opens a card. In match history a bot row has no code, so the name is plain text. On the results
screen only human seats (`partyNames[slot]` set, not mine) get a button. Personas keep a plain name that looks like a
player's, with no tag. The seat route answers 404 "no player" for a bot seat and never says "bot".

## Actions

- **Add friend**: one tap, `friend.add {code}`. It reads Request sent. If they had asked first, the server accepts at
  once and the card reads Friends.
- **Accept request**: when the server says `rel: asked`, via `friend.accept {code}`.
- **Friends**: a state with a tick, plus Message, plus Invite to party when `online` is true.
- **Block**: the existing confirm-once flow, for players who are not friends. Report stays on the results screen flag.

## Guests

A guest viewer sees the name, avatar and flag from the row they tapped, plus "Sign in to see their rank, champions,
stats and matches, and to add them as a friend". The card makes no host call and shows only the Overview tab.

## Server

- `GET /pawlegends/history/u/:code`: the first page's `player` block is the whitelist `PublicPlayerCard` plus `rel`
  and `online`. The card body is cached 60 s per player. See docs/API.md, "Paw Legends: Player Card".
- `GET /pawlegends/history/seat/:room/:slot` → `{code, name}`. It answers for a room the caller played, the seat's last
  holder, within the recent window.
- Board rows carry `code` for signed-in callers. The public board route strips it (`withoutCodes`).
- Limits: a friend request is 30/min per account and a code lookup 100 per 10 min, so the card's Add friend never
  stalls.
- Once nickname ids land (nickid), the card keeps using the opaque `code` handle that every social route accepts.

## Analytics (consent-gated, through the game's PostHog helper)

- `profile_card_open {source, guest}`
- `board_player_open {kind, self}`
- `friend_add_from_card {source, outcome: sent | friends | accepted}`

These events never carry a name, code or id.

## Tests

- Backend: `backend/src/pawlegends/history/player-card.spec.ts` covers the field whitelist, `rel` and `online`, the
  cache, the seat route (bot, self, block, old room, stranger room, guest) and codes on the board rows.
- Game unit: `tests/unit/profile-screen.test.ts` (Player Card block), `tests/unit/boards-modal.test.ts` (Player Card
  from Boards) and `tests/unit/player-card.test.ts` (results and party rows).
- Game e2e: `tests/e2e/player-card.spec.ts` covers Boards → card → Add friend → Request sent, Esc keeping Boards open,
  my row opening my profile, a match-history scoreboard name opening a card, and a bot row that cannot be tapped.
- Bridge: `pawlegends-web/__test__/pawlegends/api-bridge.test.ts` (`history.seat`).
