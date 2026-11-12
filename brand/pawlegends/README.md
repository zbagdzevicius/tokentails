# PawLegends brand assets

Founder decision (Nov 2026): primary logo = candidate #48, app icon = candidate #143.
These are the final masters, regenerated with Gemini (`gemini-3-pro-image`) from the chosen candidates
and refined, not redesigned. Wired in: the game (lobby, boot splash, favicons), the `/pawlegends` and `/legends` landings, the share card `pawlegends-web/public/pawlegends/og.jpg` (copy in `client/public/pawlegends/og.jpg` until the cutover) and the app (`pawlegends-app/scripts/make-icons.mjs`).

`contact-sheet.png` shows everything on dark and light, and at small sizes.

## Logo (#48)

Heavy italic yellow "PawLegends" with a purple outline and extrusion, a blue/orange lightning slash and a
cat paw + dog paw fist-bump. Refinements: crisp letters, clean paws (four toe beans + main pad each),
fewer flame wisps, the soft grey drop shadow removed. Spelling checked at full size: "PawLegends".

| File | Size | Use |
|---|---|---|
| `logo.png` | 4582×2983, transparent | master primary logo |
| `logo-1200.png` | 1200 wide, transparent | web |
| `logo-dark-bg.png`, `logo-light-bg.png` | 1600 wide | previews on #14101c and white |
| `logo-compact.png` | 5579×1775, transparent | horizontal wordmark for small headers (no paws) |
| `logo-compact-600.png` | 600 wide, transparent | nav and header |
| `logo-compact-dark-bg.png`, `logo-compact-light-bg.png` | 1600 wide | previews |
| `emblem.png` | 1970×1250, transparent | the paw fist-bump on its own, no text |
| `emblem-square-1024.png` | 1024², transparent | the emblem centred on a square (avatar, loading screen) |
| `emblem-dark-bg.png`, `emblem-light-bg.png` | 800 wide | previews |

## App icon (#143)

Crowned black cat, now front-facing and looking at the viewer, glowing teal eye and yellow eye with a
teal flame wisp, orange-coral sunburst. Full bleed, no frame, no border, no "PL" mark.

| File | Size | Use |
|---|---|---|
| `app-icon-master-2048.png` | 2048², RGB | master |
| `app-icon-ios-1024.png` | 1024², RGB, no alpha | iOS App Store / Xcode single-size icon (iOS masks the corners) |
| `app-icon-macos-1024.png` … `-16.png` | 1024, 512, 256, 128, 64, 32, 16; RGBA | Mac (Catalyst) icon per Apple's macOS template: 824 px rounded square (radius 185.4) on a 1024 canvas, 100 px margin, soft drop shadow |
| `apple-touch-icon-180.png` | 180², RGB | iOS home-screen web clip |
| `favicon.ico` | 16/32/48 | browser favicon |
| `favicon-16.png`, `favicon-32.png`, `favicon-48.png` | RGB | favicon PNGs, a tighter head crop so the crown and eyes read |
| `pwa-icon-192.png`, `pwa-icon-512.png` | RGB | web manifest, purpose `any` |
| `pwa-maskable-192.png`, `pwa-maskable-512.png` | RGB | web manifest, purpose `maskable` (art at 84 %, sunburst mirrored into the margin so the crown and ears sit inside the 80 % safe circle) |
| `og-1200x630.png`, `og-1200x630.jpg` | 1200×630 | social / Open Graph card (icon tile + logo on dark plum). The site's current one is `pawlegends-web/public/pawlegends/og.jpg` |

## Source

`source/` holds the green-screen renders the transparent files were keyed from, and the scripts:
`key.py` (chroma key + despill + smudge cleanup), `build.py` (every derived size), `sheet.py` (contact sheet).
Run them with a Python that has Pillow and numpy:
`python key.py source/logo-greenscreen.jpg logo.png`, then `python build.py <dir with out/ and raw/> brand/pawlegends`.

## Known limits

- The logo extrusion under "Paw" keeps a faint dark band where Gemini's drop shadow was; it reads as a
  shadow on dark and light backgrounds.
- The top-left tip of the lightning bolt fades softly rather than ending in a hard point.
- The emblem is wide (1.6:1), so in `emblem-square-1024.png` it is small below 48 px; use the app icon
  or favicon at those sizes.
- The favicon is a crop of the icon art, not a separate simplified drawing; it reads at 32 and 48 px,
  and at 16 px it is the crown and two eyes on orange.
