# Landing and champion select: no-scroll UX spec

Status: spec, Nov 9 2026. Branch `feat/pawlegends-landing-v2`. Paths are relative to `pawlegends/` unless they start with `docs/`.

The founder asked for this verbatim: "improve UX/UI of initial landing screen by making it more organized as currently on mobile it's scroll area in landing and makes it hard to understand that it's scrollable. so aim for non-scrollable UI/UX. also adapt Wild Rift champ pick UI/UX as it's more straightforward and shows skills of each champ in there".

Inputs:
- The survey and the before-screenshots in `pawlegends/test-results/landing/before/` (`measure.json`).
- The Wild Rift reference, "SELECT YOUR CHAMPION!":
  - a timer at the top;
  - five seats on the left, each with a portrait, "Selecting..." or the champion, the player name and two spell icons;
  - role tabs over a portrait grid with names;
  - on the right, the champion name with a role icon, a passive plus 4 skill icons, and the tapped skill's name and text;
  - a big LOCK IN at the bottom centre;
  - the spells loadout at the bottom right.

## 0. Rules this spec keeps

- **No screen scrolls, at any size.**
  - Remove every `overflow-y:auto` "safety net" on the landing column (`lobby.css:229-234`) and the pick column (`ui.css .pl-pick-col`).
  - When height runs out, things are hidden in a fixed order (the ladders in §A5 and §B7). Nothing is pushed below the fold.
  - The only region that may scroll is the champion grid (§B4). Its scroll must be visible.
- **Zero friction.**
  - One tap starts play from the landing (Play, Co-op, PvP and Friends are all one tap).
  - One tap on a portrait selects the hero and shows its skills.
  - LOCK IN commits. A double-tap on a portrait also locks in.
  - No confirm dialogs, no dwell, no hold.
- **Space and size.**
  - Tap targets are 44 px. The embedded Games exit stays 44 px.
  - Safe areas are respected. A notched landscape iPhone (844x390) has about 47 px of inset on the left and right and 21 px at the bottom. Pad with `max(16px, env(safe-area-inset-left))` and the same for the other sides.
- **Data is reused, never copied.**
  - `HEROES` / `HERO_IDS`, `HERO_TEXT`, `heroCodex()` (skill cards with real numbers), `HERO_DIFFICULTY`, `portraitUrl()` / `heroPic()` (letter fallback when not baked), `icon(IconId)`, `TRICK_TEXT` / `TRICK_IDS`, and `openChampInfo()` for the live clip and lore.
- **Performance.**
  - The pick screen adds no 3D canvas. Portraits are the baked 128 px PNGs.
  - The live clip exists only inside the existing champion browser, opened on demand with "Preview".
  - Menus stay at the 30 fps pacer. Low quality turns animations off.
