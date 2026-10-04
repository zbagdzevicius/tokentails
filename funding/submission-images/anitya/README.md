# Anitya World Jam images (main jam + weeklies)

Built 2026-10-04. Every image uses only Token Tails art. The world shots are rendered from the exported
GLB files in `catnip-heist/export/anitya/worlds/`, the files that get uploaded to Anitya, through the
exporter's own `preview()` function. One still comes from the source game, and it is labelled that way.
Captions follow `catnip-heist/export/anitya/SUBMISSION.md` (titles, Clover, Kibble Corp HQ).

Rebuild with `sh src/build.sh`. To make new GLB views, run `node src/glbshots.mjs <outdir> src/jobs1.json`.
It starts its own Vite on 127.0.0.1:5291 and stops it when done.

## Where they go

- **Entry (Discord `#jam-submission`).** You enter by posting the world link with "a screenshot or two". Attach the world thumbnail plus map or crate shot, or for a weekly, the weekly thumbnail plus the raw `-crate` preview.
- **itch.io jam page (optional, not an entry by itself).** Cover 630x500 (315:250, verified spec), and 3 to 5 screenshots of up to 3840x2160.
- **Anitya world thumbnail.** No spec is published. Anitya may capture the thumbnail in-app. If an upload field exists, use the 1600x900 file.

## Main jam: "Catnip Heist: Shelter Break-in" (heist-08, submit by Oct 20)

| File | Size | Goes to | Alt text / caption |
|---|---|---|---|
| `main-itch-cover-630x500.png` | 630x500, 347 KB | itch cover image | Voxel pixel-art shelter crate inside Kibble Corp HQ, titled "Catnip Heist: Shelter Break-in". Free Clover from Kibble Corp HQ. |
| `main-world-thumb-1600x900.png` | 1600x900, 1.2 MB | Anitya world thumbnail; Discord attachment 1 | Kibble Corp HQ, a voxel kibble fortress with guard dogs and a caged shelter cat. Find the key, free Clover. |
| `main-shot-1-map-1920x1080.jpg` | 1920x1080, 329 KB | itch screenshot 1; Discord attachment 2 (the judges' map) | Top-down map of Kibble Corp HQ: 1 start and exit, 2 pressure plates, 3 key, 4 vault, 5 Clover's crate. Five guard dogs, 26 catnip leaves. |
| `main-shot-2-crate-1920x1080.jpg` | 1920x1080, 352 KB | itch screenshot 2 | Clover's crate at the heart of HQ. The shelter cat you came for waits inside the vault room. |
| `main-shot-3-hq-1920x1080.jpg` | 1920x1080, 286 KB | itch screenshot 3 | Kibble Corp HQ: a corporate kibble fortress where guard dogs keep shelter cats behind a vault door. |
| `main-shot-4-wing-1920x1080.jpg` | 1920x1080, 252 KB | itch screenshot 4 | The far side of HQ: the key office and the split wing. Every room is open to walk. |
| `main-shot-5-source-game-1920x1080.jpg` | 1920x1080, 315 KB | itch screenshot 5 (optional) | The same level in our browser game Catnip Heist (tokentails.com/heist). Labelled "Source game, not the Anitya world". |
| `catnip-heist-square-1024.png` | 1024x1024, 715 KB | square icon if a form asks for one (itch has no logo field) | Catnip Heist: a caged shelter cat in a voxel vault. |

Honesty notes:
- The map labels show the layout only. Mechanics (the key opens the vault, plates, dog patrols) exist in Anitya only after the section 5b AI prompts work. Don't add "playable" or "patrol" to captions until you've tested them in play mode.
- Shot 5 shows vision cones and lighting that the Anitya world does not have. That is why it carries the "source game" chip. Leave it out of the Discord post.

## Weeklies (themes not announced; titles from the SUBMISSION.md table, rename to fit the theme)

Each file is 1600x900 PNG, under 1.2 MB, with the kicker "Anitya Weekly Challenge". Discord: attach the thumbnail plus
`catnip-heist/export/anitya/previews/<world>-crate.png`.

| File | Size | Use if the theme is about | Alt text / caption |
|---|---|---|---|
| `weekly-heist-02-kennel-row-1600x900.png` | 1109 KB | sound, lures, animals | Kennel Row: two guard dogs, one crate. Bring Biscuit home. |
| `weekly-heist-03-twin-locks-1600x900.png` | 899 KB | locks, puzzles, doors | Twin Locks: two locked doors stand between you and Luna. |
| `weekly-heist-04-counting-house-1600x900.png` | 1014 KB | money, treasure, vaults | The Counting House: Kibble Corp's money room. Find the key, free Pumpkin. |
| `weekly-heist-05-watchtower-yard-1600x900.png` | 1153 KB | time, rhythm, clockwork | Watchtower Yard: The Clockwork Dogs. Four dogs on the clock. Free Juniper. |
| `weekly-heist-06-conveyor-halls-1600x900.png` | 720 KB | machines, factories, motion | Conveyor Halls: a kibble factory floor. Free Waffles. (Uses the crate close-up, because the overview of this level shows mostly wall tops.) |
| `weekly-heist-07-split-shift-1600x900.png` | 895 KB | co-op, two sides, mirrors | Split Shift: Two Wings, One Rescue. Five dogs, two wings. Free Nimbus. |

heist-01 went to Challenge 2 on Sep 30, so it has no new image.

## Sources

`src/renders/h8-*.png` (GLB renders, 1920x1080), `src/renders/heist-06-crate.png`, and
`src/renders/game-h08-vault-rescue.jpg` (frame 60 of `catnip-heist/promo/reel30/assets/clips/h08-vault-rescue/`).
The weekly art is `catnip-heist/export/anitya/previews/*.png`. Fonts, colours and the Token Tails lockup come from `../_shared/`.
There are no sponsor or organiser logos.
