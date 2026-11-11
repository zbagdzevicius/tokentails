# In-match chat and bot chatter (design)

The founder asked for this, verbatim: "implement in-game chat and add a functionality that bots can write there randomly as well. just a thing is it should be so good that it would be too hard to understand that there are bots writing ( not too frequently, just sometimes ) ultracode".

This builds on `docs/plans/moba/CHAT-AVATARS.md` (now on `main`). This design reuses its pieces and never duplicates them:
- the chat filter (`shared/chat-filter.ts`)
- the tiers (§2.2) and `ChatBandResolver`
- `CHAT_LIMITS` and the strikes and cooldown
- `CHAT_PHRASES`
- block, mute and report, and the `chat_mute` sanction
- `ChatSink` and the PROTO 5 `chat.*` frames

It changes two earlier rules for 16+ teams only:
- CHAT-AVATARS §2.1 and §6.4 ("In match: quick-chat wheel only. No free text in a match")
- MULTIPLAYER D8 ("no player text ever reaches a peer"), in `data/social.ts` and `net/proto.ts`

Both doc comments must be updated in the same commit.

---

## 0. Summary

- **In-match chat**:
  - **Team chat:** free text when every human on the team is 16+ and registered (the "text" tier). Otherwise phrases only.
  - **All chat:** phrases only (gl hf, gg, wp…), for everyone.
  - The quick-chat wheel stays next to the ping button. It gains a "Type" centre for text-tier players and an All toggle.
  - **Phones:** a collapsed chat ticker under the kill feed. Tap it to expand a drawer.
  - **Desktop:** Enter opens team chat, Shift+Enter opens all chat.
  - Each line fades out a few seconds after it arrives.
- **Bot chatter**: fill bots sometimes write ordinary match talk, timed and phrased like people.
  - A typical 7-minute match has 0–3 bot lines, and about half have none.
  - Each bot has a personality, typing speed, typo habits, lowercase and abbreviation habits.
  - A bot reacts only to real events and to what it is actually doing.
  - Bot lines never repeat for a player across matches.
  - A bot never holds a conversation.
- **Where it is decided**: outside the deterministic sim.
  - Relay matches: the relay decides, using read-only cues from the referee.
  - Solo matches: the client host decides.
  - Sim hashes never change. A test asserts it.
- **Guardrails** (§6):
  - Ordinary match talk only. Nothing personal, nothing about spending, no friend requests or DMs, nothing outside the match.
  - When asked whether it is a bot, it goes silent.
  - Players under 16 or of unknown age see phrases only.
  - Never in ranked or competitive queues.
  - The same filter and rate limits as humans.
  - Never spoken through a human's seat (pilots).
- **No feature flags.**

---

## 1. What exists (origin/main 612ea434, plus the chat branch)

| Area | State | Where |
|---|---|---|
| In-match quick chat | 8 lines (`CHAT_LINES`) and 4 emotes, pinned by `SOCIAL_COUNT {ping:8, chat:8, emote:4}`. Wheel: hold T, or the bubble button under the paw. Relay `social()`: team-only in casual, emotes to everyone, `SocialLimiter` (1 per 2 s, 10 per 30 s) | `data/social.ts`, `party/ui/quickChat.ts`, `party-relay.ts:1334` |
| Social display | A line pops over the hero, and the rail shows "Mira: On my way" for 2.2 s | `app/mpHud.ts drawSocial/note` |
| Bot barks | Ally bots' ping answers ("on it" / "Healing first!") and kill or assist cheers over the bot. At most one every 8 s (`WINDOW.bark`) | `render/announcer.ts`, `matchSession.ts:1817` |
| Bot names | Persona names from the seed ("Biscuit the Clem"). The wire has `MatchMsg.names` with `null` for a bot. Loading shows bot seats as "?". The scoreboard shows a "bot" chip on a piloted friend seat | `ui/heroText.ts slotNames`, `proto.ts`, `partyLoading.ts`, `scoreboard.ts` |
| Fill bots | Casual and classic matchmaking fill empty seats after `fillMs`. Co-op enemies are all bots. A pilot flies a dropped human's seat | `mm/casual.ts`, `referee-core.ts` |
| Referee | Steps every room in workers and posts `hash`, `pilot`, `progress`, `end`. No event output | `referee-core.ts`, `referee-host.ts` |
| Sim events | `death, firstBlood, tower, objective(Spawn), pudding, shutdown, bounty, comeback, sunset, suddenDeath, ping, bark, clip, buy…`. Cannon events exist only on `feat/pawlegends-v21-fun` (sim v21, Kibble Cannon) | `sim/api.ts SimEvent` |
| Sim facade | The vendored bundle plus facade, with `simSourceHash` and `simGolden` pinned in `pawlegends-sim.sha256.json` | `backend/src/vendor/pawlegends-sim/v19` |
| HUD budget | `tests/e2e/hud-area.spec.ts`: painted persistent HUD ≤ 19.5% at 667×375 and ≤ 16% at 844×390. Transient elements (`.pl-feed`, `.pl-rail`, …) are skipped | e2e |
| Touch layout | The minimap is top right (`--mm-w`/`--mm-h`). The kill feed is under it: 2 rows, 170 px wide, top 100 px at 667×375. The paw ping button and emote chip are left of the minimap. The ability cluster is bottom right | `ui/ui.css:483-495, 1146-1151` |
| Desktop layout | The minimap is bottom right and the kill feed top right | `ui/ui.css:286, 310` |

