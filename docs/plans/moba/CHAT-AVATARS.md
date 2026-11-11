# Friends, chat and player avatars (design)

The founder asked for this, verbatim: "pull wild rift / mobile legends friends system where it would be possible to invite users and message them ( chat ) also create user avatars that'll be displayed when loading a match and in  list. ultracode."

This document builds on `docs/plans/moba/SOCIAL-RANKED.md` (friends, presence, invites, boards, ranked, reports), which is already on `origin/main` 517eafbb. It **replaces** SOCIAL-RANKED §2.2 "No free text exists anywhere" with the chat safety model in §2 below.

Build order: start from `origin/main` **after** `feat/pawlegends-signin` lands, if sign-in touches `lobbyScreen.ts`, `meta/profile.ts` or the profile badge. Chat is for registered accounts only, so sign-in sits in front of all of it.

---

## 0. Summary

- **Friends panel upgrade.** Tabs are Friends / Recent / Requests. Online friends come first. Each row shows the player's avatar, and one tap sends a party invite or opens a chat. The existing Ranked and Boards tabs move behind a header switch, so the sheet keeps at most 3 tabs on phones.
- **Chat**, server-authoritative and stored in Mongo with a 30-day TTL:
  - **DM threads** between accepted friends only.
  - **Party chat** in the party lobby, champion select (`pick`) and results.
  - **Team chat** in matchmade lobbies and pick, as quick-chat ids only, because those teammates are strangers.
  - **In match:** the existing quick-chat wheel only. No free text in a match.
- **Age bands decide what can be typed.**
  - Under-16 and unknown age get preset phrases and stickers only.
  - 16+ get free text with a server filter that **rejects** profanity, emails, phone numbers, links, `@` handles and street addresses.
  - A thread is free text only when **every** participant is 16+.
- **Safety:** rate limits, a 120-character cap, block (hides and refuses), mute (silences notices), and report message. A report copies the evidence into the existing reports and the moderator CMS, and adds a new `chat_mute` sanction. Chat is deleted with the account. Images, files, links and strangers in free text are never allowed.
- **Delivery:**
  - In party, queue or match, over the relay socket.
  - On menus, a 4 s REST poll only while a chat thread is open, plus unread counts on the existing 30 s pulse.
  - DMs are held during a match and their badges show on results.
- **Avatars:** avatar = icon + border, plus an optional title.
  - **Icon:** a champion portrait (every hero, the default), one of your own Token Tails cats, or an earned icon.
  - **Border:** a server-owned frame (store, pass, founder, legend, ranked tier).
  - The choice is stored in `pawlegendssocial` and checked on write.
  - The avatar is carried per member in `PartyView`, so loading and VS cards render without extra fetches. It is returned per row for friends, recent, requests and boards.
  - It shows on loading and VS cards for all players, friends rows, party lobby slots, the scoreboard, results and boards.
- **No feature flags.** Chat is on by default, and gated only by account, age band and the rules here.

---

## 1. What exists (main 517eafbb)

