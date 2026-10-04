#!/bin/sh
# Rebuilds every image in funding/submission-images/anitya/ from src/. Run from anywhere.
# Source renders: src/renders/*.png come from the exported GLBs via src/glbshots.mjs (jobs1/jobs2.json);
# weekly thumbnails use catnip-heist/export/anitya/previews/*.png directly.
set -e
cd "$(dirname "$0")/.."
R="node ../_shared/render.mjs"
enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; }
P=../../../../catnip-heist/export/anitya/previews

# Main jam: heist-08 "Catnip Heist: Shelter Break-in"
$R "src/cover.html?art=renders/h8-crate3.png&pos=60%25%2040%25&kicker=$(enc 'Anitya World Jam')&title=$(enc 'Catnip Heist')&gold=$(enc 'Shelter Break-in')&sub=$(enc 'Free Clover from Kibble Corp HQ')&u=13" main-itch-cover-630x500.png 630 500
$R "src/cover.html?art=renders/h8-low.png&zoom=1.22&origin=55%25%2088%25&kicker=$(enc 'Anitya World Jam')&title=$(enc 'Catnip Heist:')&gold=$(enc 'Shelter Break-in')&sub=$(enc 'A kibble fortress that locks up shelter cats. Find the key, free Clover.')&u=17" main-world-thumb-1600x900.png 1600 900
$R "src/cover.html?art=renders/h8-crate2.png&pos=45%25%2050%25&title=$(enc 'Catnip')&gold=$(enc 'Heist')&u=30&brand=0" catnip-heist-square-1024.png 1024 1024
$R src/map.html main-shot-1-map-1920x1080.jpg 1920 1080 --quality 88
$R "src/shot.html?art=renders/h8-crate2.png&cap=$(enc "Clover's crate, at the heart of HQ")&note=$(enc 'The shelter cat you came for waits inside the vault room.')&markpos=right" main-shot-2-crate-1920x1080.jpg 1920 1080 --quality 88
$R "src/shot.html?art=renders/h8-low.png&zoom=1.15&origin=55%25%2090%25&cap=$(enc 'Kibble Corp HQ')&note=$(enc 'A corporate kibble fortress where guard dogs keep shelter cats behind a vault door.')" main-shot-3-hq-1920x1080.jpg 1920 1080 --quality 88
$R "src/shot.html?art=renders/h8-b.png&zoom=1.08&cap=$(enc 'The far side: key office and split wing')&note=$(enc 'Every room is open to walk, voxel pixel art all the way through.')" main-shot-4-wing-1920x1080.jpg 1920 1080 --quality 88
$R "src/shot.html?art=renders/game-h08-vault-rescue.jpg&cap=$(enc 'Where it comes from: Catnip Heist')&note=$(enc 'The same level in our browser stealth game, with guard-dog vision cones. tokentails.com/heist')&tag=$(enc 'Source game, not the Anitya world')" main-shot-5-source-game-1920x1080.jpg 1920 1080 --quality 88

# Weeklies: one titled thumbnail per spare world (heist-01 went to Challenge 2 on Sep 30)
wk() { # file title gold sub [art]
  $R "src/cover.html?art=${5:-$P/$1.png}&shift=${6:--12}&zoom=1.08&kicker=$(enc 'Anitya Weekly Challenge')&title=$(enc "$2")&gold=$(enc "$3")&sub=$(enc "$4")&u=17" "weekly-$1-1600x900.png" 1600 900
}
wk heist-02-kennel-row "Catnip Heist" "Kennel Row" "Two guard dogs, one crate. Bring Biscuit home."
wk heist-03-twin-locks "Catnip Heist" "Twin Locks" "Two locked doors stand between you and Luna."
wk heist-04-counting-house "Catnip Heist" "The Counting House" "Kibble Corp's money room. Find the key, free Pumpkin."
wk heist-05-watchtower-yard "Watchtower Yard:" "The Clockwork Dogs" "Four dogs on the clock. Free Juniper."
wk heist-06-conveyor-halls "Catnip Heist" "Conveyor Halls" "A kibble factory floor. Free Waffles." renders/heist-06-crate.png 0
wk heist-07-split-shift "Split Shift:" "Two Wings, One Rescue" "Five dogs, two wings. Free Nimbus."
ls -la *.png *.jpg
