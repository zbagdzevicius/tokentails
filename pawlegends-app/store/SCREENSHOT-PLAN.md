# Pawlegends App Store screenshots: research and plan

Status: real captures are in `raw-captures/`. The framed store images are not made yet. This file says what goes in each slot.

Brand (founder decision, Nov 8): the primary logo is #48, a heavy italic yellow "PawLegends" wordmark with a purple
extrusion, a lightning swoosh and a cat paw fist-bumping a dog paw. The app icon is #143, a crowned black cat with one
glowing eye on orange. Frame palette: **logo yellow #FFD23F**, **extrusion purple #4B1F7A to #2A0F4A**, **icon orange
#FF8A1F**, and **game pink #F06B8A** (the in-game Play button) as the accent. Captions are set in Fredoka Bold, the
game's own font, in white with a purple stroke, or in yellow on purple.

## 1. Research findings

### What the top MOBA and party games do

| Game | Orientation | Structure | Caption style |
|---|---|---|---|
| Brawl Stars | Landscape | 5 shots. The top three value propositions lead ("3v3 Battles", "Battle Royale", "Team Up With Friends"); team setup, character select and stage select follow. | 2–4 words, large, on a solid purple band at the bottom. Characters appear in the screenshots, not beside the captions (Gummicube says that is a missed chance). |
| Clash Royale | Portrait | 8 shots. Updates first ("Clan Wars 2"), then core loops ("1v1 battles", "team up with friends"). | Short, top. |
| Wild Rift | Landscape | The live listing shows Wild Rift's subtitle "Competitive 5v5 MOBA Action" and event cards ("Ahri-mania", "Worlds 2026"). The screenshot images themselves could not be read (lazy-loaded). | Event and skin-led, with a big champion splash over a gameplay frame. |
| Mobile Legends: Bang Bang | Landscape | Event or skin hero first: a new hero's in-game abilities with VFX and combat indicators, an "Alpha: New Skin" frame. Feature bullets elsewhere: "Classic MOBA Maps & 5v5 Battles". | Short headline plus an event tag. Hero cut-outs overlap the gameplay panel. |
| Honor of Kings, Pokémon UNITE | Landscape | No teardown found this session. The pattern seen across the genre: a hero cut-out bursting out of a tilted gameplay panel, plus an energy/VFX background. | Not verified this session. |

The Wild Rift, MLBB, HoK and UNITE rows describe the genre convention (a character cut-out over a real gameplay panel,
VFX energy behind it, a 2–4 word headline). For Wild Rift and MLBB only the listing and mirror text could be read. For
HoK and UNITE nothing specific was found. Before copying any detail, open each live listing on an iPhone.

