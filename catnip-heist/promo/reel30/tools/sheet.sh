#!/bin/bash
# usage: sheet.sh out.jpg clip/frame ... (up to 9, 3 cols, 640x360 tiles)
out=$1; shift; C=/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/promo/reel30/assets/clips
args=(); f=""; i=0; lay=""
for s in "$@"; do args+=(-i "$C/$s"); f+="[$i]scale=640:360,drawtext=text='$s':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6[v$i];"; x=$(( (i%3)*640 )); y=$(( (i/3)*360 )); lay+="${x}_${y}|"; i=$((i+1)); done
ins=""; for ((k=0;k<i;k++)); do ins+="[v$k]"; done
/opt/homebrew/bin/ffmpeg -loglevel error -y "${args[@]}" -filter_complex "${f}${ins}xstack=inputs=$i:layout=${lay%|}:fill=black" -frames:v 1 "$out"