| Area | State | Where |
|---|---|---|
| Social profile | `pawlegendssocial {_id, code, name:{generated}\|{cat,catId}, invisible, allowRecent, rev, rotations}` | `backend/src/pawlegends/social/social.schema.ts` |
| Friends, blocks, presence, invites | Built (caps 100 friends and 200 blocks, presence TTL 2 min, invite TTL 3 min) | `social.service.ts`, `presence.ts` |
| Age bands | `AGE_BANDS = ['under16','16-17','18+']`, `stricterBand()`, rows `pawlegendsbuyers` `account:<id>`; `POST social/age` only moves a band stricter | `pawlegends.contracts.ts` |
| Pulse | `GET social/pulse?rev`, 204 when nothing changed, every 30 s on menus, paused in matches and hidden tabs | `socialSheet.ts`, `embed/api.ts` |
| Relay social | Id-only `{t:'social', kind, id}`, `SOCIAL_COUNT {ping:8, chat:8, emote:4}`, `SocialLimiter`, match seats only | `party-relay.ts`, `net/proto.ts` |
| PROTO | **4**. PROTO 5 (`social.add`, ranked `mm.join`) is designed but not built (SOCIAL-RANKED §19 L3) | `pawlegends/src/net/proto.ts` |
| Party phases | `'lobby' \| 'pick' \| 'loading' \| 'match' \| 'results'` | `proto.ts` |
| `MemberView` | `{id, name, guest, newbie?, card?{image,element,tier,catId?}, ownName?, conn, slot?, hero?, trick?, locked?, loadPct?, again?}` | `proto.ts` |
| Relay identity | Knows `ticket.accountId`, not the age band | `party-relay.ts` |
| Reports | Reasons `afk, grief, cheat, name`; sanctions `warn, queue_lock, ranked_lock, board_exclude, pvp_ban`; kept 180 days; CMS `/pawlegends-reports` | `report.contracts.ts`, `cms/pages/pawlegends-reports.tsx` |
| Text filter | `normalizeCatName`: EN/LT profanity on a folded leet skeleton, Latin-only, invisible characters stripped. No PII rules | `shared/name.ts` |
| Portraits | Rendered at runtime, 128 px data URLs, LRU of 64 (`PORTRAIT_MAX`). **No portrait image files ship** in `pawlegends/public` | `render/portraits.ts` |
| Frames and titles | Server-owned in `pawlegendsowned` (`frame.store.*`, `frame.s1.*`, `frame.legend`, `frame.founder`, `title.*`). The worn choice is only in the local profile | `meta/profile.ts`, `render/cosmetics.ts` |
| Host bridge | `api-request` / `api-result` with an op allowlist. The app shell has none, so calls answer status 0 there | `client/components/pawlegends/apiBridge.ts` |
| Account deletion | Users and cats only. No `pawlegends*` social rows are purged | `backend/src/user/guest/account-deletion.ts` |

---

## 2. Chat safety model (replaces SOCIAL-RANKED §2.2 "No free text")

### 2.1 Who can talk to whom

| Scope | Who | When |
|---|---|---|
| DM | Two **accepted friends**, neither blocking the other | Menus, party lobby, pick, results. Held in match |
| Party | Members of one **friend party** (joined by code or invite, `mm.strangers` false) | `lobby`, `pick`, `results` |
| Team (matchmade) | Your team in a matchmade casual or classic party (`mm.strangers` true) | `lobby`, `pick`, `results`: **quick ids only, never text** |
| In match | Existing quick-chat wheel, pings and emotes (unchanged ids, unchanged team/all rules) | `match` |

Never allowed:
- Chat with a non-friend outside a shared party.
- Global, lobby-wide, all-chat or guild channels.
- Guests in DMs or party text. Guests keep in-match quick chat and get quick ids in party chat.
- Images, files, links or voice.

### 2.2 Chat tier per thread: the strictest participant wins

```
tier(account) = band in {'16-17','18+'} && registered ? 'text' : 'quick'   // unknown band → 'quick'
tier(DM)      = min(tier(a), tier(b))
tier(party)   = !mm.strangers && every member is registered with tier 'text' ? 'text' : 'quick'
tier(team)    = 'quick'
```

- In an 18+ ↔ under-16 DM, **both** sides get quick chat only. This follows Roblox's rule that an adult cannot open free text with a minor.
- A party drops to `quick` the moment an under-16, unknown-age or guest member joins. The UI swaps the input for the phrase tray, and history stays visible.
- The server derives the band, never the client. The API reads `pawlegendsbuyers`. The relay uses a `ChatBandResolver(accountId)` that reads the same row, caches it for 10 min per socket, and also refreshes on `party.join`.
- The first chat open asks for the age band if none is stored. This is the same sheet and the same rule as the Friends age gate (§2.2 of SOCIAL-RANKED). Skipping it means `quick`.

### 2.3 Phrases and stickers (enumerated, wire carries ids)

`CHAT_PHRASES` (24) and `CHAT_STICKERS` (8) are new duplicated constants:
- `shared/chat.ts` (synced to `backend/src/shared-contracts/chat.ts`, the client and the CMS)
- game `src/data/chatPhrases.ts`
- a deep-compare test in the game, listed in `docs/DEVELOPMENT.md` with the other duplicated constants.

Each phrase has scope tags. The wire carries `{k:'q', id}` or `{k:'s', id}`.

