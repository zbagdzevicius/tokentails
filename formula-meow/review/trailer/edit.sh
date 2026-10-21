#!/usr/bin/env bash
# Formula Meow 30 s trailer: assemble both cuts from the captured footage, the card overlay and the mastered mix.
#
#   bash review/trailer/edit.sh [16x9|9x16 ...]       (from formula-meow/; default: both cuts)
#   SKIP_CARDS=1 bash review/trailer/edit.sh           reuse build/cards/ (else edit/render-cards.mjs runs first)
#
# Inputs (gitignored, made by capture.mjs and audio.mjs):
#   build/footage/{A,B}/<shot>-<aspect>.mp4   60 fps CFR takes, cut windows as in STORYBOARD.md section 2
#   build/audio/mix.wav                       30.000 s, 48 kHz, mastered to about -14 LUFS / -2 dBTP
# Outputs (gitignored):
#   out/formula-meow-trailer-<aspect>.mp4     1800 frames, 60 fps, H.264 High + AAC 320k (aac_at; ~240k with the native aac encoder)
#   out/poster-<aspect>.png                   1080x1080 poster frame with the title lockup
#   out/contact-<aspect>.png                  one frame a second (t = 0.5, 1.5 ... 29.5 s)
#   build/edit/report-<aspect>.txt            ffprobe + loudness of the finished file
#
# The edit decision list (EDL) below is the whole cut. Every cut is on the 144 BPM grid (25 frames a beat) from
# build/audio/cues.json. Effects per shot:
#   p<N>   zoom punch at local frame N (1.08 -> 1.00 over 6 frames)
#   wl/wr  whip in: the frame arrives panned from the left/right with a horizontal smear over 5 frames
#   fly    flyover grade (+4 % saturation)
#   ui     the editor shot: no grade; 16:9 is cropped in 1.5x on the doodle canvas and the tab row (header dropped)
#   sel23  S23 retime: the stroke (take f0-59) at 2x, then the Stickers tab and the Loop drop (take f61-105) at 1x = 75 frames
#   sel34  S34 retime: take f12-51 at 1x (karts over the koi pond, the game's 0.3x), f52-159 at 1.8x, landing at
#          take f160 = local f100 (cut f1500), then 1x to f184 = 125 frames
#   podium9 9:16 only: 1.3x crop on the podium (the plinths sit at ~55-68 % height in the take)
#   end    end-card background: heavy blur and darkened (the card itself is in edit/cards.html)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
FPS=60
TOTAL=1800

# shot  group  src-start(16x9)  src-start(9x16)  frames  dest-frame  fx
EDL=$(cat <<'EOF'
S01  A  98  98  100     0  -
S02  A  60  60   50   100  p0
S03  A  60  60   50   150  -
S04  A  60  60   50   200  p0
S05  A  60  60   50   250  p0
S06  A  60  33   50   300  p0
S07c A  60  60   50   350  p0
S08  B  72  72   25   400  wr,fly
S09  B 150 150   25   425  wl,fly
S10  B  60  60   25   450  wr,fly
S11  B  90  90   25   475  wl,fly
S12  B  72  72   25   500  wr,fly
S13  B 125 125   25   525  wl,fly
S14  B  60  60   50   550  p0
S15  B  60  60   50   600  p0
S16  B  60  60   50   650  p0
S17  B  60  60   25   700  wr
S18  B  60  60   25   725  wl
S19  A  60  60   50   750  wr
S20  B   9 145   50   800  p0,podium9
S21  B  60  60   50   850  p0
S22  B  35  35  100   900  p0,p65
S23  B   0   0   75  1000  ui,sel23
S24  B  60  60   75  1075  p0
S25  B 134 133   50  1150  p0
S26  A  60  60   25  1200  p0
S27  A  60  60   25  1225  wr
S28  A  60  60   25  1250  wl
S29  A  60  60   25  1275  wr
S30  A  60  60   25  1300  p0
S31  A  60  60   25  1325  wl
S32  A  60  60   25  1350  wr
S33  A  60  60   25  1375  wl
S34  A   0   0  125  1400  wr,sel34,p100
S35  A  60  60   75  1525  p0
S36  B  30  30  200  1600  end
EOF
)

