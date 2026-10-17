#!/usr/bin/env bash
# Full build: frames -> score -> mastered mp4.  usage: tools/build.sh <workdir> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${1:?workdir}; OUT=${2:?out.mp4}
mkdir -p "$WORK"
node tools/render.js "$WORK/frames" 4 8 0 900 png
python3 tools/audio.py "$WORK/score.wav"
# two-pass loudness normalisation to -14 LUFS / -1 dBTP
STATS=$(ffmpeg -hide_banner -i "$WORK/score.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$STATS" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -loglevel error -i "$WORK/score.wav" -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000" -c:a pcm_s16le "$WORK/score_master.wav"
ffmpeg -y -loglevel error -framerate 60 -i "$WORK/frames/f%04d.png" -i "$WORK/score_master.wav" \
  -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -profile:v high \
  -vf "scale=out_color_matrix=bt709:out_range=tv" -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 256k -shortest -movflags +faststart "$OUT"
echo "built $OUT"
