# Paw Legends live spectating

Status: shipped Nov 14 2026 (gap V4, `research/gaps.md`). PROTO 7. No sim change: spectators re-simulate the room's
TURN log with the frozen sim on their own device, as the players do (`MULTIPLAYER.md` §1.4).

## 1. Entry points

- **Friend row in Social** (`social/socialSheet.ts`): a friend whose presence is `match` with a `room` shows **Watch**
  (instead of the "…" menu). Not while the viewer is in a party lobby (Invite wins there).
- **"Watch live" row** at the top of the Friends tab when the relay reports a featured-watchable match
  (`social.get` → `live.featured`).
- **Link** `?watch=<room>` or `?watch=featured` (the e2e path; a player may share it). A `?party=` link wins.

No new start buttons: watching is not playing; the one play path (PLAY → mode → variant) is untouched.

## 2. Delays and caps (`src/net/proto.ts`, shared with the relay)

| Room | Delay | Why |
|---|---|---|
| Friend party, Quick Play co-op | 15 s | No human opponent to ghost |
| Casual PvP, 5v5 Classic | 45 s | Anti-ghosting (LoL: 3 min; our matches are 7–15 min) |
| Ranked | 90 s | Anti-ghosting |

Caps: 20 spectators per room, 500 per relay, 2 spectating sockets per identity. The e2e harness uses 4 s
(`PAWLEGENDS_SPECTATE_DELAY_MS`), specs 1 s (`RelayOptions.spectateDelayMs`, constructor only).

## 3. Protocol (PROTO 7)

Client → relay: `spectate{room}` or `spectate{featured:true}` (exactly one), `spectate.leave`, `sync{fromTurn}`.
Relay → client: `match` with `you.slot = -1` and `watch{delayMs, follow, viewers, max, kind, featured?}`, then (after the
client's first `sync`) CATCHUP chunks up to `nextTurn − delay`, then TURN frames as they are released;
`spectate{viewers}` (coalesced to the watch tick); the delayed `end` (`scored:false`, `why:'spectator'`) after the
tail has played out at match pace. Errors: `watch_none`, `watch_full`, `watch_update` (never sent to PROTO ≤ 6).

Refusals: the room is not live here, is ending/moving, a seated player turned "Let friends watch" off, the viewer's
identity sits in it, the viewer's sim differs (`watch_update`), or a cap is hit. A socket in a party or queue never
watches (the viewer uses its own socket, with no resume token). A CMD from a spectator is a strike; BEAT/HASH/away/back
are ignored. Featured pick (`backend/src/pawlegends/party/spectate.ts`): PvP first, then more humans, 5v5, the longer
match; rooms under 30 s are never featured.

Presence: the relay's presence row carries `room` for a watchable match; `readPresence` passes it to accepted,
unblocked friends only (as the party code). The relay also writes the `~live` presence row (`live.rooms`), which
`social.get` reads as `live.featured`.

## 4. Client (`src/spectate/`)

- `NetHost` in spectate mode (`NetHostOptions.spectate`): the same host and worker (NetCore + Pacer) as party play,
  started on the followed slot (its team's fog and events). It sends no command, hash, vote, social, chat, away or
  back; only `sync` (start, gaps, reconnect, a visible tab) and `spectate.leave`.
- `viewer.ts`: own `PartySocket` (no stored resume token), a `MatchSession` with `replay: true` and
  `spectate: {names}` (relay names on plates, no match chat), and the spectate bar: Leave, LIVE + delay, viewer
  count, one chip per hero of both teams (follow; downed heroes dimmed), Free cam (drag), Scores (or hold Tab).
  The bar replaces the touch controls, so the phone HUD footprint does not grow. Esc leaves.
- Errors show a card (Nothing to watch / Match is full / Update to watch / Already watching / Lost the live view).

## 5. Privacy

Settings → **Let friends watch my matches** (default on, per device). Off, the party socket's `hello.hint.watch` is
`false`; the relay closes any room the player sits in to spectators (friends and featured), drops current spectators
and leaves `room` out of presence. Spectators see the same display names teammates see.

## 6. Analytics

`spectate_open{featured}`, `spectate_error{why, featured}`, `spectate_end{featured}`; relay logs `spectate_start`,
`spectate_refused`.

## 7. Follow-ups

- Cross-relay spectating (a room on another pool's relay answers `watch_none`; a deploy handoff reconnects spectators
  to the claiming relay, which works once it holds the room).
- Switching the fog team mid-watch in PvP (today: the followed friend's team; the camera can follow any hero).
- A Watch entry from the in-app friend presence card on Home (Social sheet only today).
