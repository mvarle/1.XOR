#!/usr/bin/env bash
# Render the reel in parallel chunks, synthesize the soundtrack, and mux the final MP4.
#   ./build.sh [workdir]
set -euo pipefail
cd "$(dirname "$0")"
WORK=${1:-build}
mkdir -p "$WORK"
export NODE_PATH=${NODE_PATH:-/opt/node22/lib/node_modules}
# chunk boundaries (frames @60fps) balanced for the heavier particle scene up front
B=(0 100 345 620 900)
pids=()
for i in 0 1 2 3; do
  FROM=${B[$i]} TO=${B[$((i+1))]} LOSSLESS=1 node render.js video "$WORK/chunk$i.mkv" > "$WORK/chunk$i.log" 2>&1 &
  pids+=($!)
done
python3 audio.py "$WORK/soundtrack.wav"
for p in "${pids[@]}"; do wait "$p"; done
printf "file 'chunk%d.mkv'\n" 0 1 2 3 > "$WORK/chunks.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/chunks.txt" -i "$WORK/soundtrack.wav" \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 320k -movflags +faststart -shortest dibbern-reel.mp4
echo "wrote $(pwd)/dibbern-reel.mp4"
