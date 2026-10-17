# W2-META handover (meta screens, wave 2)

Green: `npx vitest run` = 44 files, 841 tests (meta: `src/meta/meta.dom.test.ts`, 30 tests, happy-dom).
`npx tsc --noEmit` has no errors in `src/meta/**`. At handover the only tsc error was in `src/share/index.ts:130`
(W2-SHARE, still in progress).

## Built (`bad-cat/src/meta/`)

`index.ts` exports `meta: MetaApi` (also the default export) plus pure helpers: `archiveLocked`, `bragLine`,
`tierState`, `replayOnly`, `weeklySentence`, `parPaws`. It imports `./meta.css` (every class is prefixed `bmt-`;
it reuses `bc-screen`, `bc-head`, `bc-card`, `bc-cta*`, `bc-link`, `bc-kicker`, `bc-muted`, `bc-toggle` and the
`:root` variables read-only). The screens import only `../types` and `../ui/dom`.

Every mount returns an idempotent unmount that removes the root and every `document` listener (Escape = back/close;
it is ignored while typing in a field). Async work (hasPhoto, exportSave, importSave, a2hs.prompt) checks `dead`, so
nothing writes after unmount. The first heading gets focus (`data-focus`). Targets are >= 44 px, the layout is
portrait first, safe areas come from `.bc-screen`, and nothing scrolls sideways at 390 px (the dev-shots script
checks this).

