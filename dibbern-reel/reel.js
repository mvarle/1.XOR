'use strict';
// Dibbern Color Design — 15s motion reel.
// Everything is a pure function of time t (seconds), so any frame can be
// rendered in any order and supersampled for true motion blur.

const W = 1920, H = 1080, DUR = 15;
const COL = {
  ink: '#15270C', forest: '#1E4D2B', sage: '#5B7150', yellow: '#FFE014',
  logo: '#FCDE1C', cream: '#F7FAF5', sand: '#DAC2B1',
};
const SERIF = 'SS4', SANS = 'Inter';

// ───────────────────────────── math ─────────────────────────────
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  outQuad: x => 1 - (1 - x) * (1 - x),
  inQuad: x => x * x,
  inOutQuad: x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: x => x * x * x,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inQuart: x => x * x * x * x,
  outQuart: x => 1 - Math.pow(1 - x, 4),
  inOutQuart: x => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outQuint: x => 1 - Math.pow(1 - x, 5),
  outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
};
// Damped spring step response, 0 → 1 with overshoot.
function spring(t, f = 2, z = 0.5) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}
function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const [r, g, b] = hexRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
function mk(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; }
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const DEG = Math.PI / 180;

// ───────────────────────────── text helpers ─────────────────────────────
function font(c, f) { c.font = f; }
function sizeOf(f) { return parseFloat(f.match(/([\d.]+)px/)[1]); }
// Line reveal: text slides up from behind a clipping mask. p is eased 0..1.
function revealText(c, str, x, y, f, color, p, o = {}) {
  if (p <= 0) return;
  c.save();
  c.font = f; c.fillStyle = color; c.textBaseline = 'alphabetic';
  c.letterSpacing = o.ls || '0px';
  const s = sizeOf(f), asc = s * (o.asc ?? 1.0), desc = s * (o.desc ?? 0.34);
  const w = c.measureText(str).width;
  let x0 = x;
  if (o.align === 'center') x0 = x - w / 2; else if (o.align === 'right') x0 = x - w;
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  if (p < 1) { c.beginPath(); c.rect(x0 - s, y - asc, w + 2 * s, asc + desc); c.clip(); }
  if (o.fade) c.globalAlpha *= clamp(p * 1.4);
  c.fillText(str, x0, y + (1 - p) * (asc + desc) * (o.dist ?? 1));
  c.restore();
}
function textW(c, str, f, ls = '0px') { c.save(); c.font = f; c.letterSpacing = ls; const w = c.measureText(str).width; c.restore(); return w; }
function star(c, cx, cy, R, r = R * 0.48, rotA = 0) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5 + rotA, rr = i % 2 ? r : R;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath();
}
function archPath(c, x, y, w, h) {
  const r = w / 2;
  c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + r); c.arc(x + r, y + r, r, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath();
}

// ───────────────────────────── assets ─────────────────────────────
const IMG = {};
const IMG_SRC = {
  kitchenGreen: 'assets/koekken-scaled.jpg', drawers: 'assets/dibbern-koekkenskuffer.png',
  chair: 'assets/y-stol-1.png', door: 'assets/sproejtemaling-af-laage.jpg',
  table: 'assets/stole-og-bord-med-planter.png', kitchenBlue: 'assets/1000009326.jpg', logo: 'assets/logo.png',
};
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

const [scnCv, scn] = mk(W, H);       // one sub-frame
const outCv = document.getElementById('c');
const out = outCv.getContext('2d');
const [plCv, pl] = mk(W, H);         // paint / stencil layer
const [tmpCv, tmp] = mk(W, H);       // generic layer

