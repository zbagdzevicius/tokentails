# W1-CODEC: room codec v2, replay-only ghosts, routes, room links, creator codes, payload hash

No `types.ts` change needed. Every existing export and signature is kept. `npx tsc --noEmit` is clean. `src/codec`
has 108 tests, all green. When this was written, the other failures in the full run were in `src/sim/golden-v4.test.ts`
and `src/audio/audio.test.ts`, which belong to other lanes that are still in progress.

## Files

- `src/codec/room-codec.ts`: encoder v2, decoder for v1 and v2.
- `src/codec/room-v1.fixtures.ts`: v1 codes and the decoded rooms, captured with the old codec before the change.
- `src/codec/creator-code.ts`: `creatorCode`, `payloadHash`.
- `src/codec/link.ts`: routes, room links, ghost versions, score hints, `via` filter.
- `src/codec/index.ts`: new exports; `codec` object now has `encodeRoom`, `decodeRoom`, `payloadHash`, `creatorCode`.
- `src/codec/codec-v2.test.ts` (new); `codec.test.ts` and `link.test.ts` were updated in 2 places (see the end of this note).

## New exports (`../codec`)

`creatorCode(raw): string | null`, `payloadHash(s): string`, `roomGameplayHash(room): number`, `routeParams(route, raw)`,
`daySlug`, `parseDaySlug`, `LINK_ROUTES`, `ROUTE_PARAMS`, `ROOM_THEMES`, `ROOM_MAX_PROPS` (63), `ROOM_TITLE_MAX` (24),
`ROOM_NAME_MAX` (12), `ROOM_MAX_ANCESTORS` (3). `ROOM_CODE_VERSION` is now 2. `RawGhostParam` gains an optional `s`.

## Room codec v2 bit layout (MSB first, then CRC-16/CCITT-FALSE, base64url)

| Field | Bits | Notes |
|---|---|---|
| version | 4 | 2 (1 = v1, read only) |
| shell | 4 | 0..15 |
| routine | 4 | 0..15 |
| routine2 | 4 | 15 = none (then `routine2` is absent) |
| event | 4 | 0..11 (RoomEventKind); 12..15 is rejected |
| theme | 3 | `RoomTheme` declaration order: default, xmas, birthday, wedding, nye, valentine, thanksgiving, spring |
| boss | 1 | `boss: true` |
| telegraph | 5 | 0 = none, else ticks (1..31) |
| size | 2 | 0 = 12x10 / RUN_TICKS, 1 = 14x12 / BOSS_TICKS; 2..3 rejected |
| spawn x, z | 4 + 4 | must be inside the room |
| prop count | 6 | max 63 (encode throws above) |
| per prop: kind | 7 | |
| x, z | 4 + 4 | inside the room |
| level, rot | 2 + 2 | |
| target | 1 | |
| ext | 1 | set when `w` or `d` is defined |
| w-1, d-1 (if ext) | 3 + 3 | extents 1..8; a missing one decodes as 1; `x+w` and `z+d` must fit the room |
| cable | 1 | |
| cable x, z (if cable) | 4 + 4 | inside the room |
| title | 7 + 8·n | byte length + UTF-8, filtered (`filterTitle`, ≤ 24 code points) on encode and decode |
| author | 6 + 8·n | byte length + UTF-8, `filterName` ≤ 12 |
| ancestor count | 2 | ≤ 3; the encoder keeps the last 3 (nearest) non-empty filtered names |
| ancestor | 6 + 8·n each | `filterName` ≤ 12 |

- **Id and seed (decision):** a v2 room gets `ugc-<crc32 hex>` and `seed = crc32`, where the CRC is taken over
  the gameplay part only (version through the last prop). This means a rename, or a remix that only changes the
  credits, keeps the id, the seed and the ghosts. v1 rooms keep the CRC over the whole v1 body, as before.
- **Ancestors** in v2 are author names (GDD 6.4, "Remix of Zyg's Kitchen by Mia"). The v1 12-character base64url
  ancestors still decode as they did before.
