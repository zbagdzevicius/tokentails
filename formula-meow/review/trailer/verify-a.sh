#!/bin/sh
# Group A check: 3 frames per clip (cut in + 3, the anchor frame, cut out - 3) tiled into build/check/<id>-<aspect>.jpg
set -e
cd "$(dirname "$0")/build"
mkdir -p check
for j in footage/A/*.json; do
  b=$(basename "$j" .json)
  read cin anc cout <<X
$(node -e "const m=require('./$j');console.log(m.cutIn+3, m.anchorFrame, m.cutOut-3)")
X
  case "$b" in *9x16) tile=3x1; sc=360:-1;; *) tile=1x3; sc=640:-1;; esac
  ffmpeg -v error -y -i "footage/A/$b.mp4" -vf "select='eq(n\,$cin)+eq(n\,$anc)+eq(n\,$cout)',scale=$sc,tile=$tile" -frames:v 1 "check/$b.jpg"
  echo "$b: $(ffprobe -v error -select_streams v -show_entries stream=width,height,r_frame_rate,nb_frames -of csv=p=0 footage/A/$b.mp4)"
done
