# W2-EDITOR: Room Maker (GDD 6.4)

Owns `bad-cat/src/editor/**`. `npx tsc --noEmit` clean; `npx vitest run` 52 files / 928 tests green (editor: 41 tests
in `editor.test.ts` + `editor.dom.test.ts`). Lazy chunk: the shell wires `loadEditor: () => import('./editor').then((m) => m.editor)`.

## Files

| File | What |
|---|---|
| `index.ts` | `editor: EditorApi` (`open`, `check`), default export, helpers re-exported; imports `editor.css` |
| `RoomMaker.ts` | The flow (DOM over a renderer): shell -> props -> human + event -> targets -> clear it -> publish -> done; gestures, undo/redo, speed clock, admin export, analytics, WebAudio blips, haptics; flat-grid fallback without WebGL |
| `palette.ts` | 6 tabs (Fragile, Food, Fabric, Tech, Plants, Party); 61 kinds, each in exactly one tab; Roomba (20) and sponsor product (63) excluded; icons and chip hints |
| `placement.ts` | Pure edits: place (snaps to the cell's surface level), move, rotate (a lamp turns to a valid cable cell), delete, cloth w x d resize, targets (max 3, wreckable only), spawn, shell switch, remix copy, `gameplayKey` |
| `budget.ts` | Limits (40 props, 3,000 points, 3 targets, clear 2 of 3), `propCost` (stacks full), meter moods and lines |
| `check.ts` | Pure `check(room, content, {admin})` -> `{ ok, errors, budget, bad }`; friendly error text |
| `publish.ts` | Title/author filter, ancestors, remix line, `finalizeRoom` (encode -> decode = the room receivers play), 1200 x 630 card, speed clock and badge, admin JSON export |
| `history.ts` | Undo/redo stack, 20 steps |
| `editor.css` | Own `bce-*` classes, portrait first, >= 44 px targets, safe areas, reduced motion |
| `dev.html`, `dev.ts` | Dev page (not shipped): `http://localhost:5174/src/editor/dev.html?speed=1&admin=1&r=<code>&auto=N` |
| `test-util.ts` | `validKitchen()` for tests |

## Behaviour

- **Rendering:** `opts.renderer` (extension) or `render.createRenderer(stage)`, `setLayout('streamer')` (whole room),
  `load()` coalesced on every edit, frames drawn from `initSim(play)` (the cat at the spawn, the human idle), the
  overlay through `setEditorOverlay` (grid, hover, red `bad` cells from `check`, gold target rings, spawn paw).
  Without WebGL or `pickCell` a flat tappable CSS grid is used. The own renderer is disposed during the playtest and
  on exit (one WebGL context while the shell runs the playtest), then recreated.
- **Gestures (step 2):** tap empty cell = place the chosen kind; tap a prop = rotate 90°; drag (> 8 px to another
  cell) = move; hold 480 ms = delete ("Poof. Gone."); tap a tablecloth with another kind chosen = put it on the cloth;
  "Cat start" tool or drag the paw = move the spawn; Ctrl/Cmd+Z, Shift+Z. Refusals get a cheeky toast and a haptic
  buzz ("That's the human's spot. Rude.", "That's the Roomba's road.", "Too much chaos, even for a cat").
- **Placement rules mirror the content validator** so a placed prop never fails publish for its cell: not on a human,
  the spawn, its two camera-side cells, the cat bed, a surface spectator slot, the accomplice spot, the Roomba loop
  (blocking kinds) or a lamp's cable cell; tree on L0 beside an L3 cell; boxes on the floor; a lamp needs a free
  floor cable cell; cloths stay on one surface, never overlap, never cover a human (default 2 x 2, resize 1..6).
- **Budget:** live meter (`1,290 / 3,000 chaos · Getting spicy`), placement refused above 3,000 or 40 props (admin:
  no budget, 45 props).
- **Human:** maker routines that fit the shell (`r.maker` and mirror/webcam present): Chef Dad, Couch Potato and
  Napper everywhere, WFH Worker only in the Home office (it needs the webcam). 12 room events. Admin: every routine,
  every shell (boss shells get `boss`, `BOSS_TICKS` and a second human), every theme.
- **check():** the brief's rules plus `content.validate` on the resolved room with a `ugc-` id (BFS/Dijkstra
  reachability, first target <= 6 s, 2 targets in sight, cables, cloths, Roomba road, spawn readability). Its
  prop-count (25 min), budget and target-count messages are replaced by the editor's own, so maker rooms have no
  25-prop minimum. Cells named in errors go into `bad`.
