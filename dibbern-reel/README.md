# Dibbern Color Design — 15-second motion reel

A brand spot for [dibberndesign.dk](https://www.dibberndesign.dk/), a spray-lacquering workshop in Rødovre. The workshop's pitch is simple: *give your home new life* by lacquering what you already own, in exactly the colour you want.

**Output:** `dibbern-reel.mp4`, 1920×1080, 60 fps, H.264 + AAC, 15.0 s.

The design system is taken from the live site: forest `#1E4D2B`, ink `#15270C`, signal yellow `#FFE014`, sage `#5B7150` and cream `#F7FAF5`. Type is **Source Serif 4** (the site's heading face) and **Inter**. All copy is in Danish and taken from the site's own positioning.

## Shot list

| Time | Beat | Technique |
|---|---|---|
| 0.0–2.0 | **"Giv dit hjem — nyt liv."** An airbrush pass fills a dashed stencil of the words with yellow lacquer. A gloss sheen sweeps the wet paint. | 6,500-particle spray sim, stencil compositing, overspray that settles and fades |
| 1.6–2.0 | The camera plunges into the full stop until it fills the frame with yellow. | Exponential zoom on a match cut, used as the transition |
| 2.0–4.6 | **"Vi sprøjtelakerer køkkener. skuffer. stole. låger. borde. alt."** A slot-machine word roll runs in sync with real project photos in an arch frame. Each photo arrives grey ("before") and a spray-edged wipe brings it to colour ("after"). | Iris reveal into the arch, two-stage masked wipes, Ken Burns push-in, rotating text badge |
| 4.6–5.5 | 13 RAL-coloured stripes flip in across the frame, then gather into a colour fan deck on a rivet. | Card-flip riffle, rect-to-card morph |
| 5.5–7.3 | **"Du vælger farven."** The fan springs open and one card lifts out. | Staggered damped springs around a pivot |
| 7.3–8.0 | The chosen card rotates upright and expands into the next scene's background. | Shape-to-fullscreen transition |
| 8.0–10.4 | **Proof grid:** 40+ years (odometer), 4.9 on Trustpilot (the fifth star fills to 90%), replies within 24 hours (clock), fixed price (check-mark draw-on). | Bento layout with spring entrances; each panel exits in a different direction |
| 10.4–11.9 | **"Dibbern er Superliga."** (a real review). The words punch in, the letters cascade, and a spray-paint brush stroke draws the underline. | Kinetic type |
| 11.6–12.0 | The full stop of the quote is tossed along an arc as a drop of lacquer. | Squash and stretch along the velocity vector |
| 12.0–15.0 | The drop hits: ripples, a splash and an impact shake, then the yellow disc blooms into the Dibbern logo. End card: **"Gamle møbler. Nyt liv."** with a call to action. | Spring bloom, gloss sheens, a nudging arrow on the CTA |

The opener's full stop and the quote's full stop bookend the film. The first plunges you in; the second becomes the logo.

## Craft notes

- **Deterministic renderer.** The whole film is a single pure function `render(t)` drawn on a canvas. Any frame can be rendered in any order, which is what makes parallel rendering and supersampling possible.
- **True motion blur.** Each output frame averages 6 sub-frames across a 180° shutter. The count rises to as many as 24 during the fastest moves, so blur stays continuous instead of stepping.
- **Finishing.** Every frame gets per-frame film grain and a soft vignette.
- **Original score and sound design** (`audio.py`, numpy + scipy). Everything is synthesized at 120 BPM, D minor resolving to F major. Every cue is placed on the same timestamp as its visual: the airbrush hiss, the card-deck riffle (each fan card is tuned to a note of the F-major pentatonic scale), the odometer ticks on every integer crossing, the star chimes, and the lacquer-drop "bloop" into the logo.

## Rebuild

Requirements: Node 18+ with Playwright and Chromium, ffmpeg, and Python 3 with numpy and scipy.

```bash
./build.sh            # renders 4 chunks in parallel, synthesizes audio, muxes dibbern-reel.mp4
node render.js stills out/ 0.9 3.2 6.3 14.9   # individual frames for review
```

Preview in a browser: serve this folder and open `index.html?t=6.3`.

The photos and logo in `assets/` belong to Dibbern Color Design. They were pulled from their public website for this piece.