- **Size:** the worst-case boss room (60 props, extents, cables, full text) is 339 characters. The worst-case link
  (v2 boss room + 2 recorded-like 90 s ghosts + 2 cats + names + scores + via) is 1,239 characters, under the
  1,600 limit.

## Ghosts in links

- A ghost whose header `simVersion` is between `MIN_REPLAY_SIM_VERSION` (4) and `SIM_VERSION` (5) is kept.
  `GhostRef.simVersion` is always set. `replayOnly` is always set as a boolean (`simVersion < SIM_VERSION`). Any
  other version is dropped, and so is a ghost from another room.
- Optional score hints `s` / `s2` must match `^\d{1,9}$` and become `GhostRef.score`. `rp` takes `s` only when
  there is no `g`.
- `parseLink` is still sync: `ghosts: []`, and it decodes only a plain `rp`. `parseLinkFull` is async.

## Routes (`/badcat/<route>?…`, hash form `#route=<route>&…`, bare `#<route>`, pre-rendered `<route>.html`)

| Route | Params (anything else is dropped) | Rule |
|---|---|---|
| thanks | `session_id` | `^cs_(test\|live)_[A-Za-z0-9]{8,200}$` |
| redeem | `code` | upper-cased, then `^[A-Z0-9]{6,16}$` |
| restore | `t` | `^[A-Za-z0-9_-]{1,128}$` |
| maker | `r` (room to remix) | decoded into `room` + `roomCode`, `remix: true` |
| club | `sku` | an own key of `BADCAT_SKUS` |
| archive, rapsheet, brand, settings | none | |
| cameo | `sku` | `cameo` or `guest_star` |

Valid params go into `LinkState.params`. `params` is left out when nothing survives. `buildLink` filters
`params` with the same rules. On a route link, ghosts, `rp` and `clip` are not written (except on `maker`).
`via`, `e`, `studio` and `m` are kept.

## Room links

`/r?r=<v2>&g=&c=&gn=&s=&g2=&c2=&gn2=&s2=&remix=1` (and `#r=…`).

- In a room link the ghost names are `gn` / `gn2`, because `n` is the title there.
- `LinkState.roomCode` holds the raw payload.
- A v2 payload carries its own title and author, so `n` / `a` are not written for it.
- `n` / `a` are written only when a **v1** `roomCode` of the same room is re-shared. That payload is reused as it
  is, so its id still keys the old ghosts.
- On parse, `n` / `a` fill only what the payload lacks. The CRC-checked v2 text always wins.
- `remix=1` (or the `maker` route) sets `remix: true`.
- When a link is built, its ghosts are keyed to the id the receiver will decode (`ugc-…`), not to the editor's
  temporary `room.id`.

## Creator codes and payload hash

- `creatorCode(raw)` trims and lower-cases the input, then requires `^[a-z0-9_]{6,12}$` and checks the block list
  (also with `_` read as a space). Inputs longer than 64 characters return null.
- `via` is parsed and built through `creatorCode`. Short codes from older links (2–5 characters, or ones with `-`)
  are now dropped.
- `payloadHash(s)` is the CRC-32 of the UTF-8 bytes, in base36, left-padded to 8 characters.

## For the integrator and other lanes

1. **Room Maker (W2-EDITOR):** test-play and record the maker's clear run on `decodeRoom(encodeRoom(room))`, not on
   the editor's draft. The decoded room has the `ugc-` id and the CRC seed that receivers play. A ghost recorded
   on the draft would desync.
2. Remix: set `ancestors = [...(src.ancestors ?? []), src.author].filter(Boolean)`. The codec keeps the last 3.
3. Report and hide: `payloadHash(link.roomCode ?? ghostPayload)`.
4. The `types.ts` comment on `CodecApi.encodeCat` still says 15 characters; the actual length is 18 (see L2 note 1).
   This is cosmetic.
5. Changes to existing tests:
   - The boss-room size bound in `codec.test.ts` is now 300 (was 240).
   - The `link.test.ts` dare round trip now expects `simVersion: 5, replayOnly: false` on decoded ghosts.

Not done: nothing in scope is left open.