// ═════════════════════════ SCENE 1 — the stencil spray ═════════════════════════
const S1 = {
  big: `600 380px ${SERIF}`, base: 735, size: 380,
  t0: 0.36, t1: 1.16,           // spray pass
  zoomA: 1.58, zoomB: 1.985,    // zoom through the full stop
  parts: [],
  init(c) {
    c.font = this.big;
    const wt = c.measureText('nyt liv').width, wd = c.measureText('nyt liv.').width;
    const adv = wd - wt;
    this.wt = wt; this.x0 = (W - wd) / 2 + adv * 0.2;
    this.dotR = this.size * 0.064;
    this.dotX = this.x0 + wt + adv * 0.42; this.dotY = this.base - this.dotR;
    this.midY = this.base - this.size * 0.31;
    this.ex0 = this.x0 - 140; this.ex1 = this.x0 + wd + 120;
    const r = mulberry32(11);
    for (let i = 0; i < 6500; i++) {
      const ts = lerp(this.t0, this.t1, Math.pow(r(), 1));
      const wide = r() < 0.18 ? 2.3 : 1;
      this.parts.push({
        ts, ft: 0.05 + 0.13 * r(),
        dx: gauss(r) * 100 * wide, dy: gauss(r) * 175 * wide,
        rad: 0.6 + 2.6 * Math.pow(r(), 3.2), b: r(),
      });
    }
  },
  sprayS(t) { return E.inOutSine(prog(t, this.t0, this.t1)); },
  emit(s) { return [lerp(this.ex0, this.ex1, s), this.midY + 34 * Math.sin(s * Math.PI * 2.4)]; },
  cam(t) {
    // slight anticipation pull-back, then exponential plunge into the full stop
    if (t < this.zoomA) return 1 - 0.035 * E.outCubic(prog(t, 1.32, this.zoomA));
    const p = E.inQuart(prog(t, this.zoomA, this.zoomB));
    return 0.965 * Math.exp(Math.log(80 / 0.965) * p);
  },
  glyphs(c, fill) {
    c.font = this.big; c.fillStyle = fill; c.textBaseline = 'alphabetic';
    c.fillText('nyt liv', this.x0, this.base);
    c.beginPath(); c.arc(this.dotX, this.dotY, this.dotR, 0, Math.PI * 2); c.fill();
  },
  draw(c, t) {
    // background — deep ink with a soft lift in the centre
    c.fillStyle = COL.ink; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H * 0.55, 50, W / 2, H * 0.55, 1100);
    g.addColorStop(0, 'rgba(46,86,40,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    const k = this.cam(t), px = this.dotX, py = this.dotY;
    const camT = cc => { cc.setTransform(k, 0, 0, k, px - k * px, py - k * py); };
    camT(c);

    // label + kicker line
    const lp = E.outQuart(prog(t, 0.05, 0.6));
    c.save(); c.font = `600 22px ${SANS}`; c.fillStyle = rgba(COL.cream, 0.62 * lp);
    c.letterSpacing = `${lerp(26, 11, lp)}px`; c.textAlign = 'center';
    c.fillText('SPRØJTELAKERING', W / 2 + lerp(13, 5.5, lp), 262); c.restore();
    const words = ['Giv', 'dit', 'hjem'];
    const f2 = `italic 400 96px ${SERIF}`;
    const full = textW(c, 'Giv dit hjem', f2), sp = textW(c, ' ', f2);
    let xx = W / 2 - full / 2;
    words.forEach((wd, i) => {
      revealText(c, wd, xx, 385, f2, COL.cream, E.outQuart(prog(t, 0.14 + i * 0.07, 0.62 + i * 0.07)));
      xx += textW(c, wd, f2) + sp;
    });

    // stencil outline, before paint arrives
    const s = this.sprayS(t), [ex, ey] = this.emit(s);
    const ol = E.outCubic(prog(t, 0.0, 0.5)) * (1 - prog(t, 1.1, 1.4));
    if (ol > 0) {
      c.save(); c.font = this.big; c.strokeStyle = rgba(COL.cream, 0.22 * ol); c.lineWidth = 1.6 / k;
      c.setLineDash([6, 7]); c.strokeText('nyt liv', this.x0, this.base);
      c.beginPath(); c.arc(px, py, this.dotR, 0, Math.PI * 2); c.stroke(); c.restore();
    }

    // overspray dust settling on the dark surface
    if (t > this.t0) {
      const NB = 10, buckets = Array.from({ length: NB }, () => new Path2D());
      for (const q of this.parts) {
        const land = q.ts + q.ft; if (land > t) continue;
        const a = 0.5 * Math.exp(-(t - land) / 0.42) * (0.4 + 0.6 * q.b) * (1 - prog(t, 1.4, 1.6));
        if (a < 0.012) continue;
        const [x0, y0] = this.emit(this.sprayS(q.ts));
        const bp = buckets[Math.min(NB - 1, Math.floor(a / 0.5 * NB))];
        bp.moveTo(x0 + q.dx + q.rad, y0 + q.dy); bp.arc(x0 + q.dx, y0 + q.dy, q.rad, 0, Math.PI * 2);
      }
      buckets.forEach((bp, i) => { c.fillStyle = rgba(COL.yellow, (i + 0.5) / NB * 0.5); c.fill(bp); });
    }

    // paint layer: wet coverage behind the nozzle + speckle, stencilled by the glyphs
    if (t > this.t0) {
      pl.setTransform(1, 0, 0, 1, 0, 0); pl.clearRect(0, 0, W, H); pl.globalCompositeOperation = 'source-over';
      camT(pl);
      const done = t >= this.t1 + 0.05;
      if (done) { pl.fillStyle = COL.yellow; pl.fillRect(-W, -H, 3 * W, 3 * H); }
      else {
        const lg = pl.createLinearGradient(ex - 300, 0, ex - 60, 0);
        lg.addColorStop(0, rgba(COL.yellow, 1)); lg.addColorStop(1, rgba(COL.yellow, 0));
        pl.fillStyle = lg; pl.fillRect(-W, -H, ex - 60 + W, 3 * H);
        // round leading front from accumulated dabs
        for (let j = 0; j < 40; j++) {
          const sj = s - j * 0.0075; if (sj < 0) break;
          const [dx, dy] = this.emit(sj);
          pl.save(); pl.translate(dx, dy); pl.scale(1, 1.85);
          const rg = pl.createRadialGradient(0, 0, 0, 0, 0, 175);
          const a = 0.16 * (1 - j / 46);
          rg.addColorStop(0, rgba(COL.yellow, a)); rg.addColorStop(0.55, rgba(COL.yellow, a * 0.8)); rg.addColorStop(1, rgba(COL.yellow, 0));
          pl.fillStyle = rg; pl.beginPath(); pl.arc(0, 0, 175, 0, Math.PI * 2); pl.fill(); pl.restore();
        }
        pl.fillStyle = COL.yellow;
        const sp = new Path2D();
        for (const q of this.parts) {
          const land = q.ts + q.ft; if (land > t) continue;
          const [x0, y0] = this.emit(this.sprayS(q.ts));
          const rr = q.rad * 1.4;
          sp.moveTo(x0 + q.dx + rr, y0 + q.dy); sp.arc(x0 + q.dx, y0 + q.dy, rr, 0, Math.PI * 2);
        }
        pl.fill(sp);
      }
      // lacquer sheen sweeping across the fresh paint
      const sh = prog(t, 1.2, 1.62);
      if (sh > 0 && sh < 1) {
        const sx = lerp(this.x0 - 300, this.x0 + this.wt + 400, E.inOutCubic(sh));
        pl.save(); pl.translate(sx, this.midY); pl.rotate(18 * DEG);
        const sg = pl.createLinearGradient(-110, 0, 110, 0);
        sg.addColorStop(0, 'rgba(255,255,240,0)'); sg.addColorStop(0.5, 'rgba(255,255,240,0.85)'); sg.addColorStop(1, 'rgba(255,255,240,0)');
        pl.fillStyle = sg; pl.fillRect(-110, -700, 220, 1400);
        pl.fillStyle = 'rgba(255,255,240,0.5)'; pl.fillRect(140, -700, 18, 1400);
        pl.restore();
      }
      // stencil: glyph mask on its own layer, composited once
      tmp.setTransform(1, 0, 0, 1, 0, 0); tmp.clearRect(0, 0, W, H); camT(tmp);
      this.glyphs(tmp, '#000'); tmp.setTransform(1, 0, 0, 1, 0, 0);
      pl.setTransform(1, 0, 0, 1, 0, 0);
      pl.globalCompositeOperation = 'destination-in'; pl.drawImage(tmpCv, 0, 0);
      pl.globalCompositeOperation = 'source-over';
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(plCv, 0, 0);
      camT(c);
    }

    // airborne droplets + nozzle glow
    if (t > this.t0 - 0.05 && t < this.t1 + 0.25) {
      const ga = E.outCubic(prog(t, this.t0 - 0.05, this.t0 + 0.08)) * (1 - prog(t, this.t1 - 0.02, this.t1 + 0.18));
      const rg = c.createRadialGradient(ex, ey, 0, ex, ey, 260);
      rg.addColorStop(0, rgba('#FFF6A8', 0.42 * ga)); rg.addColorStop(0.35, rgba(COL.yellow, 0.16 * ga)); rg.addColorStop(1, rgba(COL.yellow, 0));
      c.fillStyle = rg; c.fillRect(ex - 260, ey - 260, 520, 520);
      const NB = 4, streaks = Array.from({ length: NB }, () => new Path2D());
      for (const q of this.parts) {
        if (q.ts > t || q.ts + q.ft <= t) continue;
        const u = (t - q.ts) / q.ft, e = E.outCubic(u), eb = E.outCubic(Math.max(0, u - 0.0028 / q.ft));
        const [x0, y0] = this.emit(this.sprayS(q.ts));
        const w = q.rad * lerp(2.0, 1.1, u) * 2;
        const sp = streaks[Math.min(NB - 1, Math.floor(w / 2.2))];
        sp.moveTo(x0 + q.dx * eb, y0 + q.dy * eb); sp.lineTo(x0 + q.dx * e + 0.01, y0 + q.dy * e);
      }
      c.lineCap = 'round';
      streaks.forEach((sp, i) => { c.strokeStyle = rgba('#FFF7B0', 0.8 - i * 0.12); c.lineWidth = 1.2 + i * 1.7; c.stroke(sp); });
      c.lineCap = 'butt';
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  },
};

// ═════════════════════════ SCENE 2 — "Vi sprøjtelakerer …" ═════════════════════════
const S2 = {
  AX: 1010, AY: 92, AW: 770, AH: 896,
  items: [
    { w: 'køkkener.', img: 'kitchenGreen', fx: 0.5, fy: 0.58, t: 2.0 },
    { w: 'skuffer.', img: 'drawers', fx: 0.3, fy: 0.5, t: 2.5 },
    { w: 'stole.', img: 'chair', fx: 0.55, fy: 0.5, t: 3.0 },
    { w: 'låger.', img: 'door', fx: 0.42, fy: 0.5, t: 3.5 },
    { w: 'borde.', img: 'table', fx: 0.5, fy: 0.5, t: 3.75 },
    { w: 'alt.', img: 'kitchenBlue', fx: 0.42, fy: 0.62, t: 4.0 },
  ],
  init() {
    // pre-crop every photo to the arch aspect (with headroom for a Ken Burns push)
    const cw = Math.round(this.AW * 1.18), ch = Math.round(this.AH * 1.18);
    for (const it of this.items) {
      const im = IMG[it.img];
      const sc = Math.max(cw / im.width, ch / im.height);
      const sw = cw / sc, sh = ch / sc;
      const sx = clamp(it.fx * im.width - sw / 2, 0, im.width - sw), sy = clamp(it.fy * im.height - sh / 2, 0, im.height - sh);
      const [a, ac] = mk(cw, ch); ac.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch);
      const [g, gc] = mk(cw, ch); gc.filter = 'grayscale(1) contrast(0.85) brightness(0.82) sepia(0.25)'; gc.drawImage(a, 0, 0);
      it.col = a; it.gray = g;
    }
    [this.layCv, this.lay] = mk(this.AW, this.AH);
    [this.mskCv, this.msk] = mk(this.AW, this.AH);
    // speckle edge for spray wipes
    const r = mulberry32(5); this.edge = [];
    for (let i = 0; i < 260; i++) this.edge.push({ u: r() * 2 - 1, n: Math.abs(gauss(r)) * 34, rad: 1.5 + 6 * Math.pow(r(), 2) });
  },
  // draw photo into arch-local coords with a gentle push-in
  photo(c, src, z) {
    const cw = src.width, ch = src.height;
    const vw = cw / (1.18 * z) * 1.0, vh = ch / (1.18 * z);
    c.drawImage(src, (cw - vw) / 2, (ch - vh) / 2, vw, vh, 0, 0, this.AW, this.AH);
  },
  // spray-edged diagonal wipe of `src` over whatever is already in ctx (arch-local)
  wipe(c, src, p, z, seed) {
    if (p <= 0) return;
    if (p >= 1) { this.photo(c, src, z); return; }
    const m = this.msk, AW = this.AW, AH = this.AH;
    m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, AW, AH);
    const ang = -52 * DEG, nx = Math.cos(ang), ny = Math.sin(ang);
    // distance along the wipe normal, from bottom-left corner
    const span = Math.abs(AW * nx) + Math.abs(AH * ny) + 120;
    const d = lerp(-60, span, p);
    m.save(); m.translate(0, AH); m.rotate(ang);
    m.fillStyle = '#000'; m.fillRect(-2000, -2000, 2000 + d, 4000);
    for (const q of this.edge) {
      const yy = q.u * 1100, xx = d + q.n * (seed % 2 ? 1 : 1.2);
      m.beginPath(); m.arc(xx, yy, q.rad, 0, Math.PI * 2); m.fill();
    }
    m.restore();
    const l = this.lay; l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, AW, AH); this.photo(l, src, z);
    l.globalCompositeOperation = 'destination-in'; l.drawImage(this.mskCv, 0, 0); l.globalCompositeOperation = 'source-over';
    c.drawImage(this.layCv, 0, 0);
  },
  draw(c, t) {
    c.fillStyle = COL.yellow; c.fillRect(0, 0, W, H);
    const { AX, AY, AW, AH } = this;
    const items = this.items;
    let cur = 0; for (let i = 0; i < items.length; i++) if (t >= items[i].t) cur = i;

    // ── arch with photos ──
    const iris = spring(t - 2.03, 1.25, 0.82) * 720;
    if (iris > 1) {
      c.save();
      archPath(c, AX, AY, AW, AH); c.clip();
      c.beginPath(); c.arc(AX + AW / 2, AY + AH * 0.5, iris, 0, Math.PI * 2); c.clip();
      c.translate(AX, AY);
      c.fillStyle = COL.ink; c.fillRect(0, 0, AW, AH);
      const lo = Math.max(0, cur - 1);
      for (let i = lo; i <= cur; i++) {
        const it = items[i], u = t - it.t;
        const z = 1.0 + 0.16 * (1 - E.outCubic(prog(u, 0, 1.4)));
        if (i === 0) {
          this.photo(c, it.gray, z);
          this.wipe(c, it.col, E.inOutCubic(prog(t, 2.22, 2.5)), z, i);
        } else {
          this.wipe(c, it.gray, E.outCubic(prog(u, 0, 0.16)), z, i);
          this.wipe(c, it.col, E.inOutCubic(prog(u, 0.07, 0.3)), z, i + 1);
        }
      }
      // inner vignette for depth
      const vg = c.createLinearGradient(0, AH * 0.55, 0, AH);
      vg.addColorStop(0, 'rgba(10,20,6,0)'); vg.addColorStop(1, 'rgba(10,20,6,0.28)');
      c.fillStyle = vg; c.fillRect(0, 0, AW, AH);
      c.restore();
    }

    // ── left column ──
    const LX = 136;
    revealText(c, 'DETTE LAVER VI', LX + 4, 336, `600 22px ${SANS}`, rgba(COL.ink, 0.66), E.outQuart(prog(t, 2.1, 2.5)), { ls: '6px' });
    revealText(c, 'Vi sprøjtelakerer', LX, 470, `600 98px ${SERIF}`, COL.ink, E.outQuart(prog(t, 2.06, 2.5)));

    // slot-machine word roll
    const wf = `italic 600 178px ${SERIF}`, base = 668, lineH = 210;
    c.save();
    c.beginPath(); c.rect(LX - 30, base - 178, 880, 236); c.clip();
    c.font = wf; c.textBaseline = 'alphabetic';
    for (let i = Math.max(0, cur - 1); i <= Math.min(items.length - 1, cur); i++) {
      const it = items[i];
      const enter = i === 0 ? E.outQuart(prog(t, 2.12, 2.48)) : E.outExpo(prog(t, it.t, it.t + 0.26));
      const nx = items[i + 1];
      const leave = nx ? E.outExpo(prog(t, nx.t, nx.t + 0.26)) : 0;
      const y = base + (1 - enter) * lineH - leave * lineH;
      if (enter <= 0) continue;
      const isAlt = i === items.length - 1;
      let x = LX;
      if (isAlt) {
        // 'alt.' lands with overshoot and gets an ink marker swipe
        const sc = lerp(1.25, 1, E.outBack(prog(t, it.t, it.t + 0.34), 2.2));
        const ww = c.measureText(it.w).width;
        const mk_ = E.outQuart(prog(t, 4.1, 4.32));
        c.save(); c.translate(LX, y); c.scale(sc, sc);
        if (mk_ > 0) {
          c.fillStyle = COL.ink;
          c.beginPath(); c.roundRect(-18, -150, (ww + 46) * mk_, 196, 10); c.fill();
        }
        c.fillStyle = COL.ink; c.fillText(it.w, 0, 0);
        if (mk_ > 0) {
          c.save(); c.beginPath(); c.rect(-18, -170, (ww + 46) * mk_, 240); c.clip();
          c.fillStyle = COL.yellow; c.fillText(it.w, 0, 0); c.restore();
        }
        c.restore();
      } else {
        c.fillStyle = COL.ink; c.fillText(it.w, x, y);
      }
    }
    c.restore();

    // progress + counter
    const pa = E.outQuart(prog(t, 2.2, 2.6));
    c.fillStyle = rgba(COL.ink, 0.16 * pa); c.fillRect(LX + 4, 790, 760 * pa, 4);
    let pv = 0; // continuous item index for the fill
    for (let i = 1; i < items.length; i++) pv += E.outExpo(prog(t, items[i].t, items[i].t + 0.3));
    c.fillStyle = COL.ink; c.fillRect(LX + 4, 790, 760 * pa * ((pv + 1) / items.length), 4);
    // rolling counter
    c.save(); c.beginPath(); c.rect(LX, 820, 200, 50); c.clip();
    c.font = `600 26px ${SANS}`; c.fillStyle = COL.ink; c.globalAlpha = pa;
    for (let i = Math.max(0, cur - 1); i <= cur; i++) {
      const it = items[i], nx = items[i + 1];
      const en = i === 0 ? 1 : E.outExpo(prog(t, it.t, it.t + 0.26));
      const lv = nx ? E.outExpo(prog(t, nx.t, nx.t + 0.26)) : 0;
      c.fillText(String(i + 1).padStart(2, '0'), LX + 4, 856 + (1 - en) * 40 - lv * 40);
    }
    c.globalAlpha = 0.45 * pa; c.fillText('/ 06', LX + 44, 856);
    c.restore();

    // rotating badge riding the arch edge
    const bs = spring(t - 2.38, 1.6, 0.55);
    if (bs > 0.001) {
      const bx = AX + 6, by = AY + AH - 150;
      c.save(); c.translate(bx, by); c.scale(bs, bs); c.rotate(-0.6 * (1 - bs) + (t - 2.38) * 0.9);
      c.fillStyle = COL.ink; c.beginPath(); c.arc(0, 0, 104, 0, Math.PI * 2); c.fill();
      const str = 'NYT LIV TIL GAMLE MØBLER • NYT LIV TIL GAMLE MØBLER • ';
      c.font = `600 17px ${SANS}`; c.fillStyle = COL.cream; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText(str).width, R = 78, k = (2 * Math.PI * R) / tw;
      let acc = 0;
      for (const ch of str) {
        const cw = c.measureText(ch).width;
        const a = (acc + cw / 2) * k / R;
        c.save(); c.rotate(a); c.translate(0, -R); c.fillText(ch, 0, 0); c.restore();
        acc += cw;
      }
      c.rotate(-(-0.6 * (1 - bs) + (t - 2.38) * 0.9));
      c.fillStyle = COL.yellow; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill();
      c.strokeStyle = COL.ink; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-11, 11); c.lineTo(11, -11); c.moveTo(-5, -11); c.lineTo(11, -11); c.lineTo(11, 5); c.stroke();
      c.restore();
    }
  },
};

