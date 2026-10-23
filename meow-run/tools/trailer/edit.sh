#!/usr/bin/env bash
# Meow Run trailer edit: text cards -> soundtrack -> cuts, loop and stills (see STORYBOARD.md).
#   bash tools/trailer/edit.sh [trailer|mode|loop|stills ...]   from meow-run/ (default: everything)
#   SKIP_CARDS=1 bash tools/trailer/edit.sh                       reuse build/cards/
# Needs the footage from `node tools/trailer/capture.mjs`.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../.."
CUTS=()
for a in "$@"; do case "$a" in trailer|mode) CUTS+=("$a") ;; esac; done
[ $# -eq 0 ] && CUTS=(trailer mode)
if [ ${#CUTS[@]} -gt 0 ]; then
  [ "${SKIP_CARDS:-0}" = 1 ] || node tools/trailer/render-cards.mjs "${CUTS[@]}"
  node tools/trailer/audio.mjs "${CUTS[@]}"
fi
node tools/trailer/edit.mjs "$@"
for f in ../client/public/home/media/meowrun-*.mp4; do
  printf '%s  %s  %ss  %s\n' "$(basename "$f")" "$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=s=x:p=0 "$f")" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")" "$(du -h "$f" | cut -f1)"
done