### Conversion best practice (ASO sources)
- **The first 2–3 shots matter most.** They show in search results without the product page being opened. Give each a
  distinct job: the essence first (what you do in the game), then the main benefits ([AppTweak](https://www.apptweak.com/en/aso-blog/how-to-optimize-your-app-screenshots),
  [App Launchpad](https://theapplaunchpad.com/blog/app-store-screenshots-optimization/)).
- **A landscape game shows one large shot in search, not three.** Shot 1 carries the whole search impression, so it
  must read as "cute cats vs dogs MOBA" at thumbnail size.
- **Benefit captions beat feature labels.** One vendor reports an 18–31% lift across four A/B tests (vendor data, treat
  with caution: [Sonar](https://trysonar.app/blog/app-store-screenshot-captions)). Captions must stay readable at
  thumbnail size: ≤5 words, ≥ 7% of the image height.
- **Familiar characters win.** Rovio's Angry Birds 2 screenshot test (+13% conversion) and Supersonic's real-game
  elements test (+15% CVR) are cited in `logos/judge/MARKET.md`.
- **Test.** Show the first three to five people for 3 seconds and ask what the game is. Later, A/B test with Product Page
  Optimization (up to 3 treatments).

### Apple rules that constrain the frames
- **2.3.3:** "Screenshots should show the app in use, and not merely the title art, login page, or splash screen. They
  may also include text and image overlays…" Marketing frames, captions and character art around the shot are fine.
  The gameplay panel itself must be an unaltered capture of the app.
- **2.3.4:** app previews (video) may use only screen captures of the app itself. Narration and text overlays are allowed.
- So: **Gemini makes only the frame** (background energy, hero art bursting out, bands). The real capture is pasted in
  untouched afterwards with PIL. Gemini must never repaint the gameplay. Set captions with PIL in Fredoka, not in
  Gemini, so the spelling is exact.

### Honest claims (sources in the app and the live metadata)
- "Seven-minute 3v3 matches" (description). Captured matches ended at 6:01–7:54, so **"7-minute battles"** is honest
  and "5-minute" is **not**.
- 20 heroes: the pick screen shows CATS 10 vs DOGS 10. Note: `fastlane/metadata/en-US/description.txt` still says "Ten
  cat heroes" and "a team of cat heroes against a pack of dogs". Since sim v14 you can play the dogs, so update the
  description in the same release.
- "No account, no sign-up, no ads", "Plays offline against bots" (description; the lobby shows "No account needed").
- A party holds up to three players on one team (description; the party lobby shows 3 seats).
- "Free" only if the price tier is free at release. The app build has no purchase links (`VITE_PAWLEGENDS_APP=1`).

## 2. The captures (`raw-captures/`)

These are real frames from the current game (`origin/main`, sim v16), run in Chromium at each device's exact pixel size
with Metal GPU rendering. This is the same method as `scripts/screenshots.mjs` (simctl cannot drive touch). The HUD is
visible. The frames are JPEG q92 at full store resolution; the PNG originals stay in the session scratchpad.

**Method.** Vite dev server; a seeded profile (`tt.pawlegends.profile.v1`). Moves were minimap double-tap move orders
plus taps on ATK/Q/W/E/R. Mac used right-click and the keys. The victory screens are real wins: fresh first-match
profiles at `?speed=64`, with the run kept only when the team won (4 wins in 16 runs). The party lobby is a real
3-player party on the local relay harness (`backend/test/party-relay.harness.ts`), with no production traffic.

| File | Moment |
|---|---|
| `iphone/01_teamfight_ult-tangled-lights.jpg` | **Best teamfight.** the "Tangled Lights!" ultimate (Lambo's match) (purple/blue ring VFX), 3 heroes, damage numbers, CLANK. |
| `iphone/02_teamfight_enemy-ult-champions-challenge.jpg` | "Enemy ult: Champion's Challenge!" Fire ring, tower plaza, score 2–12. |
| `iphone/03_lane-fight_three-dogs.jpg` | Clem vs three crowned dogs (Bruno, Bean, Gravy) at their tower: big orange hit flashes, 365 dmg. |
| `iphone/04_lane-fight_shutdown-combo.jpg` | "SHUT DOWN! Combo x2 +60" over a duel in a shield bubble. |
| `iphone/05_tower-push_takedown.jpg` | Sir Brutus "Takedown" at the cat tower, kill feed +120/+240, ultimate (crown) ready. |
| `iphone/06_river-fight_clank.jpg` | Sir Brutus charging into a river fight, CLANK!, 3 heroes. |
| `iphone/07_pick_cats.jpg`, `08_pick_dogs.jpg` | "Choose your legend": CATS 10 vs DOGS 10 card grid, hero on the stage. |
| `iphone/09_victory.jpg` | **Victory!** Clem with the trophy, confetti, MVP card. |
| `iphone/10_party-lobby.jpg` | Party code, 3 players, Share / Copy link / Show QR, Start. |
| `iphone/11_hero_sage-arena.jpg`, `12_hero_sir-brutus.jpg`, `13_hero_duchess.jpg` | Cute hero close-ups on the lobby pedestal (arena, castles). |
| `ipad/01_teamfight_fountain.jpg` | 4 heroes at the fountain, gold ring VFX, CLANK. |
| `ipad/02_ult_curtains-up.jpg` | Bengal "Curtains Up!" fire-circle ultimate. |
| `ipad/03_pick_cats.jpg`, `04_pick_dogs.jpg`, `05_victory.jpg`, `06_party-lobby.jpg` (with QR), `07_hero_sir-brutus.jpg`, `08_hero_duchess.jpg` | As on iPhone, at 4:3. |
| `mac/01_lane-fight_pudding.jpg` | Desktop HUD, Sir Brutus brawling by the Pudding objective, "Pudding is here!" |
| `mac/02_lane-fight_combo.jpg` | "Combo x2", 4 heroes, shield arc, "Help in Sunny Lane!" |
| `mac/03_pick_cats.jpg`, `04_pick_dogs.jpg`, `05_victory.jpg`, `06_party-lobby.jpg`, `07_hero_sir-brutus.jpg`, `08_hero_sage-arena.jpg` | As above, at 16:10, desktop HUD. |

Gaps. The camera is close (a 3v3 on a phone), so no capture shows all six heroes at once; the "teamfight" frames show
3–4. For a bigger shot, re-run with camera height "High" (`pawlegends.camHeight.v1 = high`) on iPad or Mac in the
late game. Every defeat screen was dropped.

## 3. Frame system (all devices)

- **Layout.** The real capture sits as a slightly tilted (−2° to −3°) rounded panel with a thick yellow (#FFD23F)
  outline, covering **62–70% of the canvas**. The caption band is on top (landscape) for iPhone and Mac, and above the
  panel for iPad. The PawLegends logo (#48) appears small, top left, on shot 1 only.
- **Gemini's job: the background and the hero bursting out.** A purple-to-orange energy backdrop, lightning swooshes
  echoing the logo, and paw-print sparks. One or two heroes in the game's own style (cel-shaded, chunky, cute; use the
  `hero_*` captures and `client/public/pawlegends-game` hero renders as reference images) leap out of the panel's
  corner and overlap its edge. Leave the panel's rectangle as a flat magenta (#FF00FF) key area so the real capture is
  pasted in afterwards, unaltered.
- **Panorama.** Shots 1→2 share one continuous lightning swoosh across the boundary, so the gallery reads as a strip
  when swiped (Brawl Stars / MLBB style).
- **Cats vs dogs.** Cat shots lean purple, dog shots lean orange; shots 1 and 3 split both.
- **Caption rules.** ≤5 words, Fredoka Bold, white with an 8px purple (#2A0F4A) stroke, or yellow on a purple band.
  Cap height ≥ 7% of the image height. Never cover the HUD's centre action.

## 4. iPhone 6.9" (2868 x 1320, landscape): 6 shots

| # | Caption | Capture | Art direction for the Gemini frame |
|---|---|---|---|
| 1 | **Team Cat or Team Dog?** | `iphone/01_teamfight_ult-tangled-lights.jpg` | **The hook.** Logo #48 small top left. The panel shows the Tangled Lights ultimate. A cat hero (Clem with sword) bursts out of the left edge and a dog (Sir Brutus with shield) out of the right, fist-bumping paws above the panel like the logo. Split backdrop: purple left, orange right, with a yellow lightning bolt down the middle. Must read at thumbnail size. |
| 2 | **Fast 7-minute battles** | `iphone/03_lane-fight_three-dogs.jpg` | Speed: motion streaks and a stopwatch-shaped burst of lightning behind the panel. Clem leaps out of the top-right corner mid-swing. The lightning swoosh continues from shot 1 (panorama). Orange-heavy. |
| 3 | **20 heroes, big plays** | `iphone/07_pick_cats.jpg` (or `08_pick_dogs`) | A fan of 5–6 hero cut-outs (Sage, Duchess, Lambo, Sir Brutus, Nugget, Cocklejaw) peeking over the top edge of the panel like trading cards. Purple spotlight backdrop with confetti. |
| 4 | **Squad up with friends** | `iphone/10_party-lobby.jpg` | The lobby is plain UI, so the frame does the work: three hero heads (Clem, Sage, Pixel) high-fiving above the panel, a share/link glow, warm pink-purple. A small sub-caption "Party code, up to 3" is optional. |
| 5 | **Pull off the comeback** | `iphone/04_lane-fight_shutdown-combo.jpg` (or `05_tower-push_takedown`) | The SHUT DOWN moment: a big yellow impact star behind the panel, Sir Brutus charging out of the bottom-left corner with shield first, debris and paw sparks. |
| 6 | **Victory tastes like treats** | `iphone/09_victory.jpg` | Confetti and fish-treat shower, a golden trophy glow behind the panel, Clem raising the sword out of the top edge. End card: the small icon #143 and "No ads. No account." in the bottom corner. |

## 5. iPad 13" (2752 x 2064): 6 shots

The listing ships iPad screenshots only if the app turns on iPad (`TARGETED_DEVICE_FAMILY` is iPhone only today, see
`scripts/screenshots.mjs`); Mac Catalyst uses the Mac set. At 4:3 there is more room: the panel covers ~62% of the
height and the caption band is above it.

| # | Caption | Capture | Art direction |
|---|---|---|---|
| 1 | **Team Cat or Team Dog?** | `ipad/01_teamfight_fountain.jpg` | Same hook as iPhone #1. The cat and dog fist-bump above the panel, logo top left, purple/orange split. |
| 2 | **Fast 7-minute battles** | `ipad/02_ult_curtains-up.jpg` | The fire-circle ultimate. Bengal bursts out of the right side amid flame sparks, orange backdrop with lightning. |
| 3 | **20 heroes, big plays** | `ipad/03_pick_cats.jpg` + `04_pick_dogs.jpg` | Two overlapping panels (cats tilted left, dogs tilted right) with a yellow "VS" lightning bolt between them. |
| 4 | **Squad up with friends** | `ipad/06_party-lobby.jpg` | Three hero heads high-fiving, a QR/link glow (the capture shows the QR). |
| 5 | **Cute heroes, fierce fights** | `ipad/08_hero_duchess.jpg` | The hero close-up (allowed: it is the in-app lobby, not a splash). Duchess on her cushion with sparkles. Frame Duchess's own glow around the panel. |
| 6 | **Victory tastes like treats** | `ipad/05_victory.jpg` | As iPhone #6. |

## 6. Mac (2880 x 1800, 16:10): 6 shots

The desktop HUD (ability bar, minimap bottom right) is the Mac app's real UI. Add a caption tag such as "Mouse and
keyboard" on #2.

| # | Caption | Capture | Art direction |
|---|---|---|---|
| 1 | **Team Cat or Team Dog?** | `mac/02_lane-fight_combo.jpg` | The hook frame as on iPhone, wider: room for both the cat and the dog bursting out of the left and right. |
| 2 | **Built for mouse & keys** | `mac/01_lane-fight_pudding.jpg` | Glowing Q W E R keycaps floating beside the panel in yellow-on-purple, with Sir Brutus swinging out of the bottom left. |
| 3 | **20 heroes, big plays** | `mac/03_pick_cats.jpg` + `04_pick_dogs.jpg` | The VS split as on iPad #3. |
| 4 | **Squad up with friends** | `mac/06_party-lobby.jpg` | As iPhone #4. |
| 5 | **Fast 7-minute battles** | `mac/07_hero_sir-brutus.jpg` | Sir Brutus on the pedestal, the stopwatch lightning motif. |
| 6 | **Victory tastes like treats** | `mac/05_victory.jpg` | As iPhone #6. |

## 7. Production steps (for the next agent)

1. For each slot: Gemini `gemini-3-pro-image` with reference images (the capture, logo #48, icon #143, 1–2 hero
   close-ups) and a prompt like "App Store screenshot frame, {W}x{H}, flat magenta #FF00FF rounded rectangle at
   {box}, tilted −2°, yellow outline; {art direction}; no text, no UI, cel-shaded cute 3D cartoon style matching the
   references." Gemini returns JPEG at its own size, so upscale or crop to the exact store size with PIL.
2. With PIL: chroma-key the magenta box and paste the real capture into it, untouched (only scaled and rotated to fit;
   never repainted). Draw the outline, then the caption in Fredoka Bold
   (`pawlegends/public/assets/fonts/Fredoka-Ext.woff2`; convert it to TTF or use Google Fonts Fredoka).
3. Write the files to `fastlane/screenshots/en-US/` (iPhone, `1_…png` to `6_…png`, replacing the 3 old shots),
   `fastlane/screenshots_mac/en-US/` (Mac) and `store/screenshots-ipad/en-US/` (iPad, not uploaded while the app is
   iPhone only).
4. Check each final image at 300 px wide: is the caption readable, are the heroes recognisable, is the gameplay visible?
   Show shots 1–3 for 3 seconds to someone new.
5. Metadata in the same release: change "Ten cat heroes" to 20 heroes, cats and dogs, in `description.txt`. Keep
   "seven-minute".