// ═════════════════════════ SCENE 3 — the colour fan ═════════════════════════
const CARDS = [
  ['RAL 9010', '#F1ECE1'], ['RAL 1015', '#E6D2B5'], ['RAL 1018', '#F3DA0B'], ['RAL 2004', '#E75B12'],
  ['RAL 3020', '#C1121C'], ['RAL 3015', '#D8A0A6'], ['RAL 4005', '#76689A'], ['RAL 5002', '#20214F'],
  ['RAL 5024', '#6093AC'], ['RAL 6021', '#89AC76'], ['RAL 6005', '#114232'], ['RAL 7016', '#383E42'],
  ['RAL 9005', '#0E0E10'],
];
const S3 = {
  n: CARDS.length, sel: 10,
  P: [960, 1046], L: 690, CW: 116, PO: 44,
  flipA: 4.6, flipStep: 0.021, flipDur: 0.21,
  stackA: 5.08, fanA: 5.46,
  card(c, cx, cy, w, h, ang, r, color, label, la, sh) {
    c.save(); c.translate(cx, cy); c.rotate(ang);
    if (sh > 0) { c.shadowColor = `rgba(12,24,6,${0.28 * sh})`; c.shadowBlur = 34; c.shadowOffsetY = 10; }
    c.fillStyle = color; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, r); c.fill();
    c.shadowColor = 'transparent';
    if (la > 0) {
      c.globalAlpha = la;
      c.font = `600 18px ${SANS}`; c.textAlign = 'center';
      const lc = lum(label[1]) > 0.55 ? COL.ink : COL.cream;
      c.fillStyle = lc; c.fillText(label[0].split(' ')[0], 0, -h / 2 + 44);
      c.font = `500 24px ${SANS}`; c.fillText(label[0].split(' ')[1], 0, -h / 2 + 74);
      c.fillStyle = rgba(lum(label[1]) > 0.55 ? COL.ink : COL.cream, 0.25);
      c.fillRect(-w / 2 + 14, -h / 2 + 92, w - 28, 1.5);
      c.globalAlpha = 1;
    }
    c.restore();
  },
  fanAngle(i) { return (-70 + 140 * i / (this.n - 1)) * DEG; },
  stackAngle(i) { return (i - (this.n - 1) / 2) * 0.55 * DEG; },
  axisCenter(ang, extra = 0) {
    const [px, py] = this.P, d = this.L / 2 - this.PO + extra;
    const [vx, vy] = rot(0, -d, ang); return [px + vx, py + vy];
  },
  drawStripes(c, t) {
    const n = this.n, sw = W / n;
    for (let i = 0; i < n; i++) {
      const p = E.outCubic(prog(t, this.flipA + i * this.flipStep, this.flipA + i * this.flipStep + this.flipDur));
      if (p <= 0) continue;
      const col = mix(CARDS[i][1], '#000000', (1 - p) * 0.45);
      c.fillStyle = col;
      const w = (sw + 1.5) * p;
      c.fillRect((i + 0.5) * sw - w / 2, 0, w, H);
    }
  },
  covered(t) { return t >= this.flipA + (this.n - 1) * this.flipStep + this.flipDur; },
  draw(c, t) {
    const n = this.n, sw = W / n;
    c.fillStyle = COL.cream; c.fillRect(0, 0, W, H);
    // faint concentric guides behind the fan
    const ga = E.outCubic(prog(t, 5.5, 6.1)) * (1 - E.inCubic(prog(t, 7.2, 7.5)));
    if (ga > 0) {
      c.save(); c.strokeStyle = rgba(COL.ink, 0.06 * ga); c.lineWidth = 1.5;
      for (let k = 1; k <= 5; k++) { c.beginPath(); c.arc(this.P[0], this.P[1], 140 * k + 40, Math.PI, 0); c.stroke(); }
      c.restore();
    }

    // headline
    const hp = E.outQuart(prog(t, 5.6, 6.02)), hx = E.inCubic(prog(t, 7.18, 7.42));
    c.save(); c.globalAlpha = 1 - hx; c.translate(0, -60 * hx);
    revealText(c, 'Du vælger farven.', W / 2, 170, `600 104px ${SERIF}`, COL.ink, hp, { align: 'center' });
    revealText(c, 'Præcis den kulør, du vil have  ·  RAL & NCS', W / 2, 238, `500 30px ${SANS}`, rgba(COL.ink, 0.62), E.outQuart(prog(t, 5.8, 6.2)), { align: 'center' });
    c.restore();

    const t3 = E.inOutQuart(prog(t, 7.28, 7.9));
    const close = E.inCubic(prog(t, 7.2, 7.55));
    const order = [...Array(n).keys()].filter(i => i !== this.sel).concat([this.sel]);
    for (const i of order) {
      const dl = (n - 1) / 2 - Math.abs(i - (n - 1) / 2);
      const a = E.inOutCubic(prog(t, this.stackA + dl * 0.012, this.stackA + dl * 0.012 + 0.4));
      const b = spring(t - (this.fanA + i * 0.022), 1.15, 0.6);
      const sa = this.stackAngle(i);
      let ang, cx, cy, w, h, r;
      if (b <= 0) {
        const [tx, ty] = this.axisCenter(sa);
        cx = lerp((i + 0.5) * sw, tx, a); cy = lerp(H / 2, ty, a);
        w = lerp(sw + 1.5, this.CW, a); h = lerp(H, this.L, a); r = lerp(0, 12, a); ang = sa * a;
      } else {
        ang = lerp(sa, this.fanAngle(i), b);
        let lift = 0;
        if (i === this.sel) lift = 70 * E.outBack(prog(t, 6.78, 7.1), 2.4);
        if (i !== this.sel) ang = lerp(ang, 0, close);
        [cx, cy] = this.axisCenter(ang, lift); w = this.CW; h = this.L; r = 12;
      }
      let color = CARDS[i][1], la = E.outCubic(prog(t, this.fanA + 0.1 + i * 0.02, this.fanA + 0.4 + i * 0.02));
      const sh = a;
      if (i === this.sel && t3 > 0) {
        cx = lerp(cx, W / 2, t3); cy = lerp(cy, H / 2, t3); ang = lerp(ang, 0, t3);
        w = lerp(w, W + 80, t3); h = lerp(h, H + 80, t3); r = lerp(r, 0, t3);
        color = mix(color, COL.forest, E.inOutCubic(t3)); la *= 1 - prog(t3, 0, 0.25);
      }
      if (i !== this.sel && close > 0) {
        c.save(); c.globalAlpha = 1 - close;
        c.translate(this.P[0], this.P[1]); c.scale(1 - 0.12 * close, 1 - 0.12 * close); c.translate(-this.P[0], -this.P[1]);
        this.card(c, cx, cy, w, h, ang, r, color, CARDS[i], la, sh);
        c.restore();
      } else this.card(c, cx, cy, w, h, ang, r, color, CARDS[i], la, sh * (1 - t3));
      if (i === this.sel && t3 <= 0) {
        // rivet sits on top of the stack
      }
    }
    // rivet
    const rv = E.outBack(prog(t, 5.3, 5.55)) * (1 - prog(t, 7.25, 7.4));
    if (rv > 0) {
      const [px, py] = this.P;
      c.save(); c.translate(px, py); c.scale(rv, rv);
      const g = c.createRadialGradient(-4, -4, 1, 0, 0, 16);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#c9cbc4'); g.addColorStop(1, '#7c8077');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  },
};

// ═════════════════════════ SCENE 4 — proof (bento) ═════════════════════════
const S4 = {
  P: {
    A: [72, 72, 860, 936], B: [956, 72, 892, 456], C: [956, 552, 434, 456], D: [1414, 552, 434, 456],
  },
  inT: { A: 7.92, B: 8.0, C: 8.08, D: 8.16 },
  exit: { A: [-1, 0], B: [0, -1], C: [0, 1], D: [1, 0] },
  panel(c, key, t, bg, fn) {
    const [x, y, w, h] = this.P[key];
    const s = spring(t - this.inT[key], 1.7, 0.62);
    if (s <= 0.001) return;
    const ex = E.inBack(prog(t, 10.18 + 'ABCD'.indexOf(key) * 0.035, 10.5 + 'ABCD'.indexOf(key) * 0.035), 1.4);
    const [dx, dy] = this.exit[key];
    c.save();
    c.translate(x + w / 2 + dx * ex * 1300, y + h / 2 + dy * ex * 900);
    c.rotate(ex * 0.08 * (dx || dy));
    const sc = lerp(0.72, 1, s);
    c.scale(sc, sc);
    c.globalAlpha = clamp(s * 3);
    c.fillStyle = bg; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 30); c.fill();
    c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 30); c.clip();
    c.translate(-w / 2, -h / 2);
    fn(c, w, h, t - this.inT[key]);
    c.restore();
  },
  label(c, str, color, u) {
    revealText(c, str, 52, 74, `600 19px ${SANS}`, color, E.outQuart(prog(u, 0.1, 0.45)), { ls: '5px' });
  },
  draw(c, t) {
    c.fillStyle = COL.forest; c.fillRect(0, 0, W, H);

    // A — 40+ years, odometer
    this.panel(c, 'A', t, COL.yellow, (c, w, h, u) => {
      this.label(c, 'ERFARING', rgba(COL.ink, 0.6), u);
      const v = 40 * E.outExpo(prog(u, 0.12, 1.0));
      const f = `600 470px ${SERIF}`;
      c.font = f; c.fillStyle = COL.ink;
      const dW = c.measureText('0').width;
      const bx = 40, by = 640;
      c.save(); c.beginPath(); c.rect(bx, by - 360, dW * 2 + 20, 400); c.clip();
      const ones = v % 10, tens = Math.floor(v / 10) + clamp(ones - 9);
      // custom roll: digits travel upward as value increases
      const col = (val, x) => {
        const base = Math.floor(val), fr = val - base;
        for (let k = 0; k <= 1; k++) {
          const dgt = ((base + k) % 10 + 10) % 10;
          c.fillText(String(dgt), x, by + (k - fr) * 400);
        }
      };
      col(tens, bx); col(ones, bx + dW);
      c.restore();
      const pl_ = spring(u - 0.95, 2.2, 0.45);
      if (pl_ > 0.001) {
        c.save(); c.translate(bx + dW * 2 + 92, by - 228); c.scale(pl_, pl_); c.rotate((1 - pl_) * 1.2);
        c.font = `400 230px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = COL.ink;
        c.fillText('+', 0, 0); c.restore();
      }
      revealText(c, 'års erfaring', 50, 790, `italic 500 84px ${SERIF}`, COL.ink, E.outQuart(prog(u, 0.25, 0.7)));
      revealText(c, 'med sprøjtelakering af møbler, køkkener', 54, 862, `500 27px ${SANS}`, rgba(COL.ink, 0.7), E.outQuart(prog(u, 0.36, 0.8)));
    });

    // B — 4,9 on Trustpilot
    this.panel(c, 'B', t, COL.ink, (c, w, h, u) => {
      this.label(c, 'TRUSTPILOT', rgba(COL.cream, 0.55), u);
      revealText(c, '4,9', 46, 330, `600 236px ${SERIF}`, COL.cream, E.outQuart(prog(u, 0.12, 0.55)));
      for (let k = 0; k < 5; k++) {
        const s = spring(u - (0.3 + k * 0.075), 2.0, 0.5);
        if (s <= 0.001) continue;
        const cx = 452 + k * 84, cy = 236;
        c.save(); c.translate(cx, cy); c.scale(s, s); c.rotate((1 - s) * -0.8);
        star(c, 0, 0, 36);
        c.fillStyle = rgba(COL.cream, 0.14); c.fill();
        const fill = k < 4 ? 1 : 0.9 * E.outCubic(prog(u, 0.75, 1.1));
        c.save(); c.clip(); c.fillStyle = COL.yellow; c.fillRect(-40, -40, 80 * fill, 80); c.restore();
        c.restore();
      }
      const cnt = Math.round(421 * E.outExpo(prog(u, 0.2, 1.1)));
      revealText(c, `${cnt} anmeldelser`, 456, 330, `500 30px ${SANS}`, rgba(COL.cream, 0.78), E.outQuart(prog(u, 0.3, 0.7)));
      revealText(c, '“Kan på alle måder anbefales.”', 50, 410, `italic 400 32px ${SERIF}`, rgba(COL.cream, 0.6), E.outQuart(prog(u, 0.55, 0.95)));
    });

    // C — 24 h reply
    this.panel(c, 'C', t, COL.sage, (c, w, h, u) => {
      this.label(c, 'SVARTID', rgba(COL.cream, 0.66), u);
      const cx = w - 92, cy = 92, R = 40;
      const dr = E.outCubic(prog(u, 0.15, 0.6));
      c.save(); c.strokeStyle = COL.cream; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + dr * Math.PI * 2); c.stroke();
      const ha = E.outCubic(prog(u, 0.2, 1.6)) * Math.PI * 4;
      c.globalAlpha = dr;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(ha) * 26, cy - Math.cos(ha) * 26); c.stroke();
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(ha / 12) * 17, cy - Math.cos(ha / 12) * 17); c.stroke();
      c.restore();
      revealText(c, '24 t', 44, 330, `600 176px ${SERIF}`, COL.cream, E.outQuart(prog(u, 0.18, 0.6)));
      revealText(c, 'Svar på dit tilbud', 52, 396, `500 27px ${SANS}`, rgba(COL.cream, 0.85), E.outQuart(prog(u, 0.32, 0.72)));
    });

    // D — fixed budget
    this.panel(c, 'D', t, COL.cream, (c, w, h, u) => {
      this.label(c, 'PRIS', rgba(COL.ink, 0.55), u);
      const cx = w - 92, cy = 92;
      const s = spring(u - 0.15, 2.0, 0.55);
      c.save(); c.translate(cx, cy); c.scale(s, s);
      c.fillStyle = COL.forest; c.beginPath(); c.arc(0, 0, 42, 0, Math.PI * 2); c.fill();
      const ck = E.inOutCubic(prog(u, 0.3, 0.6));
      if (ck > 0) {
        c.strokeStyle = COL.yellow; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
        const pts = [[-17, 1], [-5, 13], [18, -12]];
        const l1 = Math.hypot(12, 12), l2 = Math.hypot(23, 25), tot = l1 + l2, d = ck * tot;
        c.beginPath(); c.moveTo(...pts[0]);
        if (d <= l1) c.lineTo(lerp(pts[0][0], pts[1][0], d / l1), lerp(pts[0][1], pts[1][1], d / l1));
        else { c.lineTo(...pts[1]); const e = (d - l1) / l2; c.lineTo(lerp(pts[1][0], pts[2][0], e), lerp(pts[1][1], pts[2][1], e)); }
        c.stroke();
      }
      c.restore();
      revealText(c, 'Fast pris', 44, 330, `600 96px ${SERIF}`, COL.ink, E.outQuart(prog(u, 0.22, 0.62)));
      revealText(c, 'Altid fast budget', 52, 396, `500 27px ${SANS}`, rgba(COL.ink, 0.7), E.outQuart(prog(u, 0.36, 0.76)));
    });
  },
};

// ═════════════════════════ SCENE 5 — the quote ═════════════════════════
const S5 = {
  f1: `italic 500 150px ${SERIF}`, f2: `italic 700 206px ${SERIF}`,
  init(c) {
    const w1 = textW(c, 'Dibbern er', this.f1), w2 = textW(c, 'Superliga', this.f2);
    const wd = textW(c, 'Superliga.', this.f2) - w2;
    this.w2 = w2; this.bw = Math.max(w1, w2 + wd);
    this.x = (W - this.bw) / 2 + 40; this.y1 = 500; this.y2 = 712;
    this.dotR = 206 * 0.064; this.dotX = this.x + w2 + wd * 0.42; this.dotY = this.y2 - this.dotR;
    const r = mulberry32(21); this.spk = [];
    for (let i = 0; i < 520; i++) this.spk.push({ s: r(), o: gauss(r) * 12, rad: 0.7 + 2.4 * Math.pow(r(), 2.5), a: 0.25 + 0.6 * r() });
  },
  ulPt(s) { // underline swoosh under 'Superliga'
    const x0 = this.x + 10, x1 = this.x + this.w2 - 10, y = this.y2 + 52;
    const x = lerp(x0, x1, s);
    return [x, y + Math.sin(s * Math.PI) * -14 + s * 6];
  },
  exitP(t, d = 0) { return E.inCubic(prog(t, 11.56 + d, 11.82 + d)); },
  draw(c, t, bg = true) {
    if (bg) { c.fillStyle = COL.forest; c.fillRect(0, 0, W, H); }
    // big quote mark
    const qs = spring(t - 10.42, 1.6, 0.6), qe = this.exitP(t, 0);
    if (qs > 0.001) {
      c.save(); c.translate(this.x - 86, this.y1 - 120 + qe * 60); c.rotate((1 - qs) * -0.5); c.scale(qs, qs);
      c.globalAlpha = 1 - qe;
      c.font = `600 470px ${SERIF}`; c.fillStyle = rgba(COL.yellow, 0.95); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('“', 0, 60); c.restore();
    }
    // line 1 — word punches
    const words = [['Dibbern', 10.5], ['er', 10.64]];
    let xx = this.x;
    c.font = this.f1;
    const sp = textW(c, ' ', this.f1);
    words.forEach(([wd, t0], i) => {
      const p = prog(t, t0, t0 + 0.22), ex = this.exitP(t, 0.02 + i * 0.03);
      if (p > 0) {
        const s = lerp(1.35, 1, E.outQuart(p));
        const ww = textW(c, wd, this.f1);
        c.save(); c.translate(xx + ww / 2, this.y1 - 50 + ex * 70); c.scale(s, s);
        c.globalAlpha = clamp(p * 2.5) * (1 - ex);
        c.font = this.f1; c.fillStyle = COL.cream; c.textAlign = 'center'; c.fillText(wd, 0, 50); c.restore();
      }
      xx += textW(c, wd, this.f1) + sp;
    });
    // line 2 — letter cascade
    const sup = 'Superliga';
    let lx = this.x;
    c.font = this.f2;
    for (let i = 0; i < sup.length; i++) {
      const ch = sup[i], cw = textW(c, ch, this.f2);
      const t0 = 10.8 + i * 0.022, p = E.outBack(prog(t, t0, t0 + 0.32), 1.6), ex = this.exitP(t, 0.06 + i * 0.012);
      if (p > 0) {
        c.save(); c.globalAlpha = clamp(prog(t, t0, t0 + 0.1)) * (1 - ex);
        c.font = this.f2; c.fillStyle = COL.yellow;
        c.fillText(ch, lx, this.y2 + (1 - p) * 120 + ex * 90);
        c.restore();
      }
      lx += cw;
    }
    // full stop — survives the exit and becomes the drop (drawn by S6 after 11.62)
    const dp = spring(t - 11.02, 2.2, 0.45);
    if (dp > 0.001 && t < 11.62) {
      c.fillStyle = COL.yellow; c.beginPath(); c.arc(this.dotX, this.dotY, this.dotR * dp, 0, Math.PI * 2); c.fill();
    }
    // spray underline
    const ul = E.inOutCubic(prog(t, 11.0, 11.3)), ue = this.exitP(t, 0.1);
    if (ul > 0 && ue < 1) {
      c.save(); c.globalAlpha = 1 - ue; c.translate(0, ue * 80);
      c.fillStyle = COL.cream;
      const taper = s => Math.pow(Math.sin(Math.PI * clamp(s)), 0.6) * (1 - 0.35 * s);
      for (let s = 0; s <= ul; s += 0.0025) {
        const [x, y] = this.ulPt(s);
        c.beginPath(); c.arc(x, y, 1 + 6.5 * taper(s), 0, Math.PI * 2); c.fill();
      }
      for (const q of this.spk) {
        if (q.s > ul) continue;
        const [x, y] = this.ulPt(q.s);
        c.globalAlpha = (1 - ue) * q.a;
        c.beginPath(); c.arc(x, y + q.o * (0.4 + taper(q.s)), q.rad, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    // attribution
    const ap = E.outQuart(prog(t, 11.12, 11.45)), ae = this.exitP(t, 0.14);
    if (ap > 0) {
      c.save(); c.globalAlpha = 1 - ae; c.translate(0, ae * 60);
      for (let k = 0; k < 5; k++) {
        const s = spring(t - (11.15 + k * 0.04), 2.2, 0.55);
        c.save(); c.translate(this.x + 14 + k * 30, 852 - 9); c.scale(s, s); star(c, 0, 0, 12); c.fillStyle = COL.yellow; c.fill(); c.restore();
      }
      revealText(c, 'Jeanett B.  ·  anmeldelse på Trustpilot', this.x + 170, 852, `500 27px ${SANS}`, rgba(COL.cream, 0.78), ap);
      c.restore();
    }
  },
};

// ═════════════════════════ SCENE 6 — drop, logo, end card ═════════════════════════
const S6 = {
  impact: 12.02,
  init(c) {
    this.R = 236;
    const f1 = `600 118px ${SERIF}`;
    this.tw = Math.max(textW(c, 'Gamle møbler.', f1), 700);
    const gap = 104, total = this.R * 2 + gap + this.tw;
    this.LX = (W - total) / 2 + this.R; this.TX = this.LX + this.R + gap;
    const r = mulberry32(31); this.drops = []; this.dust = [];
    for (let i = 0; i < 18; i++) this.drops.push({ a: r() * Math.PI * 2, v: 380 + 520 * r(), rad: 3 + 7 * r(), up: 200 + 300 * r() });
    for (let i = 0; i < 70; i++) this.dust.push({ x: r() * W, y: r() * H, v: 10 + 30 * r(), rad: 0.8 + 2.2 * r(), a: 0.08 + 0.25 * r(), ph: r() * 6 });
  },
  dropPos(t) {
    // bezier toss from the quote's full stop to centre
    const p = E.inOutCubic(prog(t, 11.62, this.impact));
    const p0 = [S5.dotX, S5.dotY], p2 = [W / 2, H / 2], p1 = [lerp(p0[0], p2[0], 0.5), Math.min(p0[1], p2[1]) - 260];
    const q = 1 - p;
    return [q * q * p0[0] + 2 * q * p * p1[0] + p * p * p2[0], q * q * p0[1] + 2 * q * p * p1[1] + p * p * p2[1]];
  },
  draw(c, t, bg = true) {
    if (bg) { c.fillStyle = COL.forest; c.fillRect(0, 0, W, H); }
    const ti = this.impact;
    const slide = E.inOutCubic(prog(t, 12.62, 13.25));
    const cx = lerp(W / 2, this.LX, slide), cy = H / 2;

    // glow + dust
    if (t > ti - 0.1) {
      const ga = E.outCubic(prog(t, ti, ti + 0.8));
      const g = c.createRadialGradient(cx, cy, 40, cx, cy, 900);
      g.addColorStop(0, `rgba(60,120,62,${0.55 * ga})`); g.addColorStop(1, 'rgba(30,77,43,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (const d of this.dust) {
        const y = ((d.y - (t - ti) * d.v) % H + H) % H, x = d.x + Math.sin(t * 0.8 + d.ph) * 14;
        c.fillStyle = rgba(COL.yellow, d.a * ga); c.beginPath(); c.arc(x, y, d.rad, 0, Math.PI * 2); c.fill();
      }
    }

    // the travelling drop (squash & stretch along velocity)
    if (t >= 11.62 && t < ti + 0.06) {
      const [x, y] = this.dropPos(t), [x2, y2] = this.dropPos(t + 0.004);
      const vx = (x2 - x) / 0.004, vy = (y2 - y) / 0.004, sp = Math.hypot(vx, vy);
      const r = lerp(S5.dotR, 30, E.outCubic(prog(t, 11.62, ti)));
      const st = 1 + clamp(sp / 4000) * 0.9;
      c.save(); c.translate(x, y); c.rotate(Math.atan2(vy, vx));
      let sx = st, sy = 1 / st;
      if (t > ti) { const sq = prog(t, ti, ti + 0.06); c.rotate(-Math.atan2(vy, vx)); sx = lerp(1.6, 1, sq); sy = lerp(0.55, 1, sq); }
      c.scale(sx, sy); c.fillStyle = COL.logo; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.restore();
    }
    if (t < ti) return;

    // ripples
    for (let k = 0; k < 3; k++) {
      const u = prog(t, ti + k * 0.09, ti + k * 0.09 + 1.25);
      if (u <= 0 || u >= 1) continue;
      c.strokeStyle = rgba(COL.cream, 0.55 * (1 - u) * (1 - u));
      c.lineWidth = lerp(7, 1, u);
      c.beginPath(); c.arc(W / 2, H / 2, 40 + 980 * E.outCubic(u), 0, Math.PI * 2); c.stroke();
    }
    // splash droplets
    for (const d of this.drops) {
      const u = t - ti; if (u > 0.7) continue;
      const x = W / 2 + Math.cos(d.a) * d.v * u, y = H / 2 + Math.sin(d.a) * d.v * u * 0.75 - d.up * u + 900 * u * u;
      const rr = d.rad * (1 - u / 0.7);
      c.fillStyle = COL.logo; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill();
    }

    // disc bloom → logo
    const R = Math.max(0, this.R * spring(t - ti - 0.01, 1.35, 0.5));
    if (R > 0) {
      c.save(); c.translate(cx, cy);
      c.shadowColor = 'rgba(5,15,2,0.35)'; c.shadowBlur = 50; c.shadowOffsetY = 18;
      c.fillStyle = COL.logo; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
      c.shadowColor = 'transparent';
      const la = E.outCubic(prog(t, ti + 0.1, ti + 0.42));
      const lr = -0.7 * (1 - spring(t - ti - 0.08, 1.1, 0.6));
      if (la > 0) {
        c.save(); c.beginPath(); c.arc(0, 0, R * lerp(0.2, 1, la), 0, Math.PI * 2); c.clip();
        c.rotate(lr); c.globalAlpha = la; c.drawImage(IMG.logo, -R, -R, R * 2, R * 2); c.restore();
      }
      // gloss sheen
      const sh = prog(t, 13.8, 14.3);
      if (sh > 0 && sh < 1) {
        c.save(); c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.clip();
        c.rotate(24 * DEG); const sx = lerp(-R * 1.6, R * 1.6, E.inOutCubic(sh));
        const sg = c.createLinearGradient(sx - 70, 0, sx + 70, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = sg; c.fillRect(sx - 70, -R * 2, 140, R * 4); c.restore();
      }
      c.restore();
    }

    // text block
    const TX = this.TX;
    revealText(c, 'Gamle møbler.', TX, 404, `600 118px ${SERIF}`, COL.cream, E.outQuart(prog(t, 12.95, 13.42)));
    revealText(c, 'Nyt liv.', TX, 536, `italic 600 128px ${SERIF}`, COL.yellow, E.outQuart(prog(t, 13.07, 13.55)));
    const rl = E.inOutCubic(prog(t, 13.2, 13.7));
    c.fillStyle = rgba(COL.cream, 0.28); c.fillRect(TX + 4, 590, 820 * rl, 2);
    revealText(c, 'Dibbern Color Design  ·  Sprøjtelakering i Rødovre', TX + 4, 648, `500 31px ${SANS}`, rgba(COL.cream, 0.82), E.outQuart(prog(t, 13.3, 13.7)));
    const cs = spring(t - 13.48, 1.8, 0.6);
    if (cs > 0.001) {
      const f = `600 31px ${SANS}`, lab = 'Få et tilbud', bw = textW(c, lab, f) + 118, bh = 84, by = 690;
      c.save(); c.translate(TX + 4, by); c.scale(cs, cs);
      c.fillStyle = COL.yellow; c.beginPath(); c.roundRect(0, 0, bw, bh, bh / 2); c.fill();
      // sheen on button
      const sh = prog(t, 14.05, 14.4);
      if (sh > 0 && sh < 1) {
        c.save(); c.beginPath(); c.roundRect(0, 0, bw, bh, bh / 2); c.clip();
        const sx = lerp(-80, bw + 80, E.inOutCubic(sh));
        const sg = c.createLinearGradient(sx - 50, 0, sx + 50, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.7)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = sg; c.fillRect(sx - 50, 0, 100, bh); c.restore();
      }
      c.font = f; c.fillStyle = COL.ink; c.textBaseline = 'middle';
      c.fillText(lab, 38, bh / 2 + 1);
      const nud = Math.sin(clamp((t - 14.35) / 0.5) * Math.PI) * 8;
      const ax = bw - 60 + nud;
      c.strokeStyle = COL.ink; c.lineWidth = 3.5; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(ax, bh / 2); c.lineTo(ax + 22, bh / 2); c.moveTo(ax + 13, bh / 2 - 9); c.lineTo(ax + 22, bh / 2); c.lineTo(ax + 13, bh / 2 + 9); c.stroke();
      c.restore();
      const bwF = textW(c, lab, f) + 118;
      revealText(c, 'dibberndesign.dk', TX + bwF + 40, 743, `500 33px ${SANS}`, COL.cream, E.outQuart(prog(t, 13.62, 14.0)));
    }
  },
};

// ═════════════════════════ composition ═════════════════════════
function render(c, t) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.letterSpacing = '0px'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  if (t < 1.985) { S1.draw(c, t); return; }
  if (t < S3.stackA) {
    S2.draw(c, t);
    S3.drawStripes(c, t);
    return;
  }
  if (t < 7.9) { S3.draw(c, t); return; }
  if (t < 10.42) { S4.draw(c, t); return; }
  if (t < 11.62) { S5.draw(c, t); return; }
  c.fillStyle = COL.forest; c.fillRect(0, 0, W, H);
  const u = t - S6.impact;
  if (u > 0 && u < 0.5) {
    const a = 9 * Math.exp(-u / 0.09);
    c.translate(a * Math.sin(u * 97), a * Math.cos(u * 131) * 0.7);
  }
  if (t < 12.0) S5.draw(c, t, false);
  S6.draw(c, t, false);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

// grain + vignette, once per output frame
let GRAIN = [], VIG = null;
function initPost() {
  const r = mulberry32(99);
  for (let k = 0; k < 6; k++) {
    const [cv, c] = mk(384, 384); const id = c.createImageData(384, 384);
    for (let i = 0; i < id.data.length; i += 4) { const v = 128 + gauss(r) * 52; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    c.putImageData(id, 0, 0); GRAIN.push(cv);
  }
  const [vcv, vc] = mk(W, H);
  const g = vc.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
  vc.fillStyle = g; vc.fillRect(0, 0, W, H); VIG = vcv;
}
function post(c, frame) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.drawImage(VIG, 0, 0);
  const gcv = GRAIN[frame % GRAIN.length];
  const pat = c.createPattern(gcv, 'repeat');
  const r = mulberry32(frame * 7 + 3);
  pat.setTransform(new DOMMatrix().translate(Math.floor(r() * 384), Math.floor(r() * 384)));
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.085;
  c.fillStyle = pat; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}

// Very fast moves need more sub-samples or the blur breaks into stepped copies.
const BLUR_WINDOWS = [
  [1.72, 1.99, 24],   // plunge through the full stop
  [2.0, 4.62, 8],     // slot-machine word roll
  [7.4, 7.92, 12],    // card → fullscreen
  [10.16, 10.56, 14], // bento exit
  [11.56, 12.1, 12],  // quote exit + drop toss
];
const subFor = t => BLUR_WINDOWS.reduce((m, [a, b, n]) => (t >= a && t < b ? Math.max(m, n) : m), 0);

// Render output frame with `sub` sub-samples across a `shutter` (fraction of frame) window.
window.renderFrame = (frame, fps = 60, sub = 4, shutter = 0.5) => {
  const t0 = frame / fps;
  sub = Math.max(sub, subFor(t0));
  out.setTransform(1, 0, 0, 1, 0, 0); out.globalCompositeOperation = 'source-over';
  for (let k = 0; k < sub; k++) {
    const t = clamp(t0 + (sub > 1 ? ((k + 0.5) / sub - 0.5) * shutter / fps : 0), 0, DUR - 1e-4);
    render(scn, t);
    out.globalAlpha = 1 / (k + 1);
    out.drawImage(scnCv, 0, 0);
  }
  out.globalAlpha = 1;
  post(out, frame);
};
window.renderAt = (t) => { render(scn, t); out.globalAlpha = 1; out.drawImage(scnCv, 0, 0); post(out, Math.round(t * 60)); };

window.__ready = (async () => {
  await Promise.all([
    document.fonts.load(`600 100px ${SERIF}`), document.fonts.load(`italic 600 100px ${SERIF}`),
    document.fonts.load(`400 100px ${SERIF}`), document.fonts.load(`italic 400 100px ${SERIF}`),
    document.fonts.load(`500 30px ${SANS}`), document.fonts.load(`600 30px ${SANS}`),
  ]);
  await Promise.all(Object.entries(IMG_SRC).map(async ([k, s]) => { IMG[k] = await loadImg(s); }));
  S1.init(scn); S2.init(); S5.init(scn); S6.init(scn); initPost();
  const q = new URLSearchParams(location.search);
  if (q.has('t')) window.renderAt(parseFloat(q.get('t')));
  return true;
})();