| id | Phrase | Scopes |
|---|---|---|
| 0 | Wanna play? | dm |
| 1 | Join my party! | dm |
| 2 | On my way! 🐾 | dm, party |
| 3 | Be right back | dm, party |
| 4 | One more match? | dm, party |
| 5 | GG, well played! | dm, party, team |
| 6 | Thanks! | dm, party, team |
| 7 | Nice moves! | dm, party, team |
| 8 | Good night! 🌙 | dm |
| 9 | Sorry! | dm, party, team |
| 10 | Can't play now | dm |
| 11 | Add me back? | dm |
| 12 | Ready! | party, team |
| 13 | Wait a sec | party, team |
| 14 | I'll tank | party, team |
| 15 | I'll support | party, team |
| 16 | I'll take mid | party, team |
| 17 | Any role is fine | party, team |
| 18 | Nice pick! | party, team |
| 19 | Let's win this! | party, team |
| 20 | Cats rule! 😼 | dm, party, team |
| 21 | Dogs drool 🐶 | dm, party, team |
| 22 | Paws up, team! | party, team |
| 23 | Tail high, try again | dm, party, team |

Stickers 0–7 are 🐾 💖 😹 😾 🐟 🦴 💤 👑. They render as a large glyph bubble, built from existing emoji, with no new assets.

The in-match `CHAT_LINES` (8) and `EMOTES` (4) stay exactly as they are, because `SOCIAL_COUNT` pins their wire ids.

### 2.4 Free-text rules (16+ threads only)

- **Length:** 1–120 characters after normalisation. A single line, with newlines collapsed to spaces.
- **Normalise:** NFKC, strip invisible and bidi characters, collapse runs of 4 or more repeated characters to 3, and trim.
- **Charset:** Latin, Lithuanian letters, digits, basic punctuation and the emoji ranges. Anything else is rejected (`charset`). This stops look-alike scripts.
- **Reject, never mask.** The sender sees "That message can't be sent", with a reason class (`words` / `contact` / `link`) but never the matched token. Nothing is stored for a rejected message. Only a strike counter is kept (§2.6).
- **Filter pipeline:** `shared/chat-filter.ts`, pure and framework-free, used by both the API and the relay:
  1. `skeleton = foldLeet(normalize(text))`, reusing the `name.ts` fold.
  2. **Profanity:** the `name.ts` EN and LT lists per word and over runs of spaced-out letters, plus a chat-only list (slurs, sexual terms, self-harm baiting such as "kys") → `words`.
  3. **Email:** `\S+@\S+\.\S+`, plus spelled forms (`at`/`(at)`/`[at]` … `dot`/`(dot)`) → `contact`.
  4. **Phone:** 7 or more digits after removing spaces, `-`, `.`, `(`, `)`, `+`, including spelled digits ("one two three…", "vienas du…" with 5 or more in a row) → `contact`.
  5. **Links:** `https?://`, `www.`, any `word.(com|net|org|lt|io|gg|me|…)` from a bundled TLD list, "dot" spellings, plus `discord`, `snap`, `insta`, `tiktok`, `whatsapp`, `telegram`, `kik`, `wa.me`, `t.me`, `.gg/` → `link`.
  6. **Handles:** `@\w{2,}` → `contact`.
  7. **Addresses:** a number of 1–4 digits followed by a street name and a street word (`street, st, road, rd, ave, avenue, gatvė`), Lithuanian `Name g. 12` / `pr.` / `al.` forms, and postcode shapes (`LT-\d{5}`, UK and US ZIP patterns) → `contact`.
  8. **Age and meeting probes** ("how old", "where do you live", "send pic", "meet up", "kiek tau metų", "kur gyveni"): rejected as `contact` when the thread is 16-17 ↔ 18+.
- **Tests** are a corpus file of at least 150 should-pass and at least 150 should-reject lines, including leet, spacing and Lithuanian cases (`backend/src/pawlegends/social/chat-filter.corpus.ts`).

### 2.5 Rate limits (`CHAT_LIMITS`, shared)

| Limit | Value |
|---|---|
| Per sender, burst | 5 messages in 10 s |
| Per sender, minute | 20 per minute (all threads) |
| Per sender, day | 400 text + 1,000 quick |
| Per thread | 30 per minute (both sides) |
| Duplicate | The same normalised text 3 times in 60 s is rejected |
| Per IP (API) | 60 per minute (in memory, `ipKey`, never stored) |
| Relay per socket | The existing `SocialLimiter` shape: 5 in 10 s, separate bucket from pings |
| New DM threads | 10 per day (anti-spam to friends) |

### 2.6 Strikes and auto-cooldown