| Screen | Module | Notes |
|---|---|---|
| archive | `archive.ts` | The Glass is pinned first, then entries sorted newest first. Each row has the label, the title (text after the last `:`), chips for weekday, theme, boss, Felony Friday and community author, plus the record from `records(dayNo)`: score, par paws (from `DailyEntry.par`) and a stamp (perfect: PERFECT CRIME, clean: GOT AWAY, caught: CUDDLED). Locked when `!club && todayNo - dayNo > freeDays`; tapping a locked row calls `onLocked(dayNo)`. Club players get the boss replay pack row (`onPlay`). Free players get a lock row instead, which calls `onLocked` with the oldest locked boss day. |
| rapSheet | `rapsheet.ts` | Mugshot board (height lines, name plate, WANTED stamp), "Known as" rank, the brag line "212 vases, 31 mugs, 14 cakes, framed the Roomba 9x", and Crimes / On file / Streak. The grid is perforated postage stamps. Missing crimes show "?" and "not yet". `gold` tiles are gold with a star, specials are tinted. Filters: All, Stamped, Specials. Tapping a stamp shows a case note with the first date. The sticky Share button calls `onShareCard`. Empty state: "No crimes yet. Suspicious." with no share button. |
| season | `season.ts` | Paper header with the name, a DAYS LEFT stamp (red at 3 or fewer), tier N/30, an XP bar and the XP rule. Free row: tiers 1–15. Club row: tiers 16–30. Each row scrolls sideways to the first claimable tier on mount. States: claimed (MINE stamp), claim (button; the tier is marked claimed at once, then `onClaim(tier)` fires), title-only, locked (XP still needed), and club (Join Club, `onJoinClub`). Free players also get a big "Join the Chaos Club" button. Cosmetics are previewed by colour swatch, slot icon and name. |
| settings | `settings.ts` | Every change calls `onChange` with a new `Profile` that builds on all earlier changes (`settings` + `prefs`); props are never mutated. Rows: Sound on, the master/music/sfx sliders (0..1, written on `change`), reduce motion, photo in clips (disabled and unticked without a photo, Promise supported, as in today's Side.ts), clip music (`prefs.clipMusic === true`, default off). Club only: caption style radio (Default + the 4 `COSMETICS` caption names, `prefs.captionStyle` 0..4) and the streamer layout toggle; free players get lock rows that call `onClub`. Also: analytics consent (`onConsent`), reminder time (`prefs.reminder`, default 19:00) + "Add to calendar (.ics)" (`onIcs(time)`), A2HS (Chrome prompt button with the result line, iOS Share tip, hidden when null or unavailable), save code export (text + `qr(code)` SVG, copy button, a "too big for a QR" line when `qr` returns '') and import (ok/bad message), the "This browser only" warning when `!persistent`, and the rows My cats, Restore purchases, Manage subscription (Club only), Creator code and the Club row (member badge or join). |
| friends | `friends.ts` | Ghosts sorted best first, with replay-only ghosts (`simVersion !== SIM_VERSION`) last. Each row: unranked mark, "replay only · old rules", and Watch instead of Race (it still calls `onRace`). Your `myScore` is slotted in as a highlighted "You" row, with a TOP CAT stamp when first. Headline: "Mochi still rules Kitchen #18 by 3,120" or "You rule …". Hide removes the row and calls `onHide`. The dot colour is a stable hash of `catCode`, because meta may not import the codec. Empty state: "No dares yet." |
| weekly | `weekly.ts` | Taped Wrapped-style card: week label, "Mochi's week", a big crime count, the GDD 3.5 sentence, the top 3 crimes, Roomba frames, Club `seen` and Most Wanted names, and a CASE CLOSED stamp (SO FAR before Sunday 18:00). `animated` adds CSS-only animation (pop, slide-in, stamp slam, shimmer), turned off under `prefers-reduced-motion`. Share calls `onShare`; ✕, the back link and Escape call `onClose`. Empty week: "No crimes this week. Suspicious." |
| consent | `consent.ts` | Fixed bottom banner, non-blocking: "Help us count crimes? Anonymous stats, no ads." with No thanks / Yes. The first choice wins; the banner then slides away by itself. Escape never decides. It steals no focus. |
| myRooms | `rooms.ts` | New room CTA (`onNew`), then rooms newest first: title, author, date, build time, "remix of N", and a CLEARED / NOT CLEARED stamp. Play and Remix are always there. Share appears only when the room is cleared (GDD 6.4 clear-to-publish). Empty: "No rooms yet." |

Dev only (not imported by `index.ts`, never shipped): `fixtures.ts` (sample data), `dev.html` + `dev.ts`
(`http://localhost:5174/src/meta/dev.html?screen=archive|rapsheet|season|settings|friends|weekly|consent|rooms&club=1&empty=1`,
also `persistent=0`, `ios=1`, `ready=0`; callbacks log to the console), and `dev-shots.mjs` (Playwright, run
`node src/meta/dev-shots.mjs` from `bad-cat/`). Screenshots at 390x844 @2x: `bad-cat/test-results/meta-*.png`
(20 files: every screen, plus Club, empty, not-ready and save-code variants). They were taken on the running 5174
server (not restarted) with no page errors and no horizontal overflow.

## For W3-UI-SHELL / integrator

- Wire it: `services.meta = meta` from `src/meta`. Settings props come from platform: `consent()`/`setConsent`,
  `a2hs()`, `icsReminder`, progress `exportSave`/`importSave`, platform `qrSvg` for `qr`, and money for
  restore/portal/club/creator code. The archive's `entries` come from `content.archive(todayNo, n)`, `records` from
  `platform.dayRecord`, `freeDays` = 14.
- Season claims: call `progress.claimTier`, then either remount with the new view or leave it (the screen already
  shows MINE).
- Consent banner: mount it on the `bc-app` root (it is `position: fixed`) and unmount it after `onChoice`.
- `src/ui/screens/RapSheet.ts` and Side.ts `mountSettings` (L5) are the older plain versions; W3 can switch to
  `meta.rapSheet`, `meta.season` and `meta.settings`.

## Deviations and gaps

- Change request filed in FULL-PLAN.md: `SeasonView.tiers[].title?` (progress has `tierTitle`). Until then,
  title-only tiers read "Bragging rights" / "Title earned".
- The friend dot colour is a hash of `catCode`, not the cat's real colour. If wanted, W3 can pass a decoded colour
  later (this would need a `FriendsProps` addition).
- Par paws are computed locally (same rule as `progress.parPaws`) because meta may import only types and dom.
- The caption style previews are CSS approximations of the 4 Club styles. W2-SHARE owns the real clip captions.
- No known bugs from `docs/*.md` were touched.
