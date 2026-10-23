#!/usr/bin/env bash
# Contact sheet of a take: bash tools/trailer/sheet.sh <file.mp4> [every-n-frames=10] [cols=6] -> <file>.sheet.jpg
set -euo pipefail
f=$1; n=${2:-10}; cols=${3:-6}
w=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "$f")
if [ "${w%,*}" -gt "${w#*,}" ]; then s=480:270; else s=216:384; fi
cnt=$(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 "$f")
rows=$(( (cnt / n + cols) / cols ))
ffmpeg -v error -y -i "$f" -vf "select='not(mod(n,$n))',scale=$s,drawtext=text='%{n}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${rows}:padding=3" -frames:v 1 -update 1 "${f%.mp4}.sheet.jpg" 2>/dev/null || \
ffmpeg -v error -y -i "$f" -vf "select='not(mod(n,$n))',scale=$s,tile=${cols}x${rows}:padding=3" -frames:v 1 -update 1 "${f%.mp4}.sheet.jpg"
echo "${f%.mp4}.sheet.jpg"
