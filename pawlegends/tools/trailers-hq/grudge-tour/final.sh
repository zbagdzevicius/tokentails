#!/bin/zsh
# Final renders: per cut, the audio master, then each aspect's picture (one encode from the takes), muxed.
set -e
G=${GT_DIR:?set GT_DIR to the Grudge Tour work dir}
OUT=~/Downloads/paw-legends/trailers-hq/grudge-tour
FF=/opt/homebrew/bin/ffmpeg
mkdir -p $OUT $G/edit/final
cd $G/tools
node dump-plan.mjs ../edit/plan.json
for cut in ${=CUTS:-30 60}; do
  uv run -q --with numpy python -I mix.py ../edit/plan.json $cut ../edit/final/audio-$cut.wav
  for a in ${=ASPECTS:-h v s}; do
    if [ $a = h ]; then P=$([ $cut = 30 ] && echo '[40,1100,1560,1720]' || echo '[40,2500,3200,3500]'); else P=$([ $cut = 30 ] && echo '[1720]' || echo '[3500]'); fi
    POSTERS=$P uv run -q --with numpy --with pillow python -I edit.py ../edit/plan.json $cut $a ../edit/final
  done
  for v in ../edit/final/grudge-tour-${cut}s-*.video.mp4; do
    o=$OUT/$(basename $v .video.mp4).mp4
    br=320k; [[ $v == *-web* ]] && br=192k
    $FF -y -loglevel error -threads 4 -i $v -i ../edit/final/audio-$cut.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a $br -ar 48000 -shortest -movflags +faststart $o
    rm -f $v
    echo "wrote $o"
  done
  for p in ../edit/final/grudge-tour-${cut}s-*.poster-f*.jpg; do mv $p $OUT/$(basename $p | sed 's/\.poster-f/-poster-f/'); done
  cp $OUT/grudge-tour-${cut}s-16x9-poster-f$([ $cut = 30 ] && echo 1720 || echo 3500).jpg $OUT/grudge-tour-${cut}s-poster.jpg
done