5 filter rejections in 10 minutes give a 10-minute text cooldown (quick ids still work). It is stored as `chatCooldownUntil` on `pawlegendssocial`. Strikes are an in-memory counter plus a daily counter on the same row (`chatStrikes {day, n}`). 20 strikes in a day raises CMS flag **F6**, which only raises priority and never acts.

### 2.7 Block, mute, report

- **Block** (existing `pawlegendsblocks`, either direction): hides the thread, refuses sends both ways with a generic `chat_unavailable` so the sender cannot tell they were blocked, and removes the thread from the list. Party chat from a blocked member is dropped for the blocker client-side (the relay sends `blocks` in the member's own view, below). Matchmaking avoidance stays [infra] (SOCIAL-RANKED §17 #11).
- **Mute thread** (DM or party): no badge, no toast. Messages are still stored and still readable.
- **Mute player in match:** a speaker icon per row on the scoreboard. It is client-side for that match and hides their quick chat and emotes. This joins the existing "mute all opponents".
- **Report message:** long-press or the ⋯ menu on any received bubble → Report → reason `chat` with a sub-reason `harass | sexual | contact | spam | other`, plus a 140-character note for 16+. The flow is the same one-tap style as SOCIAL-RANKED §8.2.
- **Unfriend:** the DM thread becomes read-only for 24 h, then hidden. A re-friend shows the history again while it is inside the 30-day TTL.

### 2.8 Retention and deletion

- Messages carry `exp = at + 30 days` with a TTL index. Threads carry `exp = lastAt + 30 days`.
- Party threads also expire 30 days after the party ends. Party history is shown only while the party exists. It is kept only for reports.
- **Account deletion** (`account-deletion.ts`) gains `purgePawlegendsSocial(accountId)`:
  - deletes every message `from` the account and every DM thread it is in, along with all messages in those threads
  - pulls the account from party thread `members`
  - removes the `pawlegendssocial` row (with `chatCooldownUntil` and `avatar`), friendships, blocks, presence and invites (§10 #7)
- Report snapshots (§3.4) are kept for 180 days as today, keyed by account ids.

---

## 3. Data (Mongo)

### 3.1 `pawlegendschatthreads`

```ts
{
  _id: string;                  // opaque: 'd<hash of the pair>' | 'p<hash of party code and start>' (never an account id)
  kind: 'dm' | 'party';
  members: string[];            // account ids (party: registered members only, guests never stored)
  tier: 'text' | 'quick';       // last computed; the send path recomputes, this is display only
  lastAt: Date; lastFrom: string; lastPreview: string; // preview: 40 chars, or '[q:<id>]' / '[s:<id>]'
  read: Record<string, Date>;   // per-member read cursor
  muted: string[];              // members who muted it
  closedAt: Date | null;        // DM: unfriend or block time (24 h read-only, then hidden)
  createdBy: string; createdAt: Date;
  exp: Date;                    // lastAt + 30 d, TTL
}
// indexes: {members:1, lastAt:-1}, {createdBy:1, createdAt:-1}, {exp:1} TTL
```

### 3.2 `pawlegendschat` (messages)

```ts
{
  _id: string;                  // a 24-hex ObjectId string minted by the writer, so a report can name a party message before the flush
  thread: string; from: string;
  k: 't' | 'q' | 's';           // text | phrase id | sticker id
  text?: string;                // normalised, k='t' only
  id?: number;                  // k='q'|'s'
  at: Date; exp: Date;          // TTL 30 d
}
// indexes: {thread:1, at:-1}, {from:1, at:-1}, {exp:1} TTL
```

No IP, email, device or location is stored. Names are derived at read time (`display-name.ts`), as today. Clients never see `from`: a message view says `mine: true|false` (DM) or carries the party member id (relay).

### 3.3 `pawlegendssocial` additions

```ts
avatar: { kind: 'hero'; hero: HeroId } | { kind: 'cat'; catId: string } | { kind: 'icon'; icon: string }  // default: a stable hero per account
frame:  string | null;      // an owned frame id
title:  string | null;      // an owned title id
chatCooldownUntil?: Date;
chatStrikes?: { day: string; n: number };
dmPolicy: 'friends' | 'off';  // 'off' = nobody can DM me (party chat still on); default 'friends'
```

### 3.4 Reports (`report.contracts.ts`)

- `REPORT_REASONS += 'chat'`, plus `CHAT_REPORT_KINDS = ['harass','sexual','contact','spam','other']`.
- A chat report stores `room: 'chat:<messageId>'`, `queue: 'chat'`, `chatKind`, and `snapshot: {thread, kind, from, k, text?, id?, at, context: up to 6 prior messages of that thread (from, k, text?, id?, at)}`. The text is copied, so the 30-day TTL cannot delete the evidence.
- Caps: the existing `perDay` applies. One report per message per reporter (the existing unique index), and at most 5 per reported sender per reporter per day.
- `SANCTION_KINDS += 'chat_mute'` (default 7 days, CMS picks 1/7/30/permanent). While it is active:
  - text and quick sends answer `chat_muted` (DM + party)
  - in-match quick chat is dropped by the relay
  - the sender sees "Chat is paused until <date>"
- Every copy of `REPORT_REASONS` and `SANCTION_KINDS` is updated: backend, `pawlegends/src/social/report.ts`, the CMS api, and the deep-compare tests.

---

## 4. API routes (`/pawlegends/social/chat`, `AppAuthGuard`)

| Method | Route | Does |
|---|---|---|
| GET | `chat` | DM threads for me, newest first, max 50: `{id, kind, with:{code,name,av}, tier, lastAt, lastPreview, lastMine, unread, muted, readOnly}`, hiding blocked pairs |
| GET | `chat/:thread?before=<id>&limit=30` | History (max 30 per page). 403 if not a member or blocked |
| GET | `chat/:thread/since/:id` | New messages after an id (the open-thread poll). 204 when nothing is new |
| POST | `chat/dm/:code` | Opens or creates the DM thread with a friend by player code; returns the thread id |
| POST | `chat/:thread` | `{k:'t',text}\|{k:'q',id}\|{k:'s',id}`. Checks in order: member, friend, not blocked, `dmPolicy`, sanction, cooldown, tier (text in a quick thread → `chat_quick_only`), phrase scope, limits, filter. Writes the message, bumps thread `lastAt` and the recipient's `rev`, and publishes on `ChatBus` |
| POST | `chat/:thread/read` | `{upTo: id}` moves the read cursor |
| POST | `chat/:thread/mute` | `{muted: boolean}` |
| POST | `chat/report` | `{msg, kind, note?}` → a report (§3.4) |
| POST | `social/me` | Gains `avatar`, `frame`, `title`, `dmPolicy`, all checked (§7.2) |

- **Pulse:** `GET social/pulse` adds `chat: {unread: n, top?: {thread, fromName, preview}}`. Any DM bumps the recipient's `rev`, so the next 30 s pulse returns 200.
- **Error codes** (`PAWLEGENDS_CHAT_*`, mapped in the game copy): `UNAVAILABLE`, `QUICK_ONLY`, `REJECTED {why:'words'|'contact'|'link'|'charset'}`, `RATE`, `COOLDOWN {until}`, `MUTED {until}`, `TOO_LONG`.
- **Host bridge ops** (allowlist in `apiBridge.ts`, the fixture, and the app shell bridge when it exists): `chat.list`, `chat.history`, `chat.since`, `chat.open`, `chat.send`, `chat.read`, `chat.mute`, `chat.report`, `social.avatar`. The host validates the arg shapes, and `text` is a string of at most 240 code units. Guests get `need_account` with no network call.

---

## 5. Relay and protocol (PROTO 4 → 5)

PROTO 5 is still unbuilt, so this design **takes PROTO 5** for chat. The relay accepts 1..5. `social.add` (SOCIAL-RANKED §12) and ranked `mm.join` land in a later PROTO.

**Client → relay**
- `chat.say {k:'t', text} | {k:'q', id} | {k:'s', id}`.
- Phases: `lobby`, `pick`, `results`. In `loading` and `match` it is refused with `chat_phase`; the existing `social` frame stays the in-match path.
- At most 512 bytes, typed guard, own bucket of 5 in 10 s per socket.

**Relay checks**
- The sender is a party member.
- No `chat_mute` sanction.
- The party tier (§2.2) is recomputed on every member change.
- Phrase scope: `party` for a friend party, `team` for `mm.strangers`.
- `text` passes `chat-filter.ts`.
- Matchmade parties route only to the sender's `team`.

**Relay → client**
- `chat.msg {mid, from, k, text?, id?, at}`. `from` is the member id, not the account id.
- `chat.reject {why}`.
- `chat.notice {thread}`: a DM arrived for an account with a socket on this relay. It carries no body; the client fetches over REST. It is held in `loading` and `match` and flushed on `results`.

**`PartyView` additions**
- `chat: {tier:'text'|'quick', thread: string}`, where `thread` is the id used for reports.
- `blocks?: string[]`: member ids the recipient blocks, only in the recipient's own copy, so the client hides them.

**`MemberView` additions**
- `av?: AvatarView` (§7.3). Present for every member, bots included (bots get a hero icon with no frame).

**`ChatSink`** (`party/chat-sink.ts`)
- Shaped like `PresenceSink`. It buffers party messages and writes them every 2 s or every 50 messages, and upserts the party thread.
- It never awaits on the socket path. Guests' messages are delivered live but not stored; they are quick ids only.
- The relay mints `mid` as an ObjectId string, so "Report" works before the flush. The report route looks in the sink buffer through an in-process getter if the row is not in Mongo yet.

**`ChatBus`** (`social/chat-bus.ts`)
- An in-process EventEmitter. The API publishes `{to: accountId, thread}` and the relay subscribes, mapping accountId to sockets.
- With multiple relay instances, delivery to another instance falls back to the poll. A cross-instance bus rides the party directory **[infra]**.

---

## 6. Client screens (phone first, no-scroll, LANDING-PICK-UX rules)

These rules apply everywhere:
- No screen scrolls except a single list region with a visible scrollbar. The friends list and the message list count as that one region, like the champion grid in LANDING-PICK-UX §B4.
- Targets are 44 px.
- Safe-area padding is `max(16px, env(safe-area-inset-*))`.
- Everything is DOM in the menu layers at the 30 fps menu pacer, with nothing per frame in a match.
- The budget is 667×375 and 844×390 (notched) landscape, plus desktop.

### 6.1 Friends panel (`src/social/socialSheet.ts`, upgraded)

- **Header:** "Social", with a segmented switch `Friends · Ranked · Boards` and a close button (44 px).
- **Friends view sub-tabs:** `Friends (n online)` · `Recent` · `Requests (badge)`. Requests is hidden when empty and has no pending outgoing ones.
- **Row (56 px phone, 64 px desktop):**
  - avatar (40 px icon + border, §7)
  - name, plus a 10 px sub-line with presence ("Online", "In party", "In queue", "In match", "Offline")
  - right side: **Invite** (44 px, disabled when they are in a match or you have no party) and **Chat** (bubble icon with an unread dot)
- **Order:** online (party, then queue, then online), then in match, then offline, with "joinable party" first.
- **Recent:** the last 20 rooms' teammates and opponents with avatars, each with Add (existing). Under-16 accounts keep the existing rule (no add from Recent).
- **Footer (fixed):** your code `PL-XXXX-XXXX` with Copy and Add by code.
- **Landing entry:** the existing friends button gains a red dot with the count of unread DMs plus requests. There are no new landing items.

### 6.2 Chat thread (`src/social/chatSheet.ts`, new)

- It opens as a right-side sheet over the Social sheet: phone 100% width, desktop 420 px.
- **Header:** back, the friend's avatar, name, then ⋯ (Mute, Block, Report).
- **Messages:** the only scroll region, with a visible scrollbar, newest at the bottom, and "Load earlier" at the top (30 a page). Own bubbles sit on the right. Phrases render as bubbles with a 🐾 corner mark, and stickers render 40 px. ⋯ on a received bubble gives Report.
- **Composer (fixed, 52 px):**
  - **`text` tier:** a single-line input with `maxlength=120` and a counter after 100, a phrase button (💬) and Send. `enterkeyhint="send"`. On iOS, when the keyboard opens, the sheet resizes to `visualViewport.height` so the composer stays above the keyboard.
  - **`quick` tier:** no input. The phrase tray (chips of 44 px plus a stickers row) replaces the composer, with a line underneath: "Quick chat keeps everyone safe 🐾". Nobody is told the other player's band.
- **Poll:** `chat.since` every 4 s while the sheet is visible. It stops when the sheet closes, when a match starts or when the tab is hidden. Opening the thread marks it read.
- **Errors:** inline under the composer for 3 s ("That message can't be sent: no contact details or links", "Slow down a little", "Chat is paused until …"). Nothing is shown to the other side.

### 6.3 Party lobby, pick and results chat (`party/ui/partyChat.ts`, new)

- **Lobby:** a collapsible chat strip under the member slots.
  - Collapsed (phone default) it is one line, 36 px: the last message ("Mira: Ready!") with an unread count.
  - Tapping it expands to an overlay drawer (max 50% of the height) with the last 30 messages and the composer or phrase tray.
- **Pick (`partyPick.ts`):** only the phrase tray (party/team scope: Ready, I'll tank, Nice pick…). Free text in pick is 16+ text-tier parties only. The pick screen is not resized: the strip overlays the bottom of the screen.
- **Results:** the same strip as the lobby, plus the DM notices held during the match.
- In matchmade parties the strip header says "Team" and offers only the phrase tray.

### 6.4 In match

- No change to the quick-chat wheel (hold T or the touch button).
- Add a per-player 🔇 on the scoreboard rows next to the existing report flag (client-side for that match).
- Incoming DMs make no sound and show no toast. The unread count shows on results.

---

## 7. Avatars

### 7.1 Parts

- **Icon**, one of:
  - **Hero portrait:** every hero, default look. This is the default for all players: a stable hero picked per account.
  - **Cat:** one of your own Token Tails cats, NFT bucket art only. The resolver is the same as `party-cards.ts`.
  - **Earned icon:** `icon.*` ids granted into `pawlegendsowned`. There are no new grants in this build; the picker lists only owned ones.
- **Border:** an owned frame (`frame.store.*`, `frame.s1.*`, `frame.legend`, `frame.founder`) or the default plain frame. Client-only track and roster frames are **not** selectable for public display until the server records them. Ranked tier frames are derived later (§11).
- **Title:** an owned title, shown under the name on the profile, loading and VS cards.
- **No photo uploads, ever.** No free-text titles.

### 7.2 Storage and the write check (`POST social/me`)

The server enforces each choice on write:
- `avatar.kind:'hero'`: the hero id is in the live sim's `HERO_IDS`.
- `avatar.kind:'cat'`: the cat's `owner` is the caller, it is not deleted, and its art resolves through the party-card rule (NFT bucket host only).
- `avatar.kind:'icon'`: the icon is in `pawlegendsowned`.
- `frame`: owned.
- `title`: owned.

A worn item that is later lost (a cat transferred, a refund) falls back to the default at read time, with no write.

### 7.3 Wire shape (`AvatarView`, shared)

```ts
interface AvatarView {
  i: string;      // icon key: 'h:<heroId>' | 'c:<catId>' | 'i:<iconId>'
  img?: string;   // cat art URL (NFT bucket host only; the client rejects any other host)
  f?: string;     // frame id
  t?: string;     // title id
  r?: string;     // ranked tier glyph id for the emblem chip
}
```

The server resolves it once and includes it in these responses:
- social rows (friends, requests, recent, the mini profile)
- `boards` rows
- chat thread `with`
- `MemberView.av` in `PartyView`, resolved at `party.join` with one `pawlegendssocial` read, cached for the socket

The relay carries each member's `av` in the party view, so `partyLoading`, `vs.ts`, the scoreboard and results render from data they already have, **with no extra fetches**.

### 7.4 Rendering (`src/ui/avatar.ts`, new)

- **Hero icons:** the existing runtime portrait renderer where a renderer exists (match screens); menus draw a CSS medallion with the hero's colour and initial, so no WebGL renderer and no `portraits.ts` LRU slot is used for lists. A baked `assets/avatars/hero/<heroId>.webp` set is a follow-up (§11).
- **Cat icons:** the card art URL, center-cropped in CSS, with a lazy `<img loading="lazy" decoding="async">`, bucket host only.
- **Borders:** CSS only, a ring coloured per frame id. No new image per frame.
- **Component:** `avatarEl(av, size)` returns a DOM node. Missing or invalid data shows the default hero, a guest shows a paw silhouette, and a bot shows its hero.
- **Where it shows:** friends, recent and requests rows; chat header and thread list; party lobby slots; party loading; results; boards.
- **Picker:** in the Social sheet's "Me" panel, an "Avatar" grid of champions and your cats, a "Border" row of owned frames and a live preview. Save posts `social/me`. Guests see the default and a "Sign in to choose" line.

---

## 8. Tests

**Backend (`npm test`)**
- `chat-filter.spec.ts`: the corpus (≥150 pass and ≥150 reject), NFKC, invisible characters, the Latin charset, tiers and avatar shapes.
- `chat.service.spec.ts`: friends-only, blocks both ways, `dmPolicy:'off'`, the tier matrix, phrase scope, the length cap, rate limits and duplicates, cooldown after 5 strikes, `chat_mute`, read cursors and unread counts, the 24 h read-only window, the pulse `rev` bump, reports with snapshots, TTL indexes, guards.
- Avatar write check, account deletion purge, relay `chat.say` per phase, tier drops on join, team routing, PROTO 4 sockets never receive `chat.*`.

**Game (`npx vitest run`, `npx tsc --noEmit`)**
- Deep-compare tests for `CHAT_PHRASES`, `CHAT_STICKERS`, `CHAT_LIMITS`, `REPORT_REASONS`, `SANCTION_KINDS`.
- `chatSheet` renders the tier (input vs tray), the poll stops on close, and errors show inline.
- `avatarEl` covers every kind plus the fallbacks, and rejects a non-bucket `img`.

**e2e (Playwright)**
- Two friends: one DMs a phrase and text; the other sees the badge on the pulse, then the message with the thread open.
- An under-16 account sees only the tray.
- Loading shows all players' avatars with no extra social request.

---

## 9. Build order (lanes)

| Lane | Work |
|---|---|
| C1 Contracts + filter | `shared/chat.ts`, `shared/chat-filter.ts` + corpus, `AvatarView`, game copies + tests |
| C2 Chat API | Schemas, service, controller, pulse `chat`, `ChatBus`, reports `chat` + `chat_mute`, CMS message view and sanction option, account deletion |
| C3 Avatars backend | `social/me` fields and the checks, row `av`, board rows, the `MemberView.av` resolver in the relay |
| C4 Relay PROTO 5 | `chat.say`/`chat.msg`/`chat.reject`/`chat.notice`, the tier, `ChatSink`, band resolver |
| C5 Game UI | Friends panel upgrade, `chatSheet`, `partyChat`, phrase tray, scoreboard mute, `avatar.ts`, picker, bridge ops (web host + fixture) |
| C6 App shell bridge | The `api-request` bridge in `pawlegends-app` (SOCIAL-RANKED §19 L8 gap), same allowlist |

---

## 10. Your call (defaults apply if no answer)

1. **Free text for 16-17 ↔ 18+ DMs.** Default: **allowed** between accepted friends, with the age and meeting probe filter on (§2.4 step 8). Alternative: quick only across the 18 line.
2. **Free text in friend-party lobbies when members aren't friends with each other** (a friend of a friend joined by code). Default: allowed if every member is 16+. Alternative: require every pair to be friends.
3. **Message length.** Default 120 characters.
4. **Retention.** Default 30 days for messages. Report snapshots keep 180 days, as today.
5. **`dmPolicy` default.** Default `friends`. Under-16 also defaults to `friends` (quick only).
6. **Close Friends / Affinity** (Wild Rift intimacy, Mobile Legends familiarity). Default: **not in this build**.
7. **Purge of the other social rows on account deletion** (friends, blocks, presence, invites, social profile). Default: fix it in this branch as its own commit.
8. **Scoreboard avatars on phones.** Default: hidden at height ≤ 480.

---

## 11. Known issues to mention, not fix silently

- Multi-relay: `chat.notice`, invites and party chat across instances need the party directory **[infra]**. Until then, the 4 s poll and the 30 s pulse cover DMs.
- The app shell has no host bridge (SOCIAL-RANKED §19 L8), so social and chat answer status 0 there until lane C6.
- Client-only frames (track, champion, roster) can't be shown to others until the server records them.
- Ranked season rewards (icons and frames) are recorded with `rewarded: false` and not granted yet; ranked tier frames are not selectable yet.
- Baked hero avatar images (`npm run avatars`) are a follow-up; menus use CSS medallions.
- The blocked joiner's `party_full` at `party.join` (SOCIAL-RANKED §19 L3) is still unbuilt. A blocked player can still land in your party by code. Their messages are hidden for you through `PartyView.blocks`.

---

## Sources

Riot support pages for Close Friends and in-game chat settings, Wild Rift patch notes 2.2, 2.5, 2.6 and 5.3, the all-chat removal, the quick-chat devtracker, Mobile Legends affinity, Recent tab, mute/block, borders and avatars guides, the Roblox Nov 2025 age-checked chat newsroom post, and Epic Cabined Accounts. The Riot, Roblox and Epic pages are first-party. Most Mobile Legends details are third-party guides, some dated.
