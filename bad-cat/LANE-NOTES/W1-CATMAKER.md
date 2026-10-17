# W1-CATMAKER handover

Owner files: `bad-cat/src/catmaker/**`. No `types.ts` change was needed: the CatMakerApi `manage`/`forget`, the
CatMakerOpenExtras fields and CatMakerResult `handle`/`catIndex` are implemented as frozen.

## What is built

| Feature | Where | Notes |
|---|---|---|
| 2 s video opener | `video-opener.ts`, `photo-input.ts`, `CatMaker.ts` | `videoGate` (pure): ≤ 3 MB → kept as is (`kind: 'video'`, the composer reads 0–2 s); larger → re-encoded on the device (first 2 s, short side ≤ 540, MediaRecorder over a canvas `captureStream`, mp4 when supported else webm); no MediaRecorder or a failed re-encode → still frame (`kind: 'photo'`) with a friendly note. Clips shorter than 0.4 s and `allowVideo: false` → still. The video stays open on the crop screen: a scrubber over the first 2 s picks the face frame. `FaceDecal.crop` is in OPENER pixels (video native size, re-encoded size, or the still's size) |
| Re-add after handoff | `CatMaker.ts` (`opts.reAdd`) | One screen "Add Mochi's photo again for the clip opener": add photo/video → crop → saved, spec untouched. Skip (`readd-skip`) resolves `{spec: initial, method: 'skipped'}` |
| k-means palette | `photo-palette.ts` | k = 3, deterministic (median-luma seed + farthest point, integer centroids, sorted by size). Sampled on a 48² grid of the head + body below the crop (`coatRegion`), face centre and saturated background skipped |
| Pattern guess (7) | `pattern-guess.ts` | white/orange/dark shares, per-axis stripe energy, head/body/paw band luma → calico, tabby (anisotropic stripes, before tortie because a brown tabby is orange + dark), tortie, colorpoint, tuxedo, bicolor, tabby (weak), solid. `paletteRoles` maps clusters to base/secondary/tertiary as the shader reads them. Preselects the chip (dashed + sparkle, "Our guess… Wrong? Tap another") |
| Dress-up screen | `CatMaker.ts` | All 7 pattern chips; colour rows relabel per pattern (Stripes / Dark patches / Points / Mottle; Belly / Bib & paws / White bits) and hide when unused; photo palette swatches first in each row; preview badge |
| Cosmetics | `CatMaker.ts` (`ownedCosmetics`) | Collar / hat rows list only `opts.owned` ids that exist in `COSMETICS` (+ None); rows hidden when nothing is owned; live preview |
| Studio / reply template | `CatMaker.ts`, `handle.ts` | `opts.studio`: "Drop a screenshot of their video" first, drag-and-drop anywhere, @handle field (`filterHandle`: '@' + up to 24 of [a-z0-9._]), live caption line, name starts blank. `result.handle` only, never stored |
| Up to 5 cats | `CatManager.ts`, `cats-manager.ts` | `catMaker.manage(host, {cats, active, maxCats, render, onUpsell})`: cards with flat 2D previews (no extra WebGL contexts) and the slot's face, tap = star, Dress up, Add (maker into slot `cats.length`, `adding` mode: skip = "Never mind" = no add), Delete (two taps, forgets the slot and shifts later slots' photos down so `loadFace(i)` stays with `cats[i]`; the last cat cannot be deleted). Full at `maxCats < 5` + `onUpsell` → "Keep all your cats in Club: up to 5" row; at 5 → a cheeky note |
| Photo store | `photo-store.ts` | Slots 0..4 (`MAX_CAT_SLOTS`, invalid slots ignored), new `move(from, to)`, memory fallback kept |
| `catMaker.forget(i)` | `index.ts` | Removes face + opener of a slot |
| `result.catIndex` | `CatMaker.ts` | Always set (default 0) |

## Integrator notes (wave 3, app-shell)

- `src/ui/app-shell.ts` still opens the maker without `catIndex`, `owned`, `studio`, `reAdd`: pass
  `catIndex: profile.active`, `owned` from progress (cosmetics owned), `studio` for `?studio=1`, and `reAdd: { name }`
  on the clip-handoff arrival when `loadFace(active)` is null; use `res.handle` in the clip caption.
- Wire `catMaker.manage` from settings / home "Your cats" with `maxCats` = 5 for Club, 1 free; `onUpsell` opens the
  Club paywall (GDD 9.2: never in the first session). Store the returned `{cats, active}` in the profile.
- `CatMakerOptions.adding` is internal (used by manage).
- The previous 2D fallback only drew solid/tabby; it now draws rough versions of all 7 (cards and no-WebGL).

## Tests

`catmaker-full.test.ts` (k-means determinism/convergence, 7 pattern fixtures, palette roles, video gate, re-encode
size, crop mapping, handle filter, cosmetics, manage reducer incl. slot shifts and max, photo store per slot +
memory/throwing-IDB fallback + move) and `catmaker-full.dom.test.ts` (studio handle field, reAdd Skip, all 7 chips,
colour rows per pattern, cosmetics rows, manage switch/add/delete/upsell). 66 catmaker tests green.

## Manual check (http://localhost:5174, Chromium headless, Vite module import)

Photo (calico drawing): guess Calico, face crop in opener px, JPEG opener. Small webm (229 KB): note "first 2 seconds",
scrubber works, kept as `video/webm`. Big webm (7.3 MB): "we will trim it", re-encoded to a 375 KB `video/mp4`, crop
scaled to the 540p opener. Studio: `@luna.mom` returned. Re-add: spec unchanged, slot 4 saved. Manage: 5 patterns on
cards, upsell row at the cap. Not tried: iOS Safari / in-app webviews (MediaRecorder mp4 on iOS 14.1+ should work; the
still fallback covers the rest).

## Gaps

- Pattern guess is a heuristic on synthetic-style coats; real photos with busy backgrounds will sometimes be wrong (the
  chip is always changeable). Phase 2 (`/yourcat` Gemini) is the better guess.
- A non-owned collar/hat already on an incoming spec is left as is (not stripped); entitlement checks stay with money/ui.
- Full-suite state at hand-off: catmaker tsc clean; other lanes' in-flight errors seen (`src/render/Renderer.ts`
  TS2554, `content.test.ts` Chef Dad routine, `platform.test.ts` analytics), not touched.