- **Clear it:** `opts.playtest(room)` gets `finalizeRoom(draft)` = `decodeRoom(encodeRoom(...))` (the `ugc-<crc>` id
  and seed receivers play, per the W1-CODEC note). Publish unlocks when that run has `targets >= 2`; any gameplay
  edit afterwards (`gameplayKey`) locks it again ("You changed the room since your clear"). Title edits do not.
- **Publish:** title (24) and author (12) through `codec.filterName` (blocked/empty -> "Untitled Room" / "A Cat"),
  `encodeRoom` v2, `opts.linkFor(room)`, card via `render.renderRoomStill` (else a flat illustration with prop icons)
  plus title, "by Author · Shell", remix line, "Can your cat wreck it?" and the speed badge. Result
  `{ kind: 'published', room, code, link, card, buildMs }` resolves on Share or Done (the shell opens its share
  sheet with the card). ✕ twice = `{ kind: 'cancelled' }`. `onExit()` is called once either way.
- **Remix:** `opts.initial` opens at step 2 with an editable copy (sponsor product, accomplice, par, author dropped);
  `ancestors = [initial.author, ...initial.ancestors]`, newest first, max 3. A non-maker shell starts fresh with a toast.
- **Speed build:** a 90 s countdown in the top bar (butter under 15 s, rose "+0:05" in overtime). `buildMs` = time
  from open to pressing Play on the clearing run; the badge "built in m:ss" shows only within 90 s.
- **Analytics:** `bc_room_maker` with `step` open | remix (on open), placed (first placement), cleared, published,
  plus `props` and `ms`. `track` throwing never breaks the editor.

## Acceptance run (Playwright, real renderer, dev server 5174, 390 x 844 touch, swiftshader)

Script: scratchpad `maker/e2e.mjs` (not in the repo). A new player at a human pace (1.2 s pause per action) picked the
Kitchen, placed 7 props (3 mugs, plate stack, wine glass, fruit bowl, cake), rotated one, kept Chef Dad + KETTLE!,
marked 3 targets, cleared (dev playtest answered 2 of 3), titled "Zyg's Kitchen", published: **45.6 s** end to end,
`buildMs` 36 s, card 1200 x 630 PNG (renderer still), events `open, placed, cleared, published`, no page errors.
The link `http://localhost:5174/r?r=IA8QAU44…` opened the game: after "Skip, use a house cat" the briefing showed
"Zyg's Kitchen · Chef Dad · Room by Zyg · MUST-WRECK ☕ ☕ ☕".

## Deviations

- Badge format is m:ss ("built in 1:27"), not the GDD's literal "0:87" (87 s is 1:27).
- Ancestors newest first (brief), capped by the editor (see FULL-PLAN change request).
- The dev page's playtest is a stub that asks how many targets you wrecked; the real run is the shell's
  `playtest` (W3-UI-SHELL).
- Kitchen offers 3 humans, not 4: WFH Worker needs a webcam (only the Home office has one).
- The editor uses its own small DOM helpers and `bce-*` CSS instead of `src/ui/dom.ts` toasts, so it looks right
  without the shell's stylesheet (dev page, any host).

## Gaps / for the integrator

- W3: wire `loadEditor`, `playtest` (practice run of the given room, return its `RunResult`), `linkFor`
  (`codec.buildLink({ room, ghosts: [] }, base)`), save the result to My rooms (`MyRoom { code, title, author,
  cleared: true, at, ancestors, buildMs }`), open the share sheet with `result.card`; Remix button on link-opened rooms
  (`initial: link.room`); admin = dev or `?studio=1`. Passing the live renderer as `renderer` (extension) avoids a
  second WebGL context.
- Change requests in FULL-PLAN.md: `RoomMakerOptions.renderer/cat/onReady`, `EditorApi.check` `bad` + opts,
  ancestors order, an editor camera pose (some cells sit behind tall furniture and cannot be tapped).
- Not run on a real phone; swiftshader only. No sim-driven playtest inside the editor.
- Known bugs in docs/*.md: none touched.