---

## 2. Channels and tiers in a match

| Channel | Who receives | Tier | Content |
|---|---|---|---|
| Team | Own team (humans and bots' hidden recipients) | `text` if the sender **and every human on the team** is registered and 16+ (`ChatBandResolver`). Otherwise `quick` | Text (1–120 characters after the filter), or a phrase id with the `match` scope |
| All | Both teams | Always `quick` | Phrase ids with the `all` scope only |

- **The tier is computed per message.** It is recomputed on seat changes: a claim, a drop, or a pilot taking a seat. The strictest human decides. A pilot counts as the human whose seat it flies.
- **Mixed teams.** Free text never reaches a quick-tier recipient. When a team is `quick`, the composer is replaced by the phrase tray for everyone on that team. Nobody is told why ("Quick chat keeps everyone safe"), the same as CHAT-AVATARS §6.2.
- **Guests** are `quick`.
- **Blocks:** the relay already sends `PartyView.blocks`, and the client hides blocked senders.
- **Mute:** client-side per slot. It hides chat, quick lines and emotes, the same as the scoreboard 🔇 and the existing "mute all opponents".
- **Sanctions:** a `chat_mute` sanction drops text and quick sends, as CHAT-AVATARS §3.4 already says.

### 2.1 New phrases (`CHAT_PHRASES` ids 24–39, scope tags `match` / `all`)

These are added to the shared constant and its game copy. The deep-compare test is already in place.

| id | Phrase | Scopes |
|---|---|---|
| 24 | gl hf | match, all |
| 25 | gg | match, all |
| 26 | gg wp | match, all |
| 27 | wp | match, all |
| 28 | Nice! | match, all |
| 29 | Thanks! | match |
| 30 | Sorry! | match, all |
| 31 | On my way | match |
| 32 | Back | match |
| 33 | Careful! | match |
| 34 | Group up | match |
| 35 | Close one! | match, all |
| 36 | Cannon! (shown only on maps with a cannon) | match |
| 37 | 😹 | match, all |
| 38 | 😼 / 🐶 (by own side) | match, all |
| 39 | Well played! | match, all |

The legacy wheel ids (`social` kind `chat` 0–7) stay exactly as they are for PROTO 4 and 5 sockets.

---

## 3. Protocol and relay (PROTO 6; the chat branch takes 5)

**Client → relay**
- `chat.say {k:'t', text, ch:'team'} | {k:'q', id, ch:'team'|'all'}`.
- PROTO 6 allows it in phase `match`. It is still refused in `loading`.

**Relay checks, in order**
1. The sender holds a live seat (not piloted away).
2. No `chat_mute` sanction and no `chatCooldownUntil`.
3. `CHAT_LIMITS`: the existing per-socket chat bucket (5 per 10 s) and the per-sender minute and day limits. This is a separate bucket from pings.
4. The channel tier (§2): text in a quick channel → `chat.reject {why:'quick_only'}`.
5. Phrase scope `match` / `all`.
6. `chat-filter.ts` (reject, never mask, with a strike as in CHAT-AVATARS §2.6).
7. Duplicate rule.

**Relay → client**
- `chat.msg {mid, ch, slot, k, text?, id?, at}`.
- **In match the frame carries `slot` only, never a member id**, for humans and bots alike. Nothing on the wire tells a bot line from a human one.
- Team frames go to the sender's team only. All frames go to every seated socket.

**Old sockets**
- A PROTO 4 or 5 socket receives a phrase that has a legacy equivalent (gg→7, Thanks→6, On my way→1, Nice!→0, Group up→3) as the old `{t:'social', kind:'chat'}`.
- Text and phrases without an equivalent are not delivered to old sockets.

**Storage**
- `ChatSink` stores in-match text and phrase messages in a new thread kind `match`: `_id 'm<hash(room)>'`, members = the registered humans, 30-day TTL. This lets Report work during and after the match.
- Bot lines are stored with `from: 'bot:<slot>'`. The CMS shows "bot line" to moderators only.

**Report**
- A long-press on a line gives Report, which uses the chat report route (`reason:'chat'`).
- A report on a bot line is accepted the same way, so the client cannot probe whether a line came from a bot. It is counted as a metric.

**Bot lines** use the same send path (`deliverMatchChat(room, slot, ch, payload)`) after the same filter and the same per-seat limiter (§5.7).

---

## 4. Client UI

### 4.1 Phone (touch), 667×375 and 844×390 notched, landscape

**Chat ticker (`.pl-chatline`)**
- A transient column directly under the kill feed's maximum box, right-aligned. Its width matches the feed (170 px, 128 px when the emote chip is present).
- It shows the newest lines: 2 on screens 400 px tall or more, 1 below that.
- Each row has the sender's coloured name (team colour, or enemy colour for all chat), then the text. It is one line with an ellipsis.
- All-chat rows have a small `[All]` prefix.
- When there are no lines, **nothing is painted**, so the persistent HUD budget does not move.
- The ticker joins the `hud-area.spec.ts` skip list (transient, like `.pl-feed`).
- A new e2e (§8) asserts it never intersects the minimap, the feed, the ability cluster, the enemy portraits, the paw button or the emote chip, at the S, M and L minimap sizes.
- **Tap it** to open the drawer. The rows are the tap target, extended to 44 px tall by padding.

**Lifetime**
- Text lines show for 8 s, phrases for 5 s, then fade over 600 ms.
- Your own sent line shows for 4 s.
- At most one new row every 400 ms, queued, so a burst never flickers.

**Drawer (`.pl-chatdrawer`)**
- Opened by a tap on the ticker, or by "Type" in the wheel.
- A right-side overlay: width `min(360px, 46vw)`, height up to 58% of the visual viewport, anchored under the minimap.
- It never covers the ability cluster or the joystick half. While the keyboard is open it resizes to `visualViewport.height`.
- **Header:** a `Team | All` segmented toggle (44 px), then ✕.
- **List:** the last 50 lines of this match. It is the only scroll region, with a visible scrollbar. A long-press on a line gives Mute player, or Report.
- **Footer:**
  - `text` tier and the Team channel: one input (`maxlength=120`, `enterkeyhint="send"`), a phrase chip row (scrollable chips of 44 px), and Send.
  - `quick` tier or the All channel: phrase chips only.
- **Closing:**
  - After a send, the drawer collapses back to the ticker (Wild Rift style). The game keeps running and never pauses.
  - A tap outside also closes it.
  - It closes on its own on death-screen transitions, and at match end.

**Wheel (`QuickChat`)**
- The outer 8 lines and the inner 4 emotes stay as they are.
- The dead centre becomes a "Type" button (text tier) or a "More" button (quick tier), which opens the drawer.
- A small `All` chip at the wheel's top switches the next pick to all chat. Only phrases with the `all` scope are enabled while it is on.

**Display moves**
- A teammate's text or phrase now goes to the ticker instead of the rail note (`mpHud.note` stops pushing `mp-social-*` for chat).
- Phrases still pop over the sender's hero when on screen, as today.
- Text never pops over the hero.

### 4.2 Desktop

**Chat log**
- Bottom-left, 340 px wide, the 6 newest lines, the same fade rules.
- It sits above the left edge of the bottom HUD bar. The e2e measures it clear of the hero box, the talents and the ability bar.
- Its background appears only while it is focused or hovered.

**Keys**
- **Enter** opens the composer on Team (or All when the team is quick). **Shift+Enter** opens All.
- Enter sends, Esc cancels. Up recalls your last message.
- While the input has focus, `matchSession`'s key handler ignores every game key (`isTyping()` guard), so QWER, B and T never cast or open the wheel.

### 4.3 Accessibility and copy

- Lines are `aria-live="polite"` in the drawer only. The ticker is `aria-hidden`.
- Errors show inline for 3 s, using the CHAT-AVATARS §6.2 wording.
- Results: the in-match log is not carried into results. Party and results chat stays the chat branch's strip.

---

## 5. Bot chatter engine

### 5.1 Placement (determinism)

**Pure engine** (`pawlegends/src/chat/`)
- Files: `botChatter.ts`, `botLines.ts`, `personas.ts`, `typos.ts`, `cues.ts`.
- No DOM, no clock, no `Math.random`. It uses its own PRNG (`mulberry32`), seeded with `hash(room id ⊕ server salt)` on the relay, or `hash(seed ⊕ local nonce)` solo.
- API: `observe(cue | humanMsg, nowMs)` and `due(nowMs) → Planned[]`.
- It is vendored into the backend like `vendor/pawlegends-net`, with the same script and a sha check.

**Relay matches**
- The referee gets a **read-only** `chatCues?(m)` on the vendor facade, outside the hashed sim source. `simSourceHash` and `simGolden` must not move.
- After each `step`, the referee reads the last tick's events into compact cues.
- Once a second it also samples per-bot state: `alive, hpPct, intent: 'lane'|'base'|'objective'|'cannon'|'help'|'retreat'|'fight', nearEnemies, nearAllies`. Intent is read from the bot brain's current order.
- It posts `{t:'cues', room, cues}` once per TURN.
- It does this only for rooms that are not ranked and have at least one **fill bot** seat.
- On bundles without `chatCues`, the relay still has start, end and human-message cues.

**Relay `BotChat` (per room)**
- Holds the engine and schedules timers.
- At fire time it **re-checks the guard** (§5.5), then calls `deliverMatchChat`.
- It is not checkpointed. A room restored after a live deploy restarts with budget 0, so its bots stay quiet.

**Solo (LocalHost)**
- The client runs the same engine, fed from the snapshot events the announcer already reads.
- Delivery is local to the ticker.
- Bark and chatter share a per-bot 10 s gap, so a bot never barks and types at once.

**Tests**
- With cues read on every tick, the hash trail equals a run without them, on every vendored fixture.

### 5.2 Who may speak

- **Only fill bots** (`!config.humans.includes(slot)`).
- **Never a pilot.** A seat a pilot flies for a dropped or late human never chats, because that would speak in a human's name.
- **Never** in `mode:'ranked'`, or any queue marked competitive.
- **Not** in an account's first match (Rookie).
- Enemy bots use all chat only, so they say phrases only.

### 5.3 Budget: frequency control

Each team gets a hard budget at match start:

| Budget | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Probability | 0.40 | 0.30 | 0.20 | 0.10 |

On Hearthwood 5v5 the probabilities are the same, plus a 4th slot with probability 0.05.

The budget is a ceiling, not a target. Lines also need a trigger to pass its roll, so the realized numbers are about:
- 0.9 lines per team per match
- P(0) ≈ 0.50
- P(>3) = 0

Spacing:
- At least 40 s between bot lines in a room.
- At least 100 s between lines from the same bot.
- No bot line within 6 s after any human message, except one reaction (§5.6).

Typo corrections ("*clean") do not count against the budget. They are rare and limited to chatty personas.

### 5.4 Personalities (drawn per bot per match from the PRNG)

| Persona | Weight | Habits |
|---|---|---|
| Silent | 0.45 | Never chats. At most "gg" at the end (p 0.25, needs budget) |
| Terse | 0.25 | 1–3 words, all lowercase, no punctuation. Abbreviations (gj, ty, np, wp, b, omw, mb). Typo rate 3% |
| Chatty | 0.10 | 2–7 words. Lowercase 70%. Sometimes splits a line into two sends 1–2 s apart ("nice" … "that was clean"). Typo rate 6%, of which 25% are followed by a "*word" fix |
| Emoji-ish | 0.08 | 30% of lines are a lone emoji or end with one (😹 😼 🐾 💀 😅 👏). Typo rate 2% |
| Proper | 0.12 | Sentence case and punctuation ("Good luck!", "Nice one."). Typo rate 1%, no abbreviations |

Each persona also gets:
- **Device:** `phone` (70%; 3.0–4.5 characters/s, more typos, shorter lines) or `desktop` (5–7 characters/s).
- **Elongation habit:** 0–10% ("niceee", "lets gooo").
- **Punctuation habit:** none, `!`, or `…`.
- **Flavour rate:** 0–8% for cats-vs-dogs lines, by side.

### 5.5 Triggers (cue → candidate categories, base probability, extra guard)

The probability is the chance the chosen bot uses a budget slot when the cue fires. Only one bot is chosen per cue: the nearest relevant bot, or a random eligible one.

| Cue | p | Categories | Guard checked again at send time |
|---|---|---|---|
| Match start (5–25 s in) | 0.30 team. All chat gl hf 0.10 | `start` | Bot alive |
| First blood, ours | 0.25 | `fb_ours` | — |
| First blood, theirs (victim not this bot) | 0.12 | `fb_theirs` | — |
| Own death by a hero | 0.12 (once a match) | `death` | Still dead or respawning (people type while dead) |
| Human teammate's multikill, shutdown or First Blood | 0.30 | `praise` | The human is on screen or within 30 m of the bot, or it happened in the last 6 s |
| Human teammate's single kill | 0.06 | `praise` | Same |
| Bot kill with a human assist | 0.10 | `thanks` | — |
| Enemy tower destroyed by us | 0.10 | `tower_ours` | — |
| Our tower lost | 0.08 | `tower_lost` | Bot intent not `fight` |
| Objective (Pudding or Grizzlechop) ours | 0.15 | `obj_ours` | — |
| Objective spawn, when the bot's intent is `objective` | 0.10 | `obj_go` | Intent still `objective` |
| Cannon hit, ours (one-shot) (sim v21) | 0.35 | `kaboom` | — |
| Cannon hit on us | 0.15 | `cannon_hurt` | — |
| Cannon spawn warning, when the bot's intent is `cannon` | 0.10 | `cannon_go` | Intent still `cannon` |
| Close escape (hero damage took the bot below 12% HP and it was alive 4 s later) | 0.15 | `close` | Alive, HP < 50% |
| Low-HP retreat (intent `retreat`, HP < 30%) | 0.06 | `back` | Intent still `retreat` |
| Human pinged Help or Group and the bot took the order | 0.20 | `omw` | The bot is moving toward that point |
| Comeback (our underdog waves) | 0.08 | `comeback` | — |
| Sunset or sudden death | 0.10 | `last_push` | — |
| Win or lose | 0.45 for the first bot, 0.15 for a second | `gg_win` / `gg_lose`, all chat `gg` | Delivered while the end banner shows (≤ 12 s), else dropped |

Before sending, the engine checks whether the line is still true: the bot is still dead, still going back, or still heading there. If not, it drops the line, and the budget slot is not spent.

### 5.6 Human-like timing and conversation rules

**Timing**
- **Reaction delay:** lognormal, median 2.8 s, clamped to 1.5–6 s. It is 0.8–2 s for phrase-id sends, which act like the wheel.
- **Typing time:** `chars / cps × U(0.85, 1.25)`, plus 0.3–0.8 s think time for lines over 10 characters. Phone personas are slower.
- **Split sends** (chatty only): the second part comes 1.0–2.2 s after the first.
- **Typo fixes:** "*word" comes 1.5–3 s later.

**Where bots chat**
- A bot prefers to chat while dead, at base, or walking in lane with no enemy within 25 m.
- During a fight (`intent:'fight'` or enemies near), only lines under 6 characters are allowed ("b", "omw", "ty").
- The sim is never touched, so a bot does not stand still while "typing". Short lines in fights cover that.

**Reactions** (at most one per human message, and never a second reply to the same human in 60 s)
- A human team-chat message is a cue. A bot may react only to these safe intents:
  - thanks (ty/thx/Thanks!) → `np` / `yw` / 👍
  - praise (nice/gj/wp) → `ty` / `thx` / 😼
  - gg → `gg`
  - laughter (lol/😹/haha) → `lol` / 😹
- The probability is 0.25, and it needs budget.
- Anything else gets silence: questions, a line containing "?", requests, insults, names, numbers.
- A bot never answers a question and never continues a thread.

**Silence on probes**
- These patterns are checked on the human text after normalising and folding: `bot|robot|ai|npc|script|real (person|human|player)|are (you|u|ya) (real|human)|human\?|afk bot`, plus the Lithuanian `botas|ar tu žmogus`.
- One match ends **all bot chatter in the room for the rest of the match**: the budget becomes 0 and pending lines are cancelled.
- No reaction of any kind.

**Minors**
- If any human recipient of the channel is `quick`, a bot line is sent as its phrase id (§5.8 `q`).
- A line with no phrase equivalent is dropped.
- Bots react to a quick-tier human only with a phrase id, and only to a phrase id.

### 5.7 Same filter and limits as humans

- Every runtime line, after typos and casing, goes through `chat-filter.ts`. A rejected variant falls back to its clean base form. If that is also rejected, nothing is sent and an alert counter goes up (§9).
- Each bot seat has its own `CHAT_LIMITS` bucket and duplicate rule, exactly like a human socket.
- The per-sender day limits do not apply, because bots have no account. The budget already caps far below them.

### 5.8 Memory across matches (no repeats)

- **Line memory:** each line has a stable `lid`. Each recipient account keeps a ring of the last 80 `lid`s and the last 30 normalised surfaces, in `pawlegendssocial.botSeen`.
- **Updating it:** the relay writes the ring once per human at match end, using `$push` with `$slice`.
- **Guests:** in memory, keyed by guest key, for 24 h.
- **Solo:** `localStorage` key `pl.botSeen`, read and written in try/catch.
- **Picking a line:** the candidate pick excludes any `lid` or surface in the union of the recipients' rings. If every candidate is excluded, the cue is skipped.
- **Very common tokens:** gg, ty, gj, b, omw, nice and lol are exempt from the `lid` ring, because people say them every match. Their **surface** (casing, punctuation, elongation, emoji) must still differ from the recipient's last 3 surfaces of that token.
- **Inside one match:** no two bots say the same thing within 30 s. At match end at most 2 bots say gg, and never the same surface.

### 5.9 Phrase bank (`botLines.ts`, about 220 base lines)

Every line has a `lid`, a category, an optional side (`cat`/`dog`), a `maxChars` budget, and an optional `q` (phrase id fallback). Tokens:
- `{lane}`: the map's lane word; the line is skipped if there is none.
- `{who}`: the first word of a teammate's peer-visible name, lowercase, used by at most 5% of praise lines and never for guests.

The variant layer multiplies these through casing, punctuation, elongation, emoji and typos. The lines below are the base forms.

- **start (team):** gl hf · glhf · gl · gl all · hf · lets go · lets win this · ok lets do this · hi · hey · yo · o/ · hello · gl team · lets have fun · go go · ready · 🐾 · ok gl · gl gl · we got this · lets gooo · cats > dogs (cat) · meow 😼 (cat) · dogs > cats (dog) · woof (dog) · time to win · for the tree (cat) · good boys only (dog)
- **start (all):** gl hf [q24] · glhf [q24] · hf [q24] · gl [q24]
- **fb_ours:** nice [q28] · nice one · fb lets go · first blood! · gj · gj gj · lets gooo · clean · 😹 · good start · big · ok we're up · nice nice · love it · 👏
- **fb_theirs:** rip · unlucky · its ok · all good · np we got this · careful · they're aggressive · ok careful now · dw · happens · 😬
- **death:** rip · oops · my bad [q30] · mb · sry [q30] · sorry [q30] · ouch · ugh · didnt see that · where did that come from · that hurt · rip me · they were 2 · careful {lane} · 2 there · got caught · 💀 · welp · ok that was bad · misclick
- **praise:** nice [q28] · wp [q27] · gj · sick · clean · wow · big play · omg nice · insane · beast · carry us · 👏 · 😼 · nice {who} · ok thats nice · love that · so good · good stuff · that was cool · u good · teach me · nice shutdown · bounty gone lol
- **thanks:** ty [q29] · thx [q29] · ty for help · good help · thanks [q29] · ❤ · nice assist
- **tower_ours:** tower down · nice push · next one · keep going · push push · gj team · ez tower… (excluded by lint: "ez") → replaced by: one more · 🐾🐾
- **tower_lost:** tower lost · def · defend · careful · group [q34] · lets group · cant lose next one · ugh tower
- **obj_ours / obj_go:** pudding! · got pudding · pudding secured · nice pudding · pudding up · omw pudding · grizzlechop down · nice take
- **kaboom** (v21): KABOOM · kaboom lol · BOOM · boom 😹 · that cannon tho · one shot lol · cannon op · did you see that · ka-boom
- **cannon_hurt / cannon_go:** watch the cannon · careful cannon [q33] · that cannon again · cannon soon · cannon up · going cannon · get cannon [q36]
- **close:** close one [q35] · that was close · 1 hp lol · phew · almost died · 😅 · so close · lucky · barely
- **back:** b [q32] · back [q32] · going back · low · need heal · brb base
- **omw:** omw [q31] · otw · coming · on my way [q31] · 2 sec · coming!
- **comeback / last_push:** not over · we can still do this · ok last push · all in · lets end · now or never
- **gg_win:** gg [q25] · gg wp [q26] · ggwp [q26] · ggs · gg! · wp all [q27] · nice game · gg team · that was fun · gg 😼 (cat) · gg 🐶 (dog) · good game [q39] · close one gg
- **gg_lose:** gg [q25] · ggs · gg wp [q26] · unlucky · gg next time · close game · wp [q27] · they were good · gg 😿
- **reaction:** np · yw · 👍 · ty · thx · 😼 · lol · 😹 · gg

**Bank lint** (unit test, which fails the build):
- Every base line and generated variant passes `chat-filter.ts`.
- A line is ≤ 40 characters.
- No line contains `?`, an `@`, or digits other than "1 hp" and "2 sec".
- No banned topic words: `buy, shop, store, skin, pass, pay, price, $, €, treat, gem, premium, purchase, card, wallet, crypto, nft, add, friend, dm, message me, discord, insta, snap, tiktok, age, old, where, live, school, real, human, bot, ez, noob, trash, report, uninstall`, plus their EN and LT leet folds.
- Cats-vs-dogs lines are ≤ 8% of the bank and always side-tagged.
- Every category has at least 6 lines, so the memory always finds candidates.

### 5.10 Typos (`typos.ts`)

- One typo at most per line, only on words of 4 letters or more, and never on emoji or `{who}`.
- Kinds:
  - QWERTY-adjacent substitution, 45%
  - dropped letter, 25%
  - doubled letter, 15%
  - transposition, 15%
- The typo'd line is filtered again. If rejected, it falls back to the clean line.
- The "*fix" follow-up uses the corrected word only.

---

## 6. Guardrails (main session decision, enforced in code and tests)

1. **Only ordinary match talk.** Category-restricted bank, the lint (§5.9), and no free generation of any kind. The engine can only pick bank lines.
2. **Never:**
   - personal questions, or any question
   - purchase, spending or store nudges
   - friend requests, DMs, invites, or anything outside the match: bots have no account, no `social.*` or `chat.*` DM path, and no results or party chat. A delivery outside phase `match` (plus the ≤ 12 s end window) is refused in `deliverMatchChat`.
3. **A "are you a bot?" probe** gets permanent room silence (§5.6). A bot never claims to be human; it has no such line.
4. **Minors:** under-16, unknown-age and guest recipients see phrase ids only, from everyone, bots included (§2, §5.6). Bots never react to a minor's message beyond a phrase reacting to a phrase.
5. **Never in ranked or competitive queues**, never through a pilot, and never in Rookie match 1.
6. **The same filter and rate limits as humans** (§5.7).
7. **Determinism:** the engine sits outside the sim, the cues are read-only, and the hash-trail test is in place (§5.1).
8. **Mute and report** work on bot lines exactly as on human lines.

---

## 7. Data and code map

| Piece | Where |
|---|---|
| Phrases 24–39 | `shared/chat.ts` (+ backend shared-contracts, game `data/chatPhrases.ts`, deep-compare) |
| PROTO 6 frames, `chat.msg.ch/slot` | `pawlegends/src/net/proto.ts`, vendored `pawlegends-net` |
| Relay in-match chat | `party-relay.ts` `chatSay()` match branch, `deliverMatchChat()`, legacy mapping |
| `match` thread kind | `ChatSink`, `pawlegendschatthreads.kind` |
| `botSeen` ring | `pawlegendssocial` (+ the account deletion purge already in CHAT-AVATARS §2.8) |
| Engine, bank, personas, typos | `pawlegends/src/chat/*` → `backend/src/vendor/pawlegends-chat` |
| Cues | Vendor facade `chatCues?(m)`; `referee-core.ts` posts `cues`; `RefereeOut += {t:'cues'}` |
| `BotChat` | `backend/src/pawlegends/party/bot-chat.ts` |
| Solo host | `app/matchSession.ts` (LocalHost) feeding the engine from snapshot events |
| UI | `ui/chatTicker.ts`, `ui/chatDrawer.ts`, `party/ui/quickChat.ts` (centre Type/More, All chip), `ui/ui.css` |

---

## 8. Tests

**Game (`npx vitest run`, `npx tsc --noEmit`)**
- **Engine distribution:** 10,000 scripted 7-minute cue streams (Crossing) and 5,000 (Hearthwood).
  - Lines per team: mean ≤ 1.2, P(0) between 0.40 and 0.58, max ≤ budget ≤ 4.
  - Room gap ≥ 40 s, per-bot gap ≥ 100 s.
  - Reaction delays all within 1.5–6 s (0.8–2 s for phrases).
  - Typing time is monotonic in length.
- **Guards:**
  - a pilot seat never speaks
  - ranked, Rookie match 1 and an older facade without cues behave as specified
  - a probe gives silence for the rest of the match
  - a question or unknown human text gets no reaction
  - at most one reaction per human message
  - a stale guard drops the line without spending budget
  - a quick-tier recipient gets only `q` ids, or nothing
- **Memory:** 200 consecutive matches for one account give no `lid` repeat within 80 lines, and no surface repeat for exempt tokens within 3.
- **The bank lint (§5.9).** The typo pass never yields a filter reject that gets sent.
- **The same seed gives the same plan** (testability).
- **Sim:** the hash trail and the final hash are identical with `chatCues` read every tick, on every v19+ fixture. `simSourceHash` and `simGolden` are unchanged.
- **UI:** the ticker fade times, the drawer tier swap (input vs chips), the Enter and Shift+Enter routing, and the `isTyping()` guard blocks QWER.

**Backend (`npm test`)**
- Relay `chat.say` in match:
  - team and all routing
  - per-recipient tier, and text refused in a quick team
  - phrase scope
  - `CHAT_LIMITS` shared with bot seats
  - `chat_mute`
- **Wire secrecy:** the frames have no `from` and no bot marker. A bot frame and a human frame have identical key sets.
- **Old sockets:** PROTO 4 and 5 sockets get only the legacy-mapped phrases.
- **Storage and reports:** `ChatSink` stores bot lines as `bot:<slot>`. A report on a bot line returns the normal result.
- `BotChat`: never fires outside `match` (plus the end window); restore resets the budget to 0.
- `botSeen` is written once per human per match.

**e2e (Playwright)**
- `hud-area.spec.ts` adds `.pl-chatline` to the transient list.
- A new `chat-layout.spec.ts` fills 2 ticker lines and asserts no intersection with the minimap, feed, ability cluster, enemy portraits, paw button and emote chip. It runs at 667×375 and 844×390, minimap S, M and L, with and without the emote chip.
- The open drawer never covers the ability cluster or the left joystick half.
- **Desktop:** Enter, type, Enter delivers, and no cast fires.
- **Minors:** an under-16 account sees chips only and receives bot lines as phrases.

---

## 9. Metrics (analytics, sampled like `mp_social`)

**`mp_chat_bot` (per team at match end)**
- mode, map, bots, persona mix, budget drawn
- lines sent, by category
- lines dropped, with the reason: guard, filter, limit, tier, memory, probe silence, end window
- reactions sent, probe hit (yes/no)

**`mp_chat` (per human at match end)**
- text and phrase sends by channel, rejects by reason
- mutes, split by bot or human target (the client does not know which, so the server joins it)

**Dashboards**
- Bot lines per match (targets: mean ≤ 1.2, P(0) ≥ 40%, max ≤ 4).
- **The realism KPI:** probe messages per 100 matches. Compare rooms that drew budget 0 with rooms that drew more than 0. That is a natural control group with no flag. The target is no significant difference.
- Human replies within 20 s of a bot line.
- Mutes per 100 bot lines vs per 100 human lines.
- Reports on bot lines (target about 0).

**Alerts**
- Any bot line rejected by the runtime filter.
- Bot lines per match above 4 (a bug).
- Any bot delivery outside phase `match`.

---

## 10. Build order (lanes)

| Lane | Work |
|---|---|
| M1 Contracts | Phrases 24–39 and copies, PROTO 6 `chat.say`/`chat.msg` in match, the `match` thread kind, `botSeen` |
| M2 Relay in-match chat | `chatSay` match branch, tiers per team, legacy mapping, `ChatSink`, reports |
| M3 UI | Ticker, drawer, wheel centre and All chip, desktop keys, `isTyping` guard, mute and report long-press, layout e2e |
| M4 Engine | `botChatter`, personas, bank and lint, typos, memory; pure unit tests |
| M5 Cues + BotChat | Facade `chatCues`, referee `cues`, relay `BotChat`, the hash-trail test |
| M6 Solo | LocalHost engine, shared bark gap, `localStorage` memory |
| M7 Metrics | Events, dashboards, alerts |

M4 can start in parallel with M1. M5 needs M2 and M4.

---

## 11. Your call (defaults apply if no answer)

1. **Bot identity signals.** Persona names ("Biscuit the Clem" vs human "<adjective> <cat>"), "?" for bot seats on loading, and `MatchMsg.names: null`.
   - Default: **leave them as they are.** This design makes the chat natural but does not disguise who is a bot.
   - Giving fill bots human-style names and removing the "?" is a separate, deliberate deception decision with store-review and consumer-law exposure. It is not done here.
2. **Free text with strangers in matchmade games.**
   - Default: **allowed in team chat** when every human on the team is 16+ and registered. This extends CHAT-AVATARS §2.1, which keeps pre-match team chat phrases-only.
   - Alternative: free text only in friend parties.
3. **All chat.** Default: phrases only (Wild Rift removed all chat). Alternative: none at all.
4. **Budget distribution.** Default: 0.40 / 0.30 / 0.20 / 0.10 per team.
5. **Typo "*fix" follow-ups.** Default: on, chatty persona only.
6. **Bot chatter in Rookie match 1.** Default: off.
7. **In-match message retention.** Default: 30 days like party chat (stored only for reports). Alternative: 7 days.

---

## 12. Known issues to mention, not fix silently

- The bot identity signals in §11 #1 already let an attentive player tell bots apart, whatever the chat does.
- Cannon cues exist only once sim v21 (`feat/pawlegends-v21-fun`) lands. Until then, the `kaboom` and `cannon_*` categories never fire.
- Multi-relay: the in-match chat stays in one room on one relay, so it is fine. `botSeen` writes go to Mongo, so they are fine across instances.
- A live-deploy room handoff silences bots for the rest of the match (budget reset to 0). This is by design.
- `data/social.ts` and `proto.ts` doc comments, and MULTIPLAYER D8, still say no player text reaches a peer. Update them in M1.
- PROTO numbering: if the chat branch's PROTO 5 slips, this work takes PROTO 6 anyway. The relay accepts 1..6.