ASPECTS=("$@"); [ ${#ASPECTS[@]} -eq 0 ] && ASPECTS=(16x9 9x16)
mkdir -p build/edit out

# ---------------------------------------------------------------- 0. checks: grid, total length, copy
echo "$EDL" | awk -v total=$TOTAL '
  { if ($6 != next_dest) { printf "EDL gap/overlap at %s: dest %d, expected %d\n", $1, $6, next_dest; bad=1 }
    if ($6 % 25 != 0) { printf "EDL cut off the beat grid at %s (f%d)\n", $1, $6; bad=1 }
    next_dest = $6 + $5 }
  END { if (next_dest != total) { printf "EDL length %d, expected %d\n", next_dest, total; bad=1 } exit bad }'

if [ "${SKIP_CARDS:-0}" != 1 ]; then
  (cd "$HERE/../.." && node review/trailer/edit/render-cards.mjs "${ASPECTS[@]}" poster)
fi
# banned words in the on-screen copy (STORYBOARD.md section 10)
node -e '
  const copy = require(process.argv[1]).join(" | ");
  const bad = [/\bfree\b/i, /\bnow\b/i, /download/i, /\bstore\b/i, /players?/i, /million/i, /award/i, /#1/, /prize/i,
    /hackathon/i, /win money/i, /\bArc\b/, /USDC/i, /donat/i, /%/, /\$/, /http/i, /—/];
  const hits = bad.filter(r => r.test(copy));
  if (hits.length) { console.error("banned copy:", hits.map(String).join(" ")); process.exit(1); }
  console.log("copy ok:", copy);
' "$HERE/build/cards/copy.json"

# ---------------------------------------------------------------- 1. per-shot segments
seg_filter() { # aspect W H fx frames start -> prints the -vf chain
  local aspect=$1 W=$2 H=$3 fx=$4 n=$5 start=$6
  local f="trim=start_frame=${start}:end_frame=$((start + n)),setpts=PTS-STARTPTS"
  case ",$fx," in
    *,sel23,*) f="select='lt(n,60)*not(mod(n,2))+between(n,61,105)',setpts=N/($FPS*TB)" ;;
    *,sel34,*) f="select='between(n,12,51)+between(n,52,159)*gt(floor((n-51)*5/9),floor((n-52)*5/9))+between(n,160,184)',setpts=N/($FPS*TB)" ;;
  esac
  case ",$fx," in *,podium9,*) [ "$aspect" = 9x16 ] && f="$f,crop=831:1477:124:264,scale=${W}:${H}:flags=lanczos" ;; esac
  local Z="1" X="(iw-iw/zoom)/2" blur=""
  IFS=',' read -ra FX <<< "$fx"
  for e in "${FX[@]}"; do
    case "$e" in
      p[0-9]*) local p=${e#p}
          Z="$Z+if(between(in,$p,$((p + 5))),0.08*pow(1-(in-$p)/6,2),0)" ;;
      wl|wr) local d=1; [ "$e" = wl ] && d=-1
          Z="$Z+if(lt(in,5),0.10*pow(1-in/5,2),0)"
          X="(iw-iw/zoom)/2*(1+($d)*if(lt(in,5),1-in/5,0))"
          blur=",avgblur=sizeX=56:sizeY=1:enable='lt(n,2)',avgblur=sizeX=24:sizeY=1:enable='eq(n,2)',avgblur=sizeX=9:sizeY=1:enable='eq(n,3)'" ;;
    esac
  done
  case ",$fx," in
    *,ui,*) [ "$aspect" = 16x9 ] && f="$f,crop=1280:720:320:125,scale=${W}:${H}:flags=lanczos" ;;
    *,end,*) f="$f,gblur=sigma=18,eq=brightness=-0.16:saturation=1.15" ;;
    *,fly,*) f="$f,eq=contrast=1.06:saturation=1.12" ;;
    *) f="$f,eq=contrast=1.06:saturation=1.08" ;;
  esac
  case ",$fx," in *,ui,*|*,end,*) ;; *) f="$f,lutyuv=y='clip(16+(val-20.4)*219/214.6,16,235)'" ;; esac
  if [ "$Z" != "1" ]; then
    f="$f,zoompan=z='$Z':x='$X':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=$FPS$blur"
  fi
  echo "$f,format=yuv420p"
}

