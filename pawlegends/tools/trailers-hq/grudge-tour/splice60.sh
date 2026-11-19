#!/bin/zsh
# Re-render the 60 s button (frames 3360-3599, the logo moved off the minimap) and splice it onto the first 56 s of
# each finished 60 s file at its keyframe (stream copy, no re-encode of the rest); the audio stream is copied as is.
set -e
G=${GT_DIR:?set GT_DIR to the Grudge Tour work dir}
OUT=~/Downloads/paw-legends/trailers-hq/grudge-tour
FF=/opt/homebrew/bin/ffmpeg
S=$G/edit/splice
mkdir -p $S
cd $G/tools
for a in h v s; do
  [ -f $S/done-$a ] || { uv run -q --with numpy --with pillow python -I edit.py ../edit/plan.json 60 $a $S --from 3360 && touch $S/done-$a; }
done
for tag in 16x9 9x16 1x1 web; do
  src=$OUT/grudge-tour-60s-$tag.mp4
  $FF -y -loglevel error -i $src -frames:v 3360 -map 0:v:0 -c copy $S/head-$tag.mp4
  printf "file '%s'\nfile '%s'\n" $S/head-$tag.mp4 $S/grudge-tour-60s-$tag.video.mp4 > $S/list-$tag.txt
  $FF -y -loglevel error -f concat -safe 0 -i $S/list-$tag.txt -c copy $S/v-$tag.mp4
  $FF -y -loglevel error -i $S/v-$tag.mp4 -i $src -map 0:v:0 -map 1:a:0 -c copy -movflags +faststart $S/out-$tag.mp4
  n=$(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 $S/out-$tag.mp4)
  [ "$n" = 3600 ] || { echo "bad frame count $n for $tag"; exit 1; }
  mv $S/out-$tag.mp4 $src
  echo "spliced $src ($n frames)"
done
rm -rf $S
