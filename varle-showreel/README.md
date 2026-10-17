# Varle — "Nyt tag uden overraskelser"

15-second motion piece for [varle.dk](https://varle.dk) (Tømrermester Daniel Varle ApS, roofing specialists).
1920×1080, 60 fps, 8-sample motion blur, original procedural score.

## Deliverables

- `varle_showreel_1080p60.mp4`: the film (H.264, 1920×1080, 60 fps, AAC, −14 LUFS)
- `styleframes/`: six hero stills plus a grid, for a portfolio page
- `poster.jpg`: thumbnail frame

## Concept

One continuous camera move around a single house, structured around the company's own
four-step process from the site — **Besigtigelse → Tilbud → Udførelse → Aflevering** — and their promise
*"fra første beregning til færdigt tag"* (from the first calculation to the finished roof).

| Time | Beat |
| --- | --- |
| 0.0–1.5 | A chalk line snaps. The gable is drawn as a blueprint with a 30° pitch and an 8,0 m width. |
| 1.5–3.0 | Dolly zoom (5° → 36° FOV) unfolds the flat drawing into 3D. A section scan sweeps through the house. |
| 3.0–4.5 | **Tilbud**: the roof area is calculated live (12,0 × 8,0 ÷ cos 30° = 110,9 m²), then the *Fast pris* stamp lands. |
| 4.5–7.5 | **Udførelse**: battens, then 528 tiles laid eave to ridge. Flip waves switch the roof between eternit, tegl and beton. |
| 7.5–11.0 | **Aflevering**: dusk, the windows light up. *"Nyt tag uden overraskelser."* The word "overraskelser" (surprises) arrives in chaos and snaps into line as the spirit level settles. |
| 11.0–12.35 | The camera rewinds to the blueprint, the house folds into the chalk line and the line closes to a point. |
| 12.35–15.0 | The point becomes the DV badge, followed by the lockup, contact details and CTA. |

Brand tokens come from the live site: navy `#0a203d` / `#061223`, teal `#0f766d`, paper `#f6f6f4`, Inter.

## How it's made

Everything is code. Nothing is keyframed in an app and there's no stock footage.

- `film.js` is a deterministic canvas renderer: every frame is a pure function of `t`. It includes a small
  3D engine (camera, projection, near-plane clipping, painter's sort, Lambert + specular shading), a
  tile system with lay-in and flip states, per-glyph kinetic type with kerning preserved, and
  keyframe tracks smoothed by a Gaussian kernel so camera moves have no velocity kinks.
- Motion blur accumulates 8 sub-frames across a 180° shutter. Bloom and vignette apply only to the
  world layer, so typography stays crisp.
- `tools/audio.py` synthesises the score and sound design in numpy (kick, FM bells, Karplus-Strong
  string for the chalk-line twang, per-tile clacks, risers) on the same timeline: 120 BPM,
  D minor resolving to F major on the logo. It's mastered to −14 LUFS / −1 dBTP.

## Build

```bash
open index.html                       # live preview in a browser (loops)
tools/build.sh /tmp/varle out.mp4     # render 900 frames (4 workers), score, mux
node tools/preview.js /tmp/pv 1 3.6 10.2   # stills at given seconds
```

Requires Node with Playwright (Chromium), Python 3 with numpy + scipy, and ffmpeg.