for aspect in "${ASPECTS[@]}"; do
  if [ "$aspect" = 16x9 ]; then W=1920; H=1080; else W=1080; H=1920; fi
  SEG="build/edit/seg-$aspect"
  if [ "${SKIP_SEGS:-0}" != 1 ]; then
  rm -rf "$SEG"; mkdir -p "$SEG"
  : > "$SEG/list.txt"
  i=0
  while read -r shot grp s16 s9 n dest fx; do
    [ -z "$shot" ] && continue
    start=$s16; [ "$aspect" = 9x16 ] && start=$s9
    src="build/footage/$grp/$shot-$aspect.mp4"
    [ -f "$src" ] || { echo "missing $src"; exit 1; }
    out="$SEG/$(printf %02d $i)-$shot.mp4"
    vf=$(seg_filter "$aspect" $W $H "$fx" "$n" "$start")
    ffmpeg -nostdin -v error -y -i "$src" -vf "$vf" -frames:v "$n" -r $FPS -an \
      -c:v libx264 -preset veryfast -crf 8 -pix_fmt yuv420p \
      -colorspace bt709 -color_primaries bt709 -color_trc bt709 "$out"
    got=$(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 "$out")
    [ "$got" = "$n" ] || { echo "$out: $got frames, expected $n"; exit 1; }
    echo "file '$(basename "$out")'" >> "$SEG/list.txt"
    i=$((i + 1))
  done <<< "$EDL"
  echo "$aspect: $i segments"

  # -------------------------------------------------------------- 2. picture: concat + overlay layer
  ffmpeg -v error -y -f concat -safe 0 -i "$SEG/list.txt" -c copy "build/edit/picture-$aspect.mp4"
  fi

  OUT="out/formula-meow-trailer-$aspect.mp4"
  # AAC: Apple AudioToolbox (aac_at, reaches 320k) when this ffmpeg has it, else ffmpeg's native aac (tops out ~240k)
  if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q ' aac_at '; then ACODEC="-c:a aac_at -b:a 320k"; else ACODEC="-c:a aac -b:a 320k"; fi
  ffmpeg -v error -y \
    -i "build/edit/picture-$aspect.mp4" \
    -framerate $FPS -start_number 0 -reinit_filter 0 -i "build/cards/$aspect/f%04d.png" \
    -i build/audio/mix.wav \
    -filter_complex "[0:v]setpts=N/(60*TB)[pv];[1:v]setpts=N/(60*TB),format=rgba,scale=${W}:${H}:out_color_matrix=bt709:out_range=tv,format=yuva420p[c];[pv][c]overlay=format=yuv420:eof_action=pass,format=yuv420p,setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv[v];[2:a]aformat=sample_rates=48000:channel_layouts=stereo[a]" \
    -map "[v]" -map "[a]" -frames:v $TOTAL -t 30 -fps_mode cfr -r $FPS \
    -c:v libx264 -preset slow -crf 16 -profile:v high -pix_fmt yuv420p -g 120 -keyint_min 25 \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    $ACODEC -ar 48000 -ac 2 \
    -movflags +faststart "$OUT"

  # -------------------------------------------------------------- 3. poster (1080x1080) + contact sheet
  # POSTER_<aspect> = frame of the cut (default f385: the pack climbing the Shelter exercise wheel) to use (picture without cards) and the x/y crop offset
  if [ "$aspect" = 16x9 ]; then PF=${POSTER_16x9:-385}; CROP="crop=1080:1080:${POSTER_X:-400}:0"; else PF=${POSTER_9x16:-385}; CROP="crop=1080:1080:0:${POSTER_Y:-380}"; fi
  ffmpeg -v error -y -i "build/edit/picture-$aspect.mp4" -i "build/cards/poster-$aspect.png" \
    -filter_complex "[0:v]select='eq(n,$PF)',$CROP,format=rgb24[p];[p][1:v]overlay=format=auto,format=rgb24" \
    -frames:v 1 "out/poster-$aspect.png"
  if [ "$aspect" = 16x9 ]; then T=480:270; else T=216:384; fi
  ffmpeg -v error -y -i "$OUT" -vf "select='eq(mod(n-30,60),0)',scale=$T,drawtext=text='%{eif\:(n*60+30)/60\:d}s':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=6x5:padding=4" \
    -frames:v 1 "out/contact-$aspect.png" 2>/dev/null || \
  ffmpeg -v error -y -i "$OUT" -vf "select='eq(mod(n-30,60),0)',scale=$T,tile=6x5:padding=4" -frames:v 1 "out/contact-$aspect.png"

  # -------------------------------------------------------------- 4. report
  {
    echo "== $OUT"
    ffprobe -v error -show_entries format=duration,bit_rate -show_entries stream=codec_name,profile,width,height,r_frame_rate,avg_frame_rate,nb_frames,pix_fmt,color_space,sample_rate,channels,duration -of default=nw=1 "$OUT"
    echo "== loudness"
    ffmpeg -nostats -hide_banner -i "$OUT" -map 0:a -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary:/,$p'
  } > "build/edit/report-$aspect.txt"
  cat "build/edit/report-$aspect.txt"
done