- **Product rules kept.**
  - No offers or money on the pick screen (GDD §8.1 #5). App builds never link to the web.
  - Dogs are locked before match 1. New players never see the pick screen (match 1 is the guided Clem match).
  - Usernames show on human seats; bots show champion names.
  - The rosters stay equal.
  - No feature flags: the new layouts replace the old ones.
  - Keyboard: Enter plays or locks in, H opens heroes, C opens cards, Esc closes or goes back. No single-key shortcuts outside the lobby (WCAG 2.1.4).

---

## Part A: Landing screen

> **Superseded (Nov 2026)** by [HOME-MODES.md](HOME-MODES.md): the left column was replaced by a corner layout with
> key art, a glass nav, a round PLAY and a Mode Select overlay. The rules in §0 and the hide-ladder idea still apply.

### A1. Diagnosis (from the survey)

- **Returning player at 667x375:** one 46vw column stacks the logo, the name block, Play, the bots buttons, a separate 44 px Co-op/PvP chip, the friends row, Join with code, Change hero / Cards / Today, the account line and the badge. That is 476 px in 369 px of space.
  - Change hero, Cards and Today exist only behind a hidden scrollbar.
- **The right half** is the 3D hero on the painted backdrop. It stays as it is.

### A2. Hierarchy and the inventory decision

There are three tiers, and each item of the survey inventory gets exactly one place.

| # | Item | New place | Phone (height ≤ 480) | Desktop |
|---|---|---|---|---|
| 1 | Brand logo | Top of the column | Compact wordmark, 36 px tall | Full logo, about 200x110 |
| 2 | Tagline | Under the logo | Hidden (as today) | Shown |
| 3 | Name block | Under the logo. The whole block is a button (`data-a="choose"`, returning players only) with a ⇄ glyph | Name 26 px, plus one sub-line "Marksman · Wind look" (role + element; the rarity chip becomes a 10 px gem before the name); eyebrow hidden | Eyebrow, name 44 px, role/element/rarity chips |
| 4 | Play button | **Tier 1**, the only filled pink button | Full column width × 52 | 400 × 72 |
| 5 | Play line | Merged into the row under Play: "vs bots" after the difficulty, the guided line for a first match, the dare text for a dare | One line, 12 px | One line, 14 px |
| 6 | Bots Easy/Normal/Hard, or "More bots after N matches" | Row under Play (radio group, arrow keys) | 34 px | 44 px |
| 7 | Co-op/PvP mode chip | **Removed as a chip.** It becomes two direct buttons in the online row: Co-op and PvP. Locked PvP reads "PvP 🔒 n/5", and a tap explains it in a toast. The pre-selection step is gone | – | – |
| 8 | Play online | **Tier 2** online row: "Co-op" (`data-testid=play-online`) | 40 px tall | 52 px |
| 9 | Play with friends | Online row: "Friends" (`play-friends`) | 40 px | 52 px |
| 10 | Join with code | Online row: a 44 px "#" icon button (`join-code`, aria-label "Join with code") | 44 × 40 | 52 × 52, labelled "Code" |
| 11 | Change hero (H) | **Tier 3** rail item "Heroes", and the name block itself is a button | Rail | Rail, plus the name block |
| 12 | Cards (C) + count | Rail item "Cards" with a count badge | Rail | Rail |
| 13 | Today 0/3 quests | Rail item "Today" with a ring progress; its popover opens upward from the rail; Esc closes | Rail | Rail |
| 14 | "No account needed." / signed-in line | Under the online row | Hidden (as today; the same text is also in Settings) | Shown, 13 px |
| 15 | Profile frame badge | Top-right corner, a 44 px avatar left of Settings | Hidden (as today at height ≤ 480) | Avatar + title |
| 16 | Card peek ("Your cats become skins" / fanned cards) | Desktop: bottom right as today. Phone: **removed**; the Cards rail item shows a mini-fan glyph and the drawer shows the teaser | – | Bottom right |
| 17a | Games exit (embedded) | Top-right corner, first, 44 px (unchanged) | ✓ | ✓ |
| 17b | Store (if open) | Rail item "Store" | Rail | Rail |
| 17c | Treat Track | Rail item "Track", after match 1 | Rail | Rail |
| 17d | Settings, Sound | Top-right corner (unchanged) | ✓ | ✓ |

**The rail.** It is one row at the bottom of the left column, in this order: Heroes · Cards · Today · Track · Store.
- Each item is a 44 px icon button with a 10 px label underneath. Items the player does not have yet are left out, so the row never shows gaps.
- Phones: 52 px wide × 56 px tall per item.
- Desktop: 72 × 72 with 13 px labels.

**Which states show the rail.**
- First visit (`firstTime`): the rail is hidden. That is today's rule: no Change hero, Cards or Today before match 1.
- An active dare: the rail is hidden and the online row is hidden too (today's rule).
- Settings, Sound and the Games exit always stay in the corner.

**Overlays are unchanged:** the offer card, the consent prompt, the cards drawer and the party dialogs.

### A3. Layout rules

- **Column container.** The column is `display:flex; flex-direction:column; height:100%; overflow:hidden` with the safe-area padding.
  - On phones it is anchored to the top and a flex spacer pushes the rail to the bottom.
  - On desktop the content block is centred vertically, so Play sits near the middle of the screen. Today it sits under a large empty logo area.
- **Column width.**
  - Phones: `clamp(296px, 46vw, 360px)`.
  - Desktop: `clamp(380px, 32vw, 460px)`, starting 64 px from the left.
  - `lobby.side` stays at 0.42, so the 3D hero keeps the right half.
- **Small heights.** Every vertical size uses `clamp()` against `dvh`, so 375 → 390 → 900 scales without new breakpoints. The `max-height` breakpoints are kept only for the hide ladder (§A5).
- **Phone height budget at 667x375** (no insets):
  - 8 (padding) + 36 (logo) + 6 + 44 (name block) + 8 + 52 (Play) + 8 + 34 (bots row) + 8 + 40 (online row) + spacer ≥ 8 + 56 (rail) + 8 (padding) = **316 px of 375**.
  - That leaves 59 px of headroom for text-zoom and font fallback.
- **844x390** (21 px bottom inset, 47 px side insets): 316 of 369. It fits, with the column starting at x = 47.
- **Online row widths at a 307 px column:** Co-op 88 + PvP 72 + Friends 100 + # 44, plus 3 gaps of 4 = 316. At the 296 px minimum the "Friends" label shrinks to its 👥 icon with an aria-label.

### A4. Wireframes

**667x375, returning player** (1 char ≈ 6.7 px across, 1 line ≈ 15 px down):

```
x=0                                   x=307                                         x=667
┌──────────────────────────────────────┬────────────────────────────────────────────────┐
│ 16  PawLegends  (wordmark 36h)       │                                [⚙44][🔊44]    │ y 8..44
│ ┌─ name block (button, 296×44) ────┐ │                                                │
│ │ ◆ SAGE  ⇄                 26px   │ │                                                │ y 50..94
│ │ Marksman · Wind look      12px   │ │             (3D hero on pedestal,              │
│ └──────────────────────────────────┘ │              painted backdrop,                 │
│ ┌──────────────────────────────────┐ │              lobby.side 0.42)                  │
│ │      ▶  PLAY AS SAGE    (296×52) │ │                                                │ y 102..154
│ └──────────────────────────────────┘ │                                                │
│ [Easy|Normal|Hard] 3×64×34  vs bots  │                                                │ y 162..196
│ [🌐 Co-op][⚔ PvP][👥 Friends][ # ]   │                                                │ y 204..244
│   88×40    72×40   100×40    44×40   │                                                │
│              (spacer)                │                                                │
│ [🐾 ][🂠³][☀0/3][👑 ][🛍 ]           │                                                │ y 311..367
│ Heroes Cards Today Track Store       │                                                │
│ 5 × 52w × 56h                        │                                                │
└──────────────────────────────────────┴────────────────────────────────────────────────┘
```

**667x375, first visit.** The name block reads "CLEM" with no ⇄. Play reads "▶ PLAY AS CLEM". The bots row becomes the guided line "Your first match: a short guided game". The online row shows only if online play is allowed for a new player (today: yes). There is no rail. 238 px used.

**1440x900, returning player:**

```
x=0   64                                  504                                                    1440
┌──────────────────────────────────────────┬─────────────────────────────────────────────────────┐
│                                          │                      [⎋ Games][◉ avatar][⚙][🔊]    │ y 24..68 (44 each)
│                                          │                                                     │
│     ┌──────────────────────────┐         │                                                     │
│     │  PawLegends logo 200×110 │         │                                                     │ y 150..260
│     └──────────────────────────┘         │                                                     │
│     3v3 cats and dogs. Quick matches…    │          (3D hero, right ~58%)                      │ y 270 (16px)
│     YOUR CHAMPION               (12px)   │                                                     │
│     ◆ SAGE  ⇄                   (44px)   │                                                     │ y 300..360
│     (Wind look)(Marksman)(Rare card)     │                                                     │ chips 28h
│     ┌──────────────────────────────┐     │                                                     │
│     │     ▶  PLAY AS SAGE  400×72  │     │                                                     │ y 410..482
│     └──────────────────────────────┘     │                                                     │
│     [ Easy | Normal | Hard ] vs Easy bots│                                                     │ y 496..540 (44)
│     [🌐 Co-op][⚔ PvP][👥 Friends][# Code]│                                                     │ y 556..608 (52)
│     No account needed.          (13px)   │                                                     │
│                                          │                                                     │
│     [🐾][🂠][☀][👑][🛍]  72×72 each,      │                              ┌──────────────┐       │
│     Heroes Cards Today Track Store       │                              │ card peek    │       │ y 760..832
│                                          │                              └──────────────┘       │
└──────────────────────────────────────────┴─────────────────────────────────────────────────────┘
```

The content block (logo through rail) is centred in the 900 px height, about 680 px tall.

### A5. Height hide ladder (never scroll)

Measured on the column's content box. Each step adds to the steps before it.

1. ≤ 480: hide the tagline, the eyebrow, the account line and the badge; use the compact logo; phones drop the card peek. This is today's set.
2. ≤ 360: drop the rail labels (icons with a badge only, 44 px), and shrink the logo to 28 px.
3. ≤ 320 (split screen or keyboard): hide the name sub-line, and Play becomes 44 px tall.
4. ≤ 280: the bots row moves into the pick screen. The landing keeps the last difficulty, and the Play label shows it: "Play as Sage · Easy".

A unit test pins this ladder in a table. An e2e test checks for no overflow at 667x375, 844x390, 1440x900 and 667x300.

### A6. Behaviour

- **Play** starts the match with the current choice, exactly as `quick` does today.
- **Co-op** is `online` in co-op mode and **PvP** is `online` in PvP mode. Each one stores the mode it starts in the same preference the chip used, so it remembers it.
- **The name block, Heroes and H** open the new champion select (§B) in solo mode.
- **Cards and C** open the drawer. **Today** opens the quests popover.
- The leaving animation, `disposeLobby` teardown and the 3-pulse Play glow on phones are unchanged.

---

## Part B: Champion select, adapted from Wild Rift

One component, `champSelect`, is used by every mode that picks a hero today. It replaces the solo `pickScreen` layout and the party `pickHtml` layout.

### B1. Modes and what fills each region

| Mode | Opened from | Timer | Team column | Side tabs | LOCK IN does | Bottom left | Bottom right |
|---|---|---|---|---|---|---|---|
| **Solo vs bots** | Landing: name block, Heroes rail item, H | None (the header shows "Choose your legend") | Seat 1 = you (username, else "You"), then 2 bot seats (4 in 5v5). A bot seat shows the bot's hero name and "Bot" when the match setup knows it before start; otherwise "?" and "Bot · picked at start" | All · Cats · Dogs. Dogs are locked before match 1: dog tiles show a 🔒, can be viewed but not locked in | Starts the match (`onStart`). The label is "LOCK IN" with a 12 px sub-line "vs Easy bots" | Bots radio (Easy/Normal/Hard, or the locked note plus the "I've played MOBAs before" link) | Paw Trick slot row |
| **Party (friends)** | `openParty` → party pick | 30 s at the top centre (`party-timer`) | Members sorted by slot. Humans show their username; an empty seat is a bot with its champion name, or "Bot" | All · Cats · Dogs. Note "{leader} chose Cats" for non-leaders (from `party-side-note`) | `data-p="lock"` (`party-lock`). Once locked, "Change hero" (`party-unlock`) replaces it | Nothing (Leave is in the header) | Paw Trick slot row |
| **Quick Play co-op** | Landing Co-op | 30 s | As party, with the side fixed. The found line ("2 players + 1 bot, Cats, Normal") sits under the timer | **Hidden.** The grid is only the assigned side, and a side badge sits in the header (`mm-side-switch` / `mm-your-team` keep their test ids) | As party | "Leave match" (`party-leave`) | Paw Trick slot row |
| **Casual PvP** | Landing PvP | 30 s | Your team only. Under the seats: "Opponents' picks show at loading" (`pvp-their-hidden`) | Hidden (side fixed) | As party | "Leave match" | Paw Trick slot row |
| **Try hero** (from the browser's "Try") | `openChampInfo` → Try | None | As solo, with that hero preselected | As solo | As solo | As solo | As solo |

**More rules.**
- **5v5** is not on main. The component takes `seats: SeatModel[]` of any length (3 or 5) and sizes the seats to fit (§B5).
- **The dare** has no pick screen (the dare sets the hero), as today.
- **Newbie lock:** a newbie whom the relay puts on Clem (`NEWBIE_HERO`) sees Clem selected and locked, and Clem's tile keeps the "New? Try this" badge.

### B2. Regions (top to bottom, left to right)

1. **Header bar** (36 px on phones, 72 on desktop).
   - Left: Back (solo; restores `beforeTry` on a Try pick) or Leave (Quick Play / PvP).
   - Centre: the title "CHOOSE YOUR LEGEND" with the timer under it (party modes). It turns red under 10 s.
   - Right: the side badge (Quick Play / PvP), or nothing.
2. **Team column** (left). One seat per team member, in slot order (§B5).
3. **Filter tabs** (centre, top).
   - Side group: `All` (grid glyph) · `Cats` (paw) · `Dogs` (bone).
   - A thin divider, then the role group: Fighter · Marksman · Tank · Assassin · Mage · Support.
   - The two groups combine. A role is a toggle: tap the active role to go back to all roles.
   - On phones the tabs are icons only, 32 × 34, with `aria-label` / `title`. Desktop adds labels.
   - Role glyphs map onto existing `IconId`s, so no new art is needed to ship. New `src/ui/champSelect/roles.ts`: `ROLE_ICON: Record<HeroRole, IconId>` = fighter→`sword`, marksman→`arrows`, tank→`shield`, assassin→`slash`, mage→`spell`, support→`heart`.
   - `ROLE_NAME` comes from the `HERO_TEXT[h].role` labels. Check each glyph on a device; replace any that reads poorly with a drawn glyph in `ui/icons/`.
   - The tab state is remembered per session; the default is the side of the selected hero (§B4).
4. **Portrait grid** (centre). Square tiles, the portrait (`heroPic`) on top, the name under it in 11 px (13 px on desktop).
   - Corner badges: side glyph (12 px), New (`isNewHero`), card-skin foil as a 2 px border in the rarity colour.
   - The heavy card frame of today's pick tiles is not used here. It costs height and paint.
   - States:
     - selected: gold ring and glow;
     - taken by a teammate: greyed, with "Taken: {name}" over the name;
     - locked for you (dogs before match 1, or the other side in a party): 🔒 over a dimmed tile;
     - a teammate hovering it: that teammate's seat colour as a 2 px corner dot.
5. **Hero panel** (right).
   - **Header:** role glyph, NAME (18 px; 24 on desktop), the role label, and difficulty dots (`HERO_DIFFICULTY`, 1–3).
   - **Look button:** a 32 px "Look" button (opens `onDeck` with the card drawer; no prices, no store).
   - **Skill row:** P (passive) · Q · W · E · R, as icons from `heroCodex(hero)` cards; the passive uses the hero's passive glyph. Each icon is a 44 px hit target, and the selected one has a ring. On phones narrower than 200 px the row wraps 3 + 2 (P Q W / E R), as in the reference.
   - **Skill text:**
     - The card's `name`.
     - A meta line: the key ("Q") · the kind ("Skill 1" / "Ultimate" / "Passive") · "Cooldown 8 s". The cooldown comes from the codex's `cooldown` fact and shows only when the existing `numbers` pref is on, so the round-1 "no numbers" rule holds.
     - The `what` line from the codex (one sentence).
     - At ≥ 844 width, also the first two facts.
   - **Preview ▶** (ghost, 36 px). Opens `openChampInfo({ hero, slot, order, pick, within })` on that skill. This is the only place a live clip runs, and lore lives there too.
6. **Bottom bar** (56 px on phones, 96 on desktop).
   - Left (under the team column): the per-mode control from §B1.
   - Centre: **LOCK IN**, the only filled pink button, 200 × 48 on phones and 300 × 64 on desktop, with an optional 12 px sub-line.
   - Right (under the panel): **Paw Trick slot row**. It shows 4 trick icons as a radio group (`TRICK_IDS`, 40 × 40 each, arrow keys), and the chosen trick's name in 11 px above the row. One tap picks a trick. This is our equivalent of Wild Rift's spell loadout.
   - There are no runes. Talents stay in-match (levels 3/6/9), so the pick screen shows nothing for them.
   - On desktop the bottom-right area also shows the selected trick's one-line text.

### B3. Interaction

- **One tap on a tile** selects the hero for viewing and shows its skills instantly. There is no animation wait; the panel swaps in under 16 ms because it is static HTML.
  - **Solo:** the tap also calls `onHero(h)` as today, so the landing and the 3D stage follow, and Back keeps the choice. Locked dogs show the panel but do not call `onHero`.
  - **Party:** the tap is the hover (`o.hover`), sent as today.
- **LOCK IN** is enabled only when the selected hero can really be taken. When it is disabled, the button says why on its sub-line: "Taken by Mia", "Dogs unlock after your first match", "The other side's hero". Today it is just a disabled button.
- **Double-tap a tile** (two taps on the same tile within 300 ms) locks in.
  - In solo that starts the match.
  - In a party it sends `lock`. A wrong double-tap is recoverable with "Change hero" until the timer ends.
- **Keyboard and assistive tech.**
  - Arrow keys move a roving tabindex through the grid.
  - Enter on a tile selects it; Enter again, or Ctrl/Cmd+Enter anywhere, locks in.
  - Esc means Back (solo) and is ignored in the timed modes.
  - Each tile is a `button` with `aria-pressed`.
  - The skill row is a `tablist` controlling the skill text `tabpanel`.
- **The selected skill slot persists across heroes**, so a player can compare ultimates by tapping through portraits. The first open selects the passive, as in the reference.
- **Portraits not baked yet:** `heroPic` falls back to the letter. `refreshPickFaces` / `setPickLook` repaint tiles and seats in place, so the trick, the bots setting, the filter tabs and the grid scroll position survive. The screen is never rebuilt.
- **The 3D stage stays behind the screen as the backdrop**, with no new 3D. Set `lobby.side` to 0.5 on the pick screen as today, and put a 55% scrim over it so the grid and panel read clearly.
  - The selected hero still turns on the pedestal behind the centre-right; on desktop the gap between grid and panel shows it.
  - Perf follow-up (not required): freeze the turntable 1 s after the last selection on phones.

### B4. Grid fit and the visible scroll

- **Default tab:** the side of the currently selected hero (Cats or Dogs). Ten tiles fit with no scroll at every size. "All" shows cats, then dogs.
- **Fit math:**
  - **667x375:** the centre column is 307 px, so 5 columns × 58 px tiles (portrait 46 + name 12). That is 4 rows × 62 = 248 px for all 20 heroes, against 249 px available. All 20 fit, but only just.
  - **844x390** (insets): 380 px gives 6 columns × 60. That is 4 rows (6/6/6/2) = 240 of 243 available.
  - **1440x900:** 7 columns × 84 is 3 rows = 300 px, with lots of room.
- **When the grid overflows** (larger text, more heroes, a 5v5 roster, or very short heights), the grid alone scrolls (`overflow-y:auto; overscroll-behavior:contain`). It shows that it scrolls in three ways:
  1. The row height is chosen so the last visible row is cut at about 40% (a partial row peeks).
  2. A 16 px bottom fade, plus a small "▾ more" chip that scrolls one row down on tap and hides at the end.
  3. A thin 3 px scroll thumb that is always visible (not the hidden scrollbar of today).
- **Selection never leaves view:** the selected tile is scrolled into view on open and after a filter change.

### B5. Team column sizing

- **Width:** 148 px at 667, 160 at 844, 300 on desktop.
- **Seat height** = `min(64px, (columnHeight − notes) / seatCount)`. Three seats are 64 px on phones; five seats are 48 px on phones and 88 px on desktop.
- **A seat:** a gold left bar if it is you; a portrait circle (40 px phone, 64 desktop); two lines of text; and a 16 px trick glyph if `PartyView` carries the member's trick (omit the glyph otherwise).

| State | Portrait | Line 1 (bold 14 px) | Line 2 (12 px) |
|---|---|---|---|
| Human, nothing hovered | "?" | Selecting… | username (or the hidden-name label in PvP) |
| Human, hovering | the hovered hero, desaturated | Selecting… | username |
| Human, locked | the hero, full colour, ✓ | hero name | username |
| Bot | the hero, or "?" | hero name, or "Bot" | "Bot" (· difficulty in solo) |
| You | as above, plus a gold bar and highlight | | "You" when not signed in |

### B6. Wireframes

**667x375, party or Quick Play, 3 seats, "Cats" tab:**

```
x=0         148 156                                463 471                     667
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [‹ Back 44]              CHOOSE YOUR LEGEND  ·  0:27               [🐾 Cats]   │ y 0..36
├────────────┬───────────────────────────────────────────┬────────────────────────┤
│▌(◯) Selecting…│ [▦][🐾][🦴] │ [⚔][➶][🛡][✂][✦][♥]   │ ➶ SAGE        ●●○ [Look]│ y 36..70 tabs 32×34
│▌    Mia (you) │ ┌────┐┌────┐┌────┐┌────┐┌────┐        │ Marksman                │
│ 148×64        │ │Clem││Sage││Lamb││Avie││Beng│ 58×62   │ (P)(Q)(W)               │ icons 44 hit
│ (◯) Selecting…│ └────┘└════┘└────┘└────┘└────┘        │ (E)(R)                  │
│     Tom       │ ┌────┐┌────┐┌────┐┌────┐┌────┐        │ MOONSHOT                │
│ (◯) Lambo  ✓ │ │Gabe││Meat││Pixl││Duch││Stil│        │ R · Ultimate · CD 60 s  │
│     Bot       │ └────┘└────┘└────┘└────┘└────┘        │ After a short wind-up,  │
│ 148×192       │   (grid 307×124, 2 rows, no scroll)    │ a huge arrow flies…     │
│               │                                        │ [▶ Preview]  36h        │ panel 180 wide
├────────────┬───────────────────────────────────────────┬────────────────────────┤
│ [Leave match] │        ┌──────────────────────┐        │ Pounce                  │ y 319..375
│  (QP only)    │        │      LOCK IN 200×48  │        │ [•][♥][≈][😺] 4×40       │
│               │        └──────────────────────┘        │                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**667x375, solo, "All" tab:** the timer is replaced by the title alone, and Back sits top left.
- The seats are You (username) and "?" Bot · Easy ×2.
- The grid is 5 × 4 rows = 248 px. It fits; with overflow the peek, fade and "▾ more" appear.
- Bottom left holds the Bots radio [Easy|Norm|Hard], 3 × 48 × 32.
- LOCK IN carries the sub-line "vs Easy bots".

**844x390, 5 seats (5v5-ready):** the seats are 160 × 48 with 32 px portraits. Grid 6 columns × 60. Panel 194 px wide with one row of 5 skill icons (P Q W E R), each 36 px with a 44 px hit area. Safe-area padding is 47 px left and right, and the bottom bar sits 21 px above the bottom.

**1440x900:**

```
x=0  64                     364 392                                       952 980                      1376
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [‹ Back]                              CHOOSE YOUR LEGEND                                                 │ y 24..96
│                                              0:27  (40px)                                                │
├────────────────────────────┬───────────────────────────────────────────────┬───────────────────────────┤
│▌(◯64) Selecting…           │ [▦ All][🐾 Cats][🦴 Dogs] │ [⚔ Fighter][➶ Mark…] │ ➶ SAGE   ●●○     [Look]   │ y 120..168 tabs 44h
│▌      Mia                  │       [🛡 Tank][✂ Assassin][✦ Mage][♥ Support]  │ Marksman                   │
│ (◯64) Lambo ✓      300×88  │ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐ │ (P)(Q)(W)(E)(R) 56 each│
│       Tom                  │ │ 84sq ││      ││      ││      ││      ││      ││      │ │                          │
│ (◯64) ?  Bot               │ │ Clem ││ Sage ││Lambo ││Aviete││Bengas││ Gabe ││Meatb.│ │ MOONSHOT  (20px)         │
│ (◯64) …  (5v5 seats 4,5)   │ └──────┘└══════┘└──────┘└──────┘└──────┘└──────┘└──────┘ │ R · Ultimate · CD 60 s   │
│                            │   … 3 rows × 7 = 21 slots, 300px, no scroll             │ What it does (2 lines)   │
│                            │                                                          │ • Damage 220 (+…)        │
│                            │      (dimmed 3D hero shows through the gap)              │ • Range 30 m             │
│                            │                                                          │ [▶ Preview skill]        │
├────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────┤
│ Bots [Easy|Normal|Hard]    │            ┌────────────────────────────┐               │ Paw Trick: Pounce        │ y 780..876
│ (solo) / Leave (QP, PvP)   │            │      LOCK IN   300×64      │               │ [•][♥][≈][😺] 4×48       │
│                            │            └────────────────────────────┘               │ Leap a short way…        │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Desktop centres a 1312 px content block and caps it at 1400 px.

### B7. Height hide ladder (pick)

Each step adds to the steps before it.
1. ≤ 420: hide the hero panel's facts (the `what` line only) and the difficulty dots' label.
2. ≤ 360: tiles shrink to 52 px; the role tabs keep their icons; the trick name above the trick row is hidden (it is still in the tooltip).
3. ≤ 320: the grid uses its internal scroll with the visible affordance (§B4). The header shrinks to 28 px.

The screen itself never scrolls. An e2e test asserts `scrollHeight <= clientHeight` for the screen, the team column and the panel at all four sizes.

---

## C. Files to change

**New:**
- `src/ui/champSelect/champSelect.ts`. Pure `champSelectHtml(model)`, where the model is `{ mode, seats, heroes, selected, filter, slot, trick, timer?, lock: { enabled, reason, label, sub } }`. Plus `wireChampSelect(root, handlers)` (tap / double-tap / keyboard / filter / skill tab / trick) and `refreshFaces(root)`.
- `src/ui/champSelect/champSelect.css`. Grid template, the clamp sizes and the hide ladder.
- `src/ui/champSelect/roles.ts`. `ROLE_ICON` and the role order.
- `src/ui/champSelect/seats.ts`. Builds `SeatModel[]` from the solo `Choice` + bots, or from `PartyView` (slot order, casual-PvP own team, hidden names).

**Landing:**
- `src/ui/lobby/lobbyScreen.ts`: new markup in the §A2 order, the rail, the name-block button, the Co-op/PvP buttons replacing `modeChipHtml`, the quests popover anchored to the rail, the peek only on desktop.
- `src/ui/lobby/lobby.css`: remove the `.lb-col` overflow (229-234), add the flex column, the rail and the ladder.
- `src/ui/ui.css`: `.pl-title*` (74-98) and the `max-height:480px` rules (545-590) folded into the ladder.

**Solo pick:**
- `src/ui/screens.ts` `pickScreen`: keep the `PickOpts` API and return the new component. Remove `sideSwitch`, the kit rows, the detail panel and the skins strip from the layout; the skins strip moves to the Look → `onDeck` button. Keep the exported `SIDE_TAB_CSS`.
- `src/ui/ui.css`: remove the `.pl-pick-*` rules (105-152, 553-569, 928-955).
- `src/ui/champions.css`: remove the pick-tile overrides.

**Party pick:**
- `src/party/ui/partyPick.ts`: `pickHtml` and `decoratePick` render through `champSelectHtml`, keeping `data-p` and every test id: `party-lock`, `party-unlock`, `party-hero-*`, `party-timer`, `party-info`, `party-leave`, `party-side-note`, `mm-found-line`, `pvp-their-hidden`, `mm-side-switch`, `mm-your-team`.
- `src/party/party.css` (100-178): remove the old strip and grid styles.
- `src/party/partyClient.ts` (~1510/1528): wire the double-tap lock and the per-tile reason text.

**App:**
- `src/app/app.ts`: `showTitle` passes the rail data (Treat Track, Store, quests); `showPick` builds the solo seat model (bot heroes if known before start); the scrim; Ctrl/Cmd+Enter.
- `src/render/lobby.ts`: only if a scrim or freeze hook is needed.

**Untouched (reused):** `heroText.ts`, `skillCodex.ts`, `champBrowser/*` (except that it accepts the `slot` already in `ChampBrowserOpts`), `portraits.ts`, `icons.ts` (unless a role glyph is redrawn), `data/**` (no float literals added).

**Tests:**
- Update the unit tests: `lobby-screen`, `lobby-online` (mode chip → Co-op/PvP buttons), `side-switch` (side tabs), `party-pick-mm`, `party-lobby`, `champ-browser`, `card-name`, `gaps-wave-a`, `skins-offer-rules` (still no offer on pick), `card-fx-ui`, `integration`, `card-art`.
- New unit test `champ-select.test.ts`:
  - the filters combine;
  - seats fill for 3 and 5, with bots keeping hero names and humans showing usernames;
  - the lock reasons;
  - double-tap within 300 ms locks;
  - the slot persists across heroes;
  - the cooldown is hidden when `numbers` is off;
  - the rosters are equal per role.
- Update the e2e tests: `lobby`, `side-switch`, `champions`, `champ-browser`, `skins`, `round1`, `round2`, `rematch`, `store`, `treat-track`, `match-desktop`, `perf-ios`, `mp/matchmaking`.
- New e2e test `no-scroll.spec.ts`. Per-test viewports 667x375 and 844x390 (touch, 2x), 1440x900 and 667x300. Profiles: new, returning and dare, with online flags mocked as in the survey. It asserts:
  - no element scrolls except the grid;
  - every tier-1, tier-2 and rail control is inside the viewport and at least 44 px;
  - the pick screen's LOCK IN, the selected tile, the skill row and the trick row are in view.
- `perf-ios` must not regress.

## D. Open points (defaults chosen; change them if you want)

1. **PvP when locked.** Default: shown as "PvP 🔒 n/5", and a tap explains it. Alternative: hidden until unlocked.
2. **Default grid tab.** Default: the side of the selected hero, so there is no scroll. Alternative: "All", as in Wild Rift.
3. **First skill shown.** Default: the passive, then the last slot the player tapped. Alternative: Q, as the browser does.
4. **Freezing the 3D backdrop on phones.** Default: not in this pass; it is a perf follow-up.

## E. Implementation notes (Nov 9 2026, branch `feat/pawlegends-landing-v2`)

Built as specified, with these choices:

- **Name block action.** The name block is `data-a="name"`; the Heroes rail item keeps the one `data-a="choose"`, so
  tests and helpers that click `[data-a="choose"]` hit exactly one button. Both (and H) open the champion select.
- **Play difficulty at ≤ 280 px.** Play carries `data-diff` and shows it through CSS only at that height, so the
  button's text stays "Play as Sage".
- **Look.** With free or store coats or colour tints, Look opens a small sheet over the hero panel (coats, tints, and
  Cards for the drawer); without them it opens the drawer at once. The old pick's coat chips and tint swatches live
  there now.
- **Kept from the old pick:** the shelter champion owner badge ("Card", web only), the lane hint (desktop panel, and
  the role label's tooltip on phones), the role's Paw Trick hint (a dot on the recommended trick, its text on desktop).
- **Host squad.** The champion select declares a `data-slot="cards"` slot under the seats; the embed integration draws
  the squad there instead of the top-right dock, which would cover the hero panel. The landing's cards slot sits over
  the scene on the right, never in the column.
- **Skill codex.** The panel reads HERO_TEXT at once and loads the codex chunk lazily (as the browser does), then
  redraws its text with the codex line, the cooldown and the facts.
- **Party redraws** go through `patchChampSelect`, region by region, so the grid scroll, the focus, the filter and the
  tapped skill survive the 1 s timer and every hover.

## F. Review fixes (Nov 9 2026, after the visual and code reviews; merged with origin/main's 5v5 Classic)

- **Skill icons after a redraw:** `patchChampSelect` keeps host content only in `div[data-slot]` (the embed's slots). The
  skill tabs and Preview also carry `data-slot`; they were swapped into each other before.
- **5v5 Classic:** solo and party seats follow the team size (5 seats, 48 px each at phone heights); `partySeats` takes
  the size and a PvP flag (casual or a 5-per-team queue); teammate dots cover slots 0 to 4. The landing's 3v3 | 5v5
  toggle sits in the bots row (it replaces the "3v3 vs bots" line), so it costs no height. Phones show "3v3 | 5v5".
- **Notches and narrow centres:** the grid always has at least five columns (ten heroes of a side in two rows); when the
  centre column is under 380 px (667 px phones, insets) the side tabs and the role tabs take a row each.
- **Any hero can be inspected (party):** taken, other-side and post-lock tiles are `aria-disabled`, not `disabled`; a tap
  shows the hero's skills (LOCK IN says why it cannot be locked). A hero a friend just took stays in the panel. A
  member's grid opens on the leader's side and follows it when the leader changes side.
- **Keyboard:** arrows skip disabled tiles; the roving tab stop is never on a disabled tile.
- **Landing:** Co-op and PvP are ghosts (Play is the only filled pink button); the host's cards slot (About chip, badges)
  lives in the column above the rail; a first visit or a dare keeps Store and Treat Track in a short rail.
- **Pick:** Look always opens the small sheet (its Cards button is a ghost); the bots hint is visible text (under the
  bots on a desktop, over LOCK IN for 3.5 s after a tap on a phone); the party's notes sit over LOCK IN, not the timer;
  Quick Play's found line shows under the side badge; "▾ more" is in the flow under the grid; 11 px minimum text except
  long tile names (10 px); the stage behind the pick screen runs at the covered rate (15 fps) on phones.
