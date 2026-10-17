'use strict';
/*
 * VARLE — "Nyt tag uden overraskelser"
 * 15s motion piece. Deterministic: every pixel is a pure function of time t,
 * so frames can be rendered in any order, in parallel, with sub-frame motion blur.
 *
 * Story = the brand's own 4-step process, told as one continuous camera move
 * around a single house: first chalk line -> measured drawing -> quote -> tiles -> handover -> logo.
 */
(function () {
const W = 1920, H = 1080, FPS = 60, DUR = 15;
const out = document.getElementById('c'), octx = out.getContext('2d');
const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
const ctx = sc.getContext('2d');

// ───────────────────────────── utils
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const DEG = Math.PI / 180, TAU = Math.PI * 2;

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    if (Math.abs(sx(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 40; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return sy(t);
  };
}
const E = {
  lin: x => x,
  inQuad: x => x * x, outQuad: x => 1 - (1 - x) * (1 - x),
  inCubic: x => x * x * x, outCubic: x => 1 - Math.pow(1 - x, 3),
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outQuart: x => 1 - Math.pow(1 - x, 4),
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
};
const EZ = {
  snap: bezier(0.7, 0, 0.2, 1),
  out: bezier(0.16, 1, 0.3, 1),
  in: bezier(0.7, 0, 0.84, 0),
  inOut: bezier(0.65, 0, 0.35, 1),
  cam: bezier(0.6, 0, 0.1, 1),
  soft: bezier(0.4, 0, 0.2, 1),
};
// damped spring step response 0 -> 1
function spring(t, f = 3, z = 0.4) {
  if (t <= 0) return 0;
  const w = TAU * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// keyframe track: [t, value, easeToNext]
function track(keys) {
  return t => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0, e] = keys[i], [t1, v1] = keys[i + 1];
      if (t <= t1) return v0 + (v1 - v0) * (e || E.lin)((t - t0) / (t1 - t0));
    }
    return keys[keys.length - 1][1];
  };
}
// gaussian smoothing of a track (removes velocity kinks between segments)
function smooth(f, sig) {
  const N = 6, ws = [], os = []; let s = 0;
  for (let i = -N; i <= N; i++) { const o = i * sig / 2.5; const w = Math.exp(-0.5 * (o / sig) ** 2); ws.push(w); os.push(o); s += w; }
  return t => { let v = 0; for (let i = 0; i < ws.length; i++) v += ws[i] * f(t + os[i]); return v / s; };
}

// ───────────────────────────── colour
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scl = (c, s) => [Math.min(255, c[0] * s), Math.min(255, c[1] * s), Math.min(255, c[2] * s)];
const P = {
  bgA: hex('#0c2443'), bgB: hex('#030a15'),
  navy: hex('#0a203d'), panel: hex('#0c1c31'), line: hex('#22354f'),
  teal: hex('#0f766d'), tealM: hex('#139e8f'), tealHi: hex('#4fe3cf'), mint: hex('#b4f5e8'),
  paper: hex('#f6f6f4'), muted: hex('#5e6c8d'), muted2: hex('#9cadc8'),
  warm: hex('#ffad4a'), wood: hex('#b08a5a'),
  wallLit: hex('#efede6'), wallShade: hex('#2c3c56'), ink: hex('#0a1626'),
};
const MATS = [
  { name: 'Eternit', sub: 'FIBERCEMENT', base: hex('#717c88'), vr: 0.05, spec: 0.22 },
  { name: 'Tegl', sub: 'TEGLTAGSTEN', base: hex('#bd5630'), vr: 0.10, spec: 0.28 },
  { name: 'Beton', sub: 'BETONTAGSTEN', base: hex('#3a414d'), vr: 0.05, spec: 0.6 },
];

// ───────────────────────────── 3D
const V = (x, y, z) => ({ x, y, z });
const vadd = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const vsub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const vmul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const vcross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const vlen = a => Math.hypot(a.x, a.y, a.z);
const vnorm = a => vmul(a, 1 / vlen(a));
const vlerp = (a, b, t) => V(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
const LIGHT = vnorm(V(-0.35, 0.8, 0.5));

let CAM = null, FOLD = 1;
function setCam(p) {
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const dir = V(cp * sy, sp, cp * cy);
  const pos = vadd(p.target, vmul(dir, p.dist));
  const fwd = vnorm(vsub(p.target, pos));
  const right = vnorm(vcross(fwd, V(0, 1, 0)));
  const up = vcross(right, fwd);
  CAM = { pos, fwd, right, up, f: (H / 2) / Math.tan(p.fov / 2), sx: p.sx, sy: p.sy, scale: (H / 2) / p.K };
}
function toCam(P3) { const d = vsub(V(P3.x, P3.y * FOLD, P3.z), CAM.pos); return V(vdot(d, CAM.right), vdot(d, CAM.up), vdot(d, CAM.fwd)); }
function c2s(c) { const z = Math.max(c.z, 0.01); return { x: W / 2 + CAM.sx + CAM.f * c.x / z, y: H / 2 + CAM.sy - CAM.f * c.y / z, z: c.z }; }
const pr = P3 => c2s(toCam(P3));
function prSeg(a, b) {
  let ca = toCam(a), cb = toCam(b); const n = 0.4;
  if (ca.z < n && cb.z < n) return null;
  if (ca.z < n) ca = vlerp(ca, cb, (n - ca.z) / (cb.z - ca.z));
  else if (cb.z < n) cb = vlerp(cb, ca, (n - cb.z) / (ca.z - cb.z));
  return [c2s(ca), c2s(cb)];
}

// ───────────────────────────── camera choreography
const lt = d => Math.log(Math.tan(d * DEG / 2));
const CT = {
  yaw: smooth(track([[0, 90], [1.45, 90, EZ.cam], [3.4, 34], [7.3, 23, EZ.inOut], [8.9, 38], [11.0, 45, EZ.inOut], [11.85, 90]]), 0.07),
  pitch: smooth(track([[0, 0], [1.45, 0, EZ.cam], [3.4, 19], [7.3, 28, EZ.inOut], [8.9, 15], [11.0, 12, EZ.inOut], [11.85, 0]]), 0.07),
  lfov: smooth(track([[0, lt(5)], [1.45, lt(5), EZ.cam], [3.4, lt(36)], [7.3, lt(34), EZ.inOut], [8.9, lt(30)], [11.0, lt(30), EZ.inOut], [11.85, lt(5)]]), 0.07),
  K: smooth(track([[0, 7.9], [1.45, 7.45, EZ.cam], [3.4, 9.3], [7.3, 8.5, EZ.inOut], [8.9, 9.9], [11.0, 10.3, EZ.inOut], [11.85, 7.9]]), 0.07),
  sx: smooth(track([[0, 0], [1.45, 0, EZ.cam], [3.4, 330], [7.3, 345, EZ.inOut], [8.9, 480], [11.0, 470, EZ.inOut], [11.85, 0]]), 0.07),
  sy: smooth(track([[0, 0], [1.45, 0, EZ.cam], [3.4, 30], [7.3, 40, EZ.inOut], [8.9, 60], [11.0, 60, EZ.inOut], [11.85, 0]]), 0.07),
};
function camAt(t) {
  const fov = 2 * Math.atan(Math.exp(CT.lfov(t)));
  const K = CT.K(t);
  return { yaw: CT.yaw(t) * DEG, pitch: CT.pitch(t) * DEG, fov, K, dist: K / Math.tan(fov / 2), target: V(0, 2.3, 0), sx: CT.sx(t), sy: CT.sy(t) };
}

// impacts -> screen shake
const IMPACTS = [[0.5, 3], [1.0, 2.5], [4.0, 5], [8.0, 4], [8.5, 3], [10.0, 8], [12.35, 6]];
function shake(t) {
  let x = 0, y = 0;
  for (const [ti, a] of IMPACTS) {
    const d = t - ti; if (d < 0 || d > 0.6) continue;
    const env = a * Math.exp(-d * 9);
    x += env * Math.sin(d * 71 + ti); y += env * Math.cos(d * 63 + ti * 2);
  }
  return { x, y };
}

// ───────────────────────────── house geometry
const PITCH = 30 * DEG, EH = 3, B2 = 4, L2 = 6;
const RH = EH + B2 * Math.tan(PITCH);      // ridge height 5.309
const OV = 0.45, RK = 0.3;                  // eave / rake overhang
const EY = EH - OV * Math.tan(PITCH);       // eave edge height
const gR = [V(6, 0, 4), V(6, 0, -4), V(6, EH, -4), V(6, RH, 0), V(6, EH, 4)];
const gL = gR.map(p => V(-6, p.y, p.z));
const FACES = {
  front: { n: V(0, 0, 1), p: V(0, 1.5, 4) }, back: { n: V(0, 0, -1), p: V(0, 1.5, -4) },
  gR: { n: V(1, 0, 0), p: V(6, 2, 0) }, gL: { n: V(-1, 0, 0), p: V(-6, 2, 0) },
  roofF: { n: V(0, Math.cos(PITCH), Math.sin(PITCH)), p: V(0, 4, 2) },
  roofB: { n: V(0, Math.cos(PITCH), -Math.sin(PITCH)), p: V(0, 4, -2) },
  floor: { n: V(0, -1, 0), p: V(0, 0, 0) },
};
const facing = f => { const F = FACES[f]; return vdot(F.n, vsub(CAM.pos, V(F.p.x, F.p.y * FOLD, F.p.z))) > 0; };

// wireframe edges: a -> b is the draw direction
const EDGES = [
  { a: gR[0], b: gR[1], f: ['gR', 'floor'], t: [0.38, 0.56] },
  { a: gR[1], b: gR[2], f: ['gR', 'back'], t: [0.6, 0.84] },
  { a: gR[0], b: gR[4], f: ['gR', 'front'], t: [0.6, 0.84] },
  { a: gR[2], b: gR[3], f: ['gR', 'roofB'], t: [0.8, 1.0], acc: true },
  { a: gR[4], b: gR[3], f: ['gR', 'roofF'], t: [0.8, 1.0], acc: true },
  { a: gR[0], b: gL[0], f: ['front', 'floor'], t: [1.70, 2.30] },
  { a: gR[4], b: gL[4], f: ['front', 'roofF'], t: [1.76, 2.36] },
  { a: gR[3], b: gL[3], f: ['roofF', 'roofB'], t: [1.82, 2.42] },
  { a: gR[2], b: gL[2], f: ['back', 'roofB'], t: [1.88, 2.48] },
  { a: gR[1], b: gL[1], f: ['back', 'floor'], t: [1.94, 2.54] },
  { a: gL[0], b: gL[4], f: ['gL', 'front'], t: [2.25, 2.5] },
  { a: gL[1], b: gL[2], f: ['gL', 'back'], t: [2.3, 2.55] },
  { a: gL[4], b: gL[3], f: ['gL', 'roofF'], t: [2.4, 2.62] },
  { a: gL[2], b: gL[3], f: ['gL', 'roofB'], t: [2.42, 2.64] },
  { a: gL[0], b: gL[1], f: ['gL', 'floor'], t: [2.3, 2.6] },
];
const MARKERS = [
  { p: gR[0], t: 0.56 }, { p: gR[1], t: 0.56 }, { p: gR[4], t: 0.84 }, { p: gR[2], t: 0.84 }, { p: gR[3], t: 1.0, big: true },
  { p: gL[0], t: 2.3 }, { p: gL[4], t: 2.36 }, { p: gL[3], t: 2.42 }, { p: gL[2], t: 2.48 }, { p: gL[1], t: 2.54 },
];

// roof planes for tiles
const LU = 2 * (L2 + RK), LV = (B2 + OV) / Math.cos(PITCH);
const NC = 24, NR = 11, TW = LU / NC, TH = LV / NR;
const PLANES = [
  { face: 'roofF', O: V(-(L2 + RK), EY, B2 + OV), U: V(1, 0, 0), Vd: V(0, Math.sin(PITCH), -Math.cos(PITCH)), N: FACES.roofF.n },
  { face: 'roofB', O: V(L2 + RK, EY, -(B2 + OV)), U: V(-1, 0, 0), Vd: V(0, Math.sin(PITCH), Math.cos(PITCH)), N: FACES.roofB.n },
];
const planePt = (pl, u, v, n = 0) => vadd(vadd(vadd(pl.O, vmul(pl.U, u)), vmul(pl.Vd, v)), vmul(pl.N, n));

// tiles
const TILES = [];
{
  const R = rng(7);
  for (let pi = 0; pi < 2; pi++) for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
    TILES.push({ pi, r, c, vr: R() * 2 - 1, vr2: R() * 2 - 1, jit: R() * 0.035,
      lay: 4.5 + r * 0.05 + (c / NC) * 0.22 + R() * 0.03 });
  }
}
// material wave timings (flip-in-place, diagonal wave)
const WAVES = [{ t: 5.36, to: 1 }, { t: 6.36, to: 2 }];
const FLIP = 0.3;
const waveDelay = (tl) => (tl.c / NC) * 0.3 + (tl.r / NR) * 0.12;
function tileState(tl, t) {
  let from = 0, to = 0, p = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i], s = w.t + waveDelay(tl);
    if (t >= s) { from = i === 0 ? 0 : WAVES[i - 1].to; to = w.to; p = seg(t, s, s + FLIP); }
  }
  if (p >= 1) from = to;
  return { from, to, p };
}

// windows (front wall z=4, gable x=6, back etc.)
const WINDOWS = [
  { face: 'front', pts: rectZ(4.01, -3.6, 0, 1.0, 2.1) },
  { face: 'front', pts: rectZ(4.01, -1.1, 0.9, 1.5, 1.3) },
  { face: 'front', pts: rectZ(4.01, 1.6, 0.9, 1.5, 1.3) },
  { face: 'front', pts: rectZ(4.01, 4.2, 0.9, 1.5, 1.3) },
  { face: 'gR', pts: rectX(6.01, 0, 1.0, 1.4, 1.3) },
  { face: 'gR', pts: rectX(6.01, 0, 3.55, 0.7, 0.7) },
  { face: 'back', pts: rectZ(-4.01, -2, 0.9, 1.5, 1.3) },
  { face: 'back', pts: rectZ(-4.01, 2, 0.9, 1.5, 1.3) },
  { face: 'gL', pts: rectX(-6.01, 0, 1.0, 1.4, 1.3) },
];
function rectZ(z, xc, y0, w, h) { return [V(xc - w / 2, y0, z), V(xc + w / 2, y0, z), V(xc + w / 2, y0 + h, z), V(xc - w / 2, y0 + h, z)]; }
function rectX(x, zc, y0, w, h) { return [V(x, y0, zc - w / 2), V(x, y0, zc + w / 2), V(x, y0 + h, zc + w / 2), V(x, y0 + h, zc - w / 2)]; }

// dust motes for parallax
const DUST = [];
{ const R = rng(42); for (let i = 0; i < 70; i++) DUST.push({ p: V((R() * 2 - 1) * 15, 0.3 + R() * 9, (R() * 2 - 1) * 13), s: 0.6 + R() * 1.6, ph: R() * TAU, a: 0.25 + R() * 0.55 }); }

// ───────────────────────────── drawing primitives
function path(pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); }
function fillPoly(pts, col, a = 1) { ctx.globalAlpha = a; ctx.fillStyle = typeof col === 'string' ? col : rgba(col); path(pts); ctx.fill(); }
function line(a, b, col, w = 2, alpha = 1) { ctx.globalAlpha = alpha; ctx.strokeStyle = typeof col === 'string' ? col : rgba(col); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function glowLine(a, b, col, w, alpha) {
  ctx.lineCap = 'round';
  line(a, b, col, w * 4.5, alpha * 0.10);
  line(a, b, col, w * 2.2, alpha * 0.22);
  line(a, b, col, w, alpha);
}
function rrect(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

const FONT = { d: (w, s) => `${w} ${s}px IDisp`, m: (w, s) => `${w} ${s}px JBM` };
const _lay = new Map();
function charLayout(font, str, track = 0) {
  const key = font + '|' + str + '|' + track;
  let r = _lay.get(key); if (r) return r;
  // glyph i sits at width(str[0..i]) - advance(str[i]): keeps the pair kerning (e.g. "Te") intact
  ctx.save(); ctx.font = font; ctx.letterSpacing = '0px';
  const xs = [], ws = [];
  for (let i = 0; i < str.length; i++) {
    const adv = ctx.measureText(str[i]).width;
    ws.push(adv); xs.push(ctx.measureText(str.slice(0, i + 1)).width - adv + i * track);
  }
  const w = ctx.measureText(str).width + Math.max(0, str.length - 1) * track;
  ctx.restore();
  r = { xs, ws, w }; _lay.set(key, r); return r;
}
function text(str, x, y, font, col, a = 1, o = {}) {
  if (a <= 0.001 || !str) return;
  ctx.save(); ctx.font = font; ctx.letterSpacing = (o.track || 0) + 'px'; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
  ctx.globalAlpha = a; ctx.fillStyle = typeof col === 'string' ? col : rgba(col); ctx.fillText(str, x, y); ctx.restore();
}
// per-letter animated text. fn(i,n) -> {dx,dy,r,s,a,col}
function letters(str, x, y, font, size, col, fn, track = 0) {
  const L = charLayout(font, str, track);
  const piv = -size * 0.36;
  ctx.save(); ctx.font = font; ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]; if (ch === ' ') continue;
    const s = fn(i, str.length); if (!s || s.a <= 0.001) continue;
    const cw = L.ws[i];
    ctx.save();
    ctx.globalAlpha = s.a ?? 1;
    ctx.fillStyle = rgba(s.col || col);
    ctx.translate(x + L.xs[i] + cw / 2 + (s.dx || 0), y + (s.dy || 0) + piv);
    if (s.r) ctx.rotate(s.r);
    if (s.s !== undefined && s.s !== 1) ctx.scale(s.s, s.s);
    ctx.fillText(ch, -cw / 2, -piv);
    ctx.restore();
  }
  ctx.restore();
  return L;
}
function chip(str, x, y, a, o = {}) {
  if (a <= 0.001) return;
  const font = FONT.m(600, o.size || 18);
  const L = charLayout(font, str, 1.5);
  const pw = 11, ph = 7, h = (o.size || 18) + ph * 2;
  let bx = x - (L.w + pw * 2) / 2, by = y - h / 2;
  ctx.save(); ctx.globalAlpha = a;
  rrect(bx, by, L.w + pw * 2, h, 5); ctx.fillStyle = rgba(P.ink, 0.88); ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(P.tealHi, 0.55); ctx.stroke();
  ctx.restore();
  text(str, bx + pw, y + 1, font, o.col || P.tealHi, a, { track: 1.5, base: 'middle' });
}
function marker(p, t, t0, big) {
  const k = seg(t, t0, t0 + 0.24); if (k <= 0) return;
  const ga = ctx.globalAlpha;
  const s = E.outBack(k, 2.2) * (big ? 1.3 : 1);
  ctx.save(); ctx.translate(p.x, p.y);
  const rk = seg(t, t0, t0 + 0.55);
  if (rk < 1) { ctx.globalAlpha = (1 - rk) * 0.9 * ga; ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 6 + E.outCubic(rk) * (big ? 46 : 28), 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = ga; ctx.scale(s, s);
  ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-7, 0); ctx.moveTo(7, 0); ctx.lineTo(12, 0); ctx.moveTo(0, -12); ctx.lineTo(0, -7); ctx.moveTo(0, 7); ctx.lineTo(0, 12); ctx.stroke();
  ctx.fillStyle = rgba(P.ink); ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba(P.tealHi); ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fill();
  ctx.restore();
}

// ───────────────────────────── layers
let GRID = null, VIGN = null, NOISE = [];
function buildStatic() {
  GRID = document.createElement('canvas'); GRID.width = W; GRID.height = H;
  const g = GRID.getContext('2d');
  for (let x = W / 2 % 40; x < W; x += 40) { const major = Math.round((x - W / 2) / 40) % 5 === 0; g.fillStyle = major ? 'rgba(120,170,220,0.10)' : 'rgba(120,170,220,0.045)'; g.fillRect(Math.round(x), 0, 1, H); }
  for (let y = H / 2 % 40; y < H; y += 40) { const major = Math.round((y - H / 2) / 40) % 5 === 0; g.fillStyle = major ? 'rgba(120,170,220,0.10)' : 'rgba(120,170,220,0.045)'; g.fillRect(0, Math.round(y), W, 1); }
  VIGN = document.createElement('canvas'); VIGN.width = W; VIGN.height = H;
  const v = VIGN.getContext('2d');
  const vg = v.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,3,10,0.62)');
  v.fillStyle = vg; v.fillRect(0, 0, W, H);
  const R = rng(99);
  for (let k = 0; k < 4; k++) {
    const n = document.createElement('canvas'); n.width = 256; n.height = 256;
    const nx = n.getContext('2d'); const id = nx.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const g1 = (R() + R() + R() - 1.5) * 90; const val = clamp(128 + g1, 0, 255); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = val; id.data[i * 4 + 3] = 255; }
    nx.putImageData(id, 0, 0); NOISE.push(n);
  }
}

function drawBG(t) {
  const warm = seg(t, 7.6, 8.6) * (1 - seg(t, 11.0, 11.8));
  const g = ctx.createRadialGradient(W * 0.56, H * 0.46, 40, W * 0.5, H * 0.5, W * 0.8);
  g.addColorStop(0, rgba(mix(P.bgA, hex('#1a2c4a'), warm * 0.6))); g.addColorStop(1, rgba(P.bgB));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (warm > 0) {
    const s = pr(V(0, 2.5, 0));
    const wg = ctx.createRadialGradient(s.x, s.y, 10, s.x, s.y, 700);
    wg.addColorStop(0, rgba(P.warm, 0.07 * warm)); wg.addColorStop(1, rgba(P.warm, 0));
    ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
  }
  const ga = seg(t, 0.0, 0.7) * (1 - 0.75 * seg(t, 1.5, 2.6)) + 0.75 * seg(t, 12.3, 13.2) * 0.8;
  if (ga > 0) { ctx.globalAlpha = ga; ctx.drawImage(GRID, 0, 0); ctx.globalAlpha = 1; }
}

function drawGround(t) {
  const a = seg(t, 1.75, 2.7) * (1 - seg(t, 10.9, 11.6));
  if (a <= 0) return;
  ctx.lineWidth = 1;
  const S = 2, N = 11, M = 14;
  for (let k = 0; k < 2; k++) for (let i = -N; i <= N; i++) {
    const c = i * S;
    for (let j = 0; j < M; j++) {
      const u0 = -22 + 44 * j / M, u1 = -22 + 44 * (j + 1) / M;
      const A = k ? V(c, 0, u0) : V(u0, 0, c), B = k ? V(c, 0, u1) : V(u1, 0, c);
      const mid = vlerp(A, B, 0.5);
      const d = Math.hypot(mid.x, mid.z);
      const fall = Math.pow(clamp(1 - d / 22), 1.6);
      if (fall <= 0) continue;
      const sgm = prSeg(A, B); if (!sgm) continue;
      const major = i % 3 === 0;
      line(sgm[0], sgm[1], major ? [90, 150, 205] : [80, 130, 185], 1, a * fall * (major ? 0.32 : 0.17));
    }
  }
  ctx.globalAlpha = 1;
}

function drawDust(t) {
  const a = seg(t, 1.8, 3.0) * (1 - seg(t, 10.8, 11.5));
  if (a <= 0) return;
  ctx.fillStyle = rgba(P.mint);
  for (const d of DUST) {
    const p = V(d.p.x + Math.sin(t * 0.4 + d.ph) * 0.5, d.p.y + ((t * 0.12 + d.ph) % 1) * 0.6, d.p.z);
    const c = toCam(p); if (c.z < 1) continue;
    const s = c2s(c);
    const r = clamp(d.s * 14 / c.z, 0.4, 3.2);
    ctx.globalAlpha = a * d.a * clamp(r / 2.5) * 0.7;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// soft ground shadow via low-res blurred buffer
let SH1, SH2;
function hull(pts) {
  pts = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function drawShadow(t) {
  const a = seg(t, 4.1, 4.7) * (1 - seg(t, 11.3, 11.65));
  if (a <= 0) return;
  if (!SH1) { SH1 = document.createElement('canvas'); SH1.width = 480; SH1.height = 270; SH2 = document.createElement('canvas'); SH2.width = 480; SH2.height = 270; }
  const s1 = SH1.getContext('2d'), s2 = SH2.getContext('2d');
  s1.setTransform(1, 0, 0, 1, 0, 0); s1.clearRect(0, 0, 480, 270); s1.setTransform(0.25, 0, 0, 0.25, 0, 0);
  const pts3 = [];
  const top = [V(-6.3, EY, 4.45), V(6.3, EY, 4.45), V(-6.3, EY, -4.45), V(6.3, EY, -4.45), V(-6.3, RH, 0), V(6.3, RH, 0)];
  for (const p of top) { const k = p.y * FOLD / LIGHT.y; pts3.push(V(p.x - LIGHT.x * k, 0, p.z - LIGHT.z * k)); }
  for (const p of [gR[0], gR[1], gL[0], gL[1]]) pts3.push(p);
  const h = hull(pts3.map(pr));
  s1.fillStyle = 'rgba(0,0,0,0.55)'; s1.beginPath(); s1.moveTo(h[0].x, h[0].y); for (const p of h) s1.lineTo(p.x, p.y); s1.closePath(); s1.fill();
  // contact shadow
  const fp = [V(-6.4, 0, 4.4), V(6.4, 0, 4.4), V(6.4, 0, -4.4), V(-6.4, 0, -4.4)].map(pr);
  s1.fillStyle = 'rgba(0,0,0,0.6)'; s1.beginPath(); s1.moveTo(fp[0].x, fp[0].y); for (const p of fp) s1.lineTo(p.x, p.y); s1.closePath(); s1.fill();
  s2.clearRect(0, 0, 480, 270); s2.filter = 'blur(5px)'; s2.drawImage(SH1, 0, 0); s2.filter = 'none';
  ctx.globalAlpha = a; ctx.drawImage(SH2, 0, 0, W, H); ctx.globalAlpha = 1;
}

// shading helper
function shadeN(n, base, toCam, specK = 0.3) {
  const d = Math.max(0, vdot(n, LIGHT));
  let k = 0.42 + 0.72 * d;
  const r = vsub(vmul(n, 2 * vdot(n, LIGHT)), LIGHT);
  const sp = Math.pow(Math.max(0, vdot(r, toCam)), 22) * specK;
  return { c: scl(base, k), sp };
}

function drawWalls(t, a) {
  const faces = [
    { f: 'gL', pts: gL }, { f: 'back', pts: [gR[1], gL[1], gL[2], gR[2]] },
    { f: 'gR', pts: gR }, { f: 'front', pts: [gL[0], gR[0], gR[4], gL[4]] },
  ];
  const lightsOn = t >= 7.5 ? 1 : 0;
  for (const fc of faces) {
    if (!facing(fc.f)) continue;
    const n = FACES[fc.f].n;
    const d = Math.max(0, vdot(n, LIGHT));
    const dusk = seg(t, 7.5, 8.3) * (1 - seg(t, 11.0, 11.6));
    const col = scl(mix(P.wallShade, P.wallLit, 0.18 + 0.82 * d), 1 - 0.36 * dusk);
    const sp = fc.pts.map(pr);
    fillPoly(sp, col, a);
    // subtle vertical gradient for AO near ground
    const yb = Math.max(...sp.map(p => p.y)), yt = Math.min(...sp.map(p => p.y));
    const g = ctx.createLinearGradient(0, yb, 0, yt);
    g.addColorStop(0, 'rgba(5,15,30,0.38)'); g.addColorStop(0.35, 'rgba(5,15,30,0)');
    ctx.globalAlpha = a; ctx.fillStyle = g; path(sp); ctx.fill();
    // windows
    for (let wi = 0; wi < WINDOWS.length; wi++) {
      const w = WINDOWS[wi]; if (w.face !== fc.f) continue;
      const wp = w.pts.map(pr);
      // frame
      fillPoly(wp, scl(col, 1.08), a);
      const c = V((w.pts[0].x + w.pts[2].x) / 2, (w.pts[0].y + w.pts[2].y) / 2, (w.pts[0].z + w.pts[2].z) / 2);
      const inset = w.pts.map(p => vlerp(p, c, 0.13));
      const ip = inset.map(pr);
      const on = windowLight(t, wi);
      fillPoly(ip, mix(P.ink, P.warm, on), a);
      if (on > 0) { const yb = Math.max(...ip.map(p => p.y)), yt = Math.min(...ip.map(p => p.y)); const wg = ctx.createLinearGradient(0, yt, 0, yb); wg.addColorStop(0, rgba([255, 226, 160], 0.55 * on)); wg.addColorStop(1, rgba([255, 140, 40], 0.25 * on)); ctx.fillStyle = wg; path(ip); ctx.fill(); }
      if (on > 0) {
        // mullion
        const m0 = pr(vlerp(inset[0], inset[1], 0.5)), m1 = pr(vlerp(inset[3], inset[2], 0.5));
        line(m0, m1, scl(col, 0.9), 2, a * 0.8);
      }
    }
  }
  ctx.globalAlpha = 1;
}
function windowLight(t, i) {
  const t0 = 7.55 + i * 0.045;
  if (t < t0) return 0;
  const d = t - t0;
  const flick = d < 0.12 ? (Math.sin(d * 140) > 0 ? 0.85 : 0.25) : 1;
  return flick * seg(t, t0, t0 + 0.05) * (1 - seg(t, 11.55, 11.85));
}
function drawWindowGlow(t) {
  if (t < 7.55 || t > 11.9) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < WINDOWS.length; i++) {
    const w = WINDOWS[i]; if (!facing(w.face)) continue;
    let on = windowLight(t, i); if (on <= 0) continue;
    const F = FACES[w.face];
    on *= clamp(vdot(F.n, vnorm(vsub(CAM.pos, F.p))) * 1.6) * (1 - seg(t, 11.05, 11.45));
    if (on <= 0.01) continue;
    const c = pr(V((w.pts[0].x + w.pts[2].x) / 2, (w.pts[0].y + w.pts[2].y) / 2, (w.pts[0].z + w.pts[2].z) / 2));
    const r = 22 * CAM.scale / 20;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 4);
    g.addColorStop(0, rgba(P.warm, 0.13 * on)); g.addColorStop(1, rgba(P.warm, 0));
    ctx.fillStyle = g; ctx.fillRect(c.x - r * 4, c.y - r * 4, r * 8, r * 8);
  }
  ctx.restore();
}

function drawRoof(t) {
  const deckA = seg(t, 4.12, 4.4);
  if (deckA <= 0) return;
  const toC = pl => vnorm(vsub(CAM.pos, planePt(pl, LU / 2, LV / 2)));
  const order = PLANES.map((pl, i) => ({ pl, i, d: vlen(vsub(CAM.pos, planePt(pl, LU / 2, LV / 2))) })).sort((a, b) => b.d - a.d);
  const sweepU = lerp(-4, LU + 4, EZ.inOut(seg(t, 7.55, 8.4)));
  const sweepOn = t > 7.55 && t < 8.45;
  for (const { pl, i } of order) {
    if (!facing(pl.face)) continue;
    const tc = toC(pl);
    // underlay deck
    const deck = [planePt(pl, 0, 0), planePt(pl, LU, 0), planePt(pl, LU, LV), planePt(pl, 0, LV)].map(pr);
    fillPoly(deck, [16, 27, 43], deckA);
    // battens
    ctx.lineCap = 'butt';
    for (let r = 0; r < NR; r++) {
      const k = EZ.out(seg(t, 4.18 + r * 0.022, 4.42 + r * 0.022)); if (k <= 0) continue;
      const v = r * TH + TH * 0.78;
      const a0 = pr(planePt(pl, 0, v, 0.02)), a1 = pr(planePt(pl, LU * k, v, 0.02));
      line(a0, a1, P.wood, Math.max(1.2, CAM.scale * 0.045), 0.9);
    }
    // tiles (ridge -> eave so protruding flips overlap correctly)
    for (let r = NR - 1; r >= 0; r--) for (let c = 0; c < NC; c++) {
      const tl = TILES[i * NR * NC + r * NC + c];
      drawTile(tl, pl, t, tc, sweepOn ? sweepU : -99);
    }
    // ridge cap
    const rk = EZ.out(seg(t, 5.15, 5.45));
    if (rk > 0) {
      const st = tileState(TILES[i * NR * NC + (NR - 1) * NC + 12], t);
      const m = MATS[st.p < 0.5 ? st.from : st.to];
      const x0 = LU / 2 - LU / 2 * rk, x1 = LU / 2 + LU / 2 * rk;
      const q = [planePt(pl, x0, LV - 0.32, 0.1), planePt(pl, x1, LV - 0.32, 0.1), planePt(pl, x1, LV + 0.02, 0.16), planePt(pl, x0, LV + 0.02, 0.16)].map(pr);
      fillPoly(q, scl(m.base, 0.78), 1);
      const ql = [planePt(pl, x0, LV - 0.32, 0.1), planePt(pl, x1, LV - 0.32, 0.1), planePt(pl, x1, LV - 0.28, 0.02), planePt(pl, x0, LV - 0.28, 0.02)].map(pr);
      fillPoly(ql, scl(m.base, 0.4), 1);
    }
    // eave fascia
    const f = [planePt(pl, 0, 0, 0), planePt(pl, LU, 0, 0), planePt(pl, LU, 0, -0.24), planePt(pl, 0, 0, -0.24)].map(pr);
    fillPoly(f, [24, 34, 50], deckA);
  }
  // rake / barge boards on visible gable ends
  for (const sx of [1, -1]) {
    const gf = sx > 0 ? 'gR' : 'gL';
    if (!facing(gf)) continue;
    const x = sx * (L2 + RK);
    const pts = [V(x, EY, 4.45), V(x, RH + 0.03, 0), V(x, EY, -4.45), V(x, EY - 0.26, -4.45), V(x, RH - 0.25, 0), V(x, EY - 0.26, 4.45)].map(pr);
    fillPoly(pts, [22, 32, 48], deckA);
  }
  ctx.globalAlpha = 1;
}

function drawTile(tl, pl, t, toC, sweepU) {
  const lp = seg(t, tl.lay, tl.lay + 0.26);
  if (lp <= 0) return;
  const st = tileState(tl, t);
  const flipE = EZ.inOut(st.p);
  const mi = st.p < 0.5 ? st.from : st.to;
  const m = MATS[mi];
  const eL = E.outBack(lp, 1.3);
  const th = Math.PI * flipE + (-0.75) * (1 - eL);
  const lift = Math.sin(Math.PI * st.p) * 0.28 + 1.9 * (1 - eL);
  const ct = Math.cos(th), sn = Math.sin(th);
  const Vr = vadd(vmul(pl.Vd, ct), vmul(pl.N, sn));
  let Nr = vsub(vmul(pl.N, ct), vmul(pl.Vd, sn));
  const u0 = tl.c * TW, u1 = u0 + TW;
  const inset = mi === 0 ? 0.0 : 0.012;
  const hu = TW / 2 - inset, hv = TH / 2 + (mi === 0 ? 0.01 : 0.02);
  const cen = planePt(pl, (u0 + u1) / 2, tl.r * TH + TH / 2 + (1 - eL) * 0.35, 0.03 + lift);
  if (vdot(Nr, toC) < 0) Nr = vmul(Nr, -1);
  const sh = shadeN(Nr, m.base, toC, m.spec);
  let col = scl(sh.c, 1 + tl.vr * m.vr);
  if (mi === 1) col = mix(col, scl(hex('#9a3f22'), 1 + tl.vr2 * 0.1), clamp(tl.vr2 * 0.6) * 0.5);
  let boost = sh.sp;
  if (sweepU > -50) boost += 0.55 * Math.exp(-((((u0 + u1) / 2 - sweepU) / 1.1) ** 2)) * (pl.face === 'roofF' ? 1 : 0.5);
  if (boost > 0) col = mix(col, [255, 250, 240], clamp(boost));
  const raise = mi === 0 ? (tl.r % 3 === 0 ? 0.035 : 0) : (mi === 1 ? 0.07 : 0.075);
  const P0 = (su, sv, lifted) => pr(vadd(vadd(vadd(cen, vmul(pl.U, su)), vmul(Vr, sv)), vmul(Nr, lifted ? raise : 0)));
  const a = seg(lp, 0, 0.3);
  const lo0 = P0(-hu, -hv, 1), lo1 = P0(hu, -hv, 1), up1 = P0(hu, hv, 0), up0 = P0(-hu, hv, 0);
  // butt face
  if (raise > 0) { const b0 = P0(-hu, -hv, 0), b1 = P0(hu, -hv, 0); fillPoly([lo0, lo1, b1, b0], scl(col, 0.32), a); }
  fillPoly([lo0, lo1, up1, up0], col, a);
  // profile strips
  const strip = (f0, f1, k) => {
    const s0 = -hu + 2 * hu * f0, s1 = -hu + 2 * hu * f1;
    fillPoly([P0(s0, -hv, 1), P0(s1, -hv, 1), P0(s1, hv, 0), P0(s0, hv, 0)], scl(col, k), a);
  };
  if (mi === 0) { for (let k = 0; k < 6; k++) if (k % 2) strip(k / 6, (k + 1) / 6, 0.8); }
  else if (mi === 1) { strip(0.52, 1, 0.74); strip(0.1, 0.26, 1.12); }
  else { strip(0.44, 0.54, 0.7); strip(0.54, 1, 0.9); }
  // shadow band cast by the tile above
  if (raise > 0.04 && tl.r < NR - 1 && st.p === 0) {
    const tb = [P0(-hu, hv - 0.09, 0), P0(hu, hv - 0.09, 0), up1, up0];
    fillPoly(tb, [0, 0, 0], a * 0.28);
  }
}

function drawWire(t) {
  const back = seg(t, 11.42, 11.72);
  const a = Math.max(1 - seg(t, 4.15, 4.7), back) * (1 - seg(t, 12.04, 12.12));
  if (a <= 0) return;
  const hidA = seg(t, 1.6, 2.2) * (1 - back);
  ctx.lineCap = 'round';
  for (const e of EDGES) {
    let k = seg(t, e.t[0], e.t[1]); if (k <= 0) continue;
    k = e.acc ? E.inQuad(k) : EZ.out(k);
    const vis = facing(e.f[0]) || facing(e.f[1]);
    const s = prSeg(e.a, vlerp(e.a, e.b, k)); if (!s) continue;
    if (vis) glowLine(s[0], s[1], P.tealHi, 2.2, a * 0.95);
    else if (hidA > 0) { ctx.setLineDash([7, 8]); line(s[0], s[1], P.tealHi, 1.4, a * 0.32 * hidA); ctx.setLineDash([]); }
  }
  const ma = 1 - seg(t, 2.85, 3.1);
  if (ma > 0) { ctx.save(); ctx.globalAlpha = ma; for (const m of MARKERS) marker(pr(m.p), t, m.t, m.big); ctx.restore(); }
  ctx.globalAlpha = 1;
}

// chalk line: the first stroke. Lives at x=6,y=0 along z.
function drawChalk(t) {
  const fold = t > 11.5;
  let half, bright, vibT0;
  if (!fold) {
    half = 10.5 * EZ.out(seg(t, 0.38, 0.6));
    bright = 1 - 0.85 * seg(t, 1.9, 3.0);
    vibT0 = 0.5;
    if (t > 4.2) return;
  } else {
    half = 10.5 * (1 - E.inExpo(seg(t, 12.08, 12.34)));
    bright = seg(t, 11.72, 11.92);
    vibT0 = 11.98;
  }
  // seed dot
  const dotA = fold ? (t < 12.36 ? 1 : 0) : seg(t, 0.16, 0.24);
  const c = pr(V(6, 0, 0));
  if (dotA > 0 && half < 0.3 && t < 12.36) {
    const r = fold ? 5 : 5 * E.outBack(seg(t, 0.16, 0.3), 3);
    ctx.globalAlpha = dotA; ctx.fillStyle = rgba(P.tealHi); ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0, r), 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.25 * dotA; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0, r) * 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (half < 0.02 || bright <= 0) return;
  const s = prSeg(V(6, 0, -half), V(6, 0, half)); if (!s) return;
  const [A, B] = s;
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const tv = t - vibT0;
  const amp = tv > 0 ? 15 * Math.exp(-tv * 5.5) * Math.sin(tv * TAU * 10.5) : 0;
  const pts = [];
  for (let i = 0; i <= 48; i++) { const u = i / 48; const o = amp * Math.sin(Math.PI * u) + (amp * 0.35) * Math.sin(2 * Math.PI * u) * Math.cos(tv * 50); pts.push({ x: A.x + dx * u + nx * o, y: A.y + dy * u + ny * o }); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, al] of [[9, 0.1], [4.5, 0.22], [2.2, 1]]) {
    ctx.globalAlpha = al * bright; ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts) ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  // chalk dust puff on the snap
  if (!fold && tv > 0 && tv < 0.7) {
    const R = rng(5);
    ctx.fillStyle = rgba(P.mint);
    for (let i = 0; i < 46; i++) {
      const u = R(); const px = A.x + dx * u, py = A.y + dy * u;
      const sp = 30 + R() * 90, dir = (R() < 0.5 ? -1 : 1);
      const k = E.outCubic(tv / 0.7);
      ctx.globalAlpha = (1 - tv / 0.7) * 0.55 * R();
      ctx.beginPath(); ctx.arc(px + (R() - 0.5) * 40 * k, py + dir * sp * k * 0.6, 1 + R() * 1.6, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawAnnotations(t) {
  const out = 1 - seg(t, 2.95, 3.2);
  if (out <= 0) return;
  // pitch angle at gR[4] (in gable plane)
  const ak = EZ.out(seg(t, 1.02, 1.34));
  if (ak > 0) {
    const c3 = gR[4];
    const refEnd = vadd(c3, V(0, 0, -2.6 * EZ.out(seg(t, 1.0, 1.2))));
    const s = prSeg(c3, refEnd);
    if (s) { ctx.setLineDash([6, 6]); line(s[0], s[1], P.tealHi, 1.4, 0.7 * out); ctx.setLineDash([]); }
    const R = 1.55, pts = [];
    for (let i = 0; i <= 24; i++) { const a = (30 * DEG) * ak * i / 24; pts.push(pr(V(6, EH + R * Math.sin(a), 4 - R * Math.cos(a)))); }
    ctx.globalAlpha = out; ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts) ctx.lineTo(p.x, p.y); ctx.stroke();
    const lp = pr(V(6, EH + 2.25 * Math.sin(13 * DEG), 4 - 2.25 * Math.cos(13 * DEG)));
    const deg = Math.round(30 * EZ.out(seg(t, 1.06, 1.4)));
    chip(`${deg}°`, lp.x, lp.y, seg(t, 1.1, 1.22) * out);
  }
  // width dimension: hinges from vertical (below ground) to flat on the ground during orbit
  const wk = EZ.out(seg(t, 1.1, 1.45));
  if (wk > 0) {
    const th = EZ.inOut(seg(t, 1.55, 2.5)) * 90 * DEG;
    const off = d => V(6 + d * Math.sin(th), -d * Math.cos(th), 0);
    const P3 = (z, d) => vadd(off(d), V(0, 0, z));
    const zA = 4, zB = 4 - 8 * wk;
    // extension lines
    for (const z of [4, -4]) { if (z === -4 && wk < 0.98) continue; const s = prSeg(P3(z, 0.18), P3(z, 1.15)); if (s) line(s[0], s[1], P.tealHi, 1.2, 0.6 * out); }
    const s = prSeg(P3(zA, 0.85), P3(zB, 0.85)); if (s) line(s[0], s[1], P.tealHi, 1.8, out);
    // ticks
    for (const z of [zA, zB]) { const p = pr(P3(z, 0.85)); ctx.globalAlpha = out; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 6, p.y + 6); ctx.lineTo(p.x + 6, p.y - 6); ctx.stroke(); }
    const mid = pr(P3(0, 0.85));
    const val = (8 * EZ.out(seg(t, 1.1, 1.5))).toFixed(1).replace('.', ',');
    chip(`B ${val} m`, mid.x, mid.y + 26 * Math.cos(th) + 2, seg(t, 1.15, 1.3) * out);
  }
  // length dimension along the front ground edge
  const lk = EZ.out(seg(t, 2.25, 2.75));
  if (lk > 0) {
    const zz = 5.3;
    for (const x of [6, -6]) { if (x === -6 && lk < 0.98) continue; const s = prSeg(V(x, 0, 4.25), V(x, 0, zz + 0.3)); if (s) line(s[0], s[1], P.tealHi, 1.2, 0.6 * out); }
    const s = prSeg(V(6, 0, zz), V(6 - 12 * lk, 0, zz)); if (s) line(s[0], s[1], P.tealHi, 1.8, out);
    for (const x of [6, 6 - 12 * lk]) { const p = pr(V(x, 0, zz)); ctx.globalAlpha = out; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 6, p.y + 6); ctx.lineTo(p.x + 6, p.y - 6); ctx.stroke(); }
    const mid = pr(V(0, 0, zz + 0.9));
    const val = (12 * EZ.out(seg(t, 2.25, 2.8))).toFixed(1).replace('.', ',');
    chip(`L ${val} m`, mid.x, mid.y + 6, seg(t, 2.3, 2.45) * out);
  }
  ctx.globalAlpha = 1;
}

// inspection scan: a slicing plane that reveals the house section
function drawScan(t) {
  const k = seg(t, 2.5, 3.15); if (k <= 0 || k >= 1) return;
  const x = lerp(8.5, -8.5, EZ.inOut(k));
  const fade = Math.sin(Math.PI * k);
  const q = [V(x, -0.1, -6), V(x, -0.1, 6), V(x, 6.6, 6), V(x, 6.6, -6)].map(pr);
  const g = ctx.createLinearGradient(q[0].x, q[0].y, q[2].x, q[2].y);
  ctx.globalAlpha = 0.09 * fade; ctx.fillStyle = rgba(P.tealHi); path(q); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  line(q[0], q[1], P.tealHi, 1, 0.4 * fade); line(q[3], q[2], P.tealHi, 1, 0.4 * fade);
  if (Math.abs(x) <= 6) {
    const sec = [V(x, 0, 4), V(x, 0, -4), V(x, EH, -4), V(x, RH, 0), V(x, EH, 4)].map(pr);
    ctx.globalAlpha = 0.16 * fade; ctx.fillStyle = rgba(P.tealHi); path(sec); ctx.fill();
    ctx.globalAlpha = fade; ctx.strokeStyle = rgba(P.mint); ctx.lineWidth = 2.4; path(sec); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Tilbud: roof area hatch + callout
function drawHatch(t) {
  const a = seg(t, 3.0, 3.22) * (1 - seg(t, 4.3, 4.6));
  if (a <= 0) return;
  const pl = PLANES[0]; if (!facing(pl.face)) return;
  const q = [planePt(pl, 0.3, 0), planePt(pl, LU - 0.3, 0), planePt(pl, LU - 0.3, LV), planePt(pl, 0.3, LV)].map(pr);
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sweep = lerp(x0 - 20, x1 + 20, EZ.out(seg(t, 3.0, 3.45)));
  ctx.save(); path(q); ctx.clip();
  ctx.beginPath(); ctx.rect(x0 - 10, y0 - 10, sweep - x0 + 10, y1 - y0 + 20); ctx.clip();
  ctx.globalAlpha = 0.14 * a; ctx.fillStyle = rgba(P.tealHi); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = 1.2;
  ctx.beginPath(); for (let x = x0 - (y1 - y0); x < x1; x += 15) { ctx.moveTo(x, y1); ctx.lineTo(x + (y1 - y0), y0); } ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = a; ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = 2; path(q); ctx.stroke(); ctx.globalAlpha = 1;
}

const COL_X = 150;
function drawCallout(t) {
  if (t < 3.0 || t > 4.56) return;
  const ex = EZ.in(seg(t, 4.3, 4.52));
  const a = 1 - E.inQuad(ex);
  const dy = -70 * ex;
  const y0 = 392 + dy;
  // leader line
  const anc = pr(planePt(PLANES[0], LU * 0.42, LV * 0.5, 0.1));
  const lk = EZ.out(seg(t, 3.05, 3.35)) * (1 - ex);
  const elbow = { x: 760, y: y0 + 120 };
  if (lk > 0) {
    const pts = [anc, { x: anc.x - 70, y: elbow.y }, elbow];
    const L1 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), L2_ = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
    let rem = lk * (L1 + L2_);
    ctx.globalAlpha = a; ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    const k1 = Math.min(1, rem / L1); ctx.lineTo(lerp(pts[0].x, pts[1].x, k1), lerp(pts[0].y, pts[1].y, k1)); rem -= L1;
    if (rem > 0) { const k2 = rem / L2_; ctx.lineTo(lerp(pts[1].x, pts[2].x, k2), lerp(pts[1].y, pts[2].y, k2)); }
    ctx.stroke();
    marker(anc, t, 3.05, false);
  }
  // label
  const la = seg(t, 3.12, 3.3) * a;
  ctx.fillStyle = rgba(P.tealHi); ctx.globalAlpha = la; ctx.fillRect(COL_X, y0 - 13, 10, 10); ctx.globalAlpha = 1;
  text('TAGFLADE', COL_X + 22, y0 - 3, FONT.m(600, 17), P.muted2, la, { track: 4 });
  // formula typed
  const f = '12,0 × 8,0 ÷ cos 30°';
  const n = Math.floor(f.length * seg(t, 3.16, 3.5));
  text(f.slice(0, n), COL_X, y0 + 46, FONT.m(500, 26), P.paper, 0.85 * a);
  if (t < 3.75) { const L = charLayout(FONT.m(500, 26), f.slice(0, n)); if (Math.floor(t * 8) % 2 === 0 || n < f.length) { ctx.globalAlpha = a; ctx.fillStyle = rgba(P.tealHi); ctx.fillRect(COL_X + L.w + 4, y0 + 24, 13, 27); ctx.globalAlpha = 1; } }
  // counter (tabular digits, dim leading zeros)
  const ck = EZ.out(seg(t, 3.32, 3.92));
  if (t >= 3.3) {
    const val = 110.9 * ck;
    const s = val.toFixed(1).padStart(5, '0').replace('.', ',');
    const font = FONT.d(700, 150);
    const dw = charLayout(font, '0').w, cw = charLayout(font, ',').w;
    let x = COL_X - 6; const yb = y0 + 196;
    let lead = true;
    const ca = seg(t, 3.3, 3.42) * a;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch !== '0' && ch !== ',') lead = false;
      if (i >= 2) lead = false;
      const w = ch === ',' ? cw : dw;
      text(ch, x + w / 2, yb, font, P.paper, (lead ? 0.16 : 1) * ca, { align: 'center' });
      x += w;
    }
    text('m²', x + 14, yb, FONT.d(600, 64), P.tealHi, ca);
  }
  // stamp
  const sk = seg(t, 4.0, 4.32);
  if (sk > 0) {
    const s = lerp(1.9, 1, E.outBack(sk, 2.4));
    const r = lerp(-12, -3, EZ.out(sk)) * DEG;
    const sx = COL_X + 158, sy = y0 + 262;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(r); ctx.scale(s, s); ctx.globalAlpha = seg(t, 4.0, 4.08) * a;
    rrect(-158, -32, 316, 64, 32); ctx.fillStyle = rgba(P.teal); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = rgba(P.tealHi, 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(-118, 0, 17, 0, TAU); ctx.fillStyle = rgba(P.paper); ctx.fill();
    ctx.strokeStyle = rgba(P.teal); ctx.lineWidth = 3.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-126, 0); ctx.lineTo(-120, 6); ctx.lineTo(-109, -6); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(r); ctx.scale(s, s);
    text('FAST PRIS', -84, 2, FONT.d(800, 34), P.paper, seg(t, 4.0, 4.08) * a, { track: 3, base: 'middle' });
    ctx.restore();
    const rk = seg(t, 4.0, 4.5);
    if (rk < 1) { ctx.globalAlpha = (1 - rk) * 0.6 * a; ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = 2; rrect(sx - 158 - rk * 40, sy - 32 - rk * 40, 316 + rk * 80, 64 + rk * 80, 32 + rk * 40); ctx.stroke(); ctx.globalAlpha = 1; }
    const s2 = 'EFTER GRATIS BESIGTIGELSE';
    const n2 = Math.floor(s2.length * seg(t, 4.1, 4.32));
    text(s2.slice(0, n2), COL_X + 345, sy + 6, FONT.m(500, 16), P.muted2, a, { track: 3, base: 'middle' });
  }
  ctx.globalAlpha = 1;
}

// Udførelse: material words
function wordSlot(str, x, y, font, size, col, tin, tout, track = 0) {
  if (t_ < tin || t_ > tout + 0.5) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 30, y - size * 1.0, 1400, size * 1.25); ctx.clip();
  letters(str, x, y, font, size, col, (i, n) => {
    const kin = EZ.out(seg(t_, tin + i * 0.035, tin + i * 0.035 + 0.55));
    const kout = EZ.in(seg(t_, tout + i * 0.025, tout + i * 0.025 + 0.24));
    return { dy: (1 - kin) * size * 1.3 - kout * size * 1.3, r: (1 - kin) * 0.12 - kout * 0.06, a: 1 };
  }, track);
  ctx.restore();
}
let t_ = 0;
function drawMaterials(t) {
  if (t < 4.5 || t > 8.0) return;
  t_ = t;
  const lab = 'SPECIALISTER I';
  const la = seg(t, 4.55, 4.7) * (1 - seg(t, 7.42, 7.6));
  const n = Math.floor(lab.length * seg(t, 4.55, 4.85));
  ctx.fillStyle = rgba(P.tealHi); ctx.globalAlpha = la; ctx.fillRect(COL_X, 408, 10, 10); ctx.globalAlpha = 1;
  text(lab.slice(0, n), COL_X + 22, 418, FONT.m(600, 17), P.tealHi, la, { track: 4.5 });
  const SIZE = 172, Y = 590;
  const times = [[4.6, 5.4], [5.5, 6.4], [6.5, 7.42]];
  for (let i = 0; i < 3; i++) {
    wordSlot(MATS[i].name, COL_X - 8, Y, FONT.d(900, SIZE), SIZE, P.paper, times[i][0], times[i][1], -2);
    // index row
    const tin = times[i][0] + 0.12, tout = times[i][1];
    const k = EZ.out(seg(t, tin, tin + 0.4)) - EZ.in(seg(t, tout, tout + 0.2));
    if (t < tin || t > tout + 0.2) continue;
    const off = (1 - EZ.out(seg(t, tin, tin + 0.4))) * 26 - EZ.in(seg(t, tout, tout + 0.2)) * 26;
    ctx.save(); ctx.beginPath(); ctx.rect(COL_X - 10, 652, 900, 50); ctx.clip();
    const yy = 684 + off;
    text(`0${i + 1}`, COL_X, yy, FONT.m(700, 20), P.tealHi, 1);
    text('/ 03', COL_X + 32, yy, FONT.m(500, 20), P.muted, 1);
    rrect(COL_X + 108, yy - 17, 44, 20, 4); ctx.fillStyle = rgba(MATS[i].base); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    text(MATS[i].sub, COL_X + 168, yy, FONT.m(600, 18), P.muted2, 1, { track: 4 });
    ctx.restore();
  }
}

// Aflevering: the headline + spirit level gag
const HL = { x: COL_X, y1: 400, y2: 522, y3: 652, size: 124 };
const CHAOS = [];
{ const R = rng(1234); for (let i = 0; i < 16; i++) CHAOS.push({ dy: (R() * 2 - 1) * 62, r: (R() * 2 - 1) * 0.42, s: 0.82 + R() * 0.36, ph: R() * TAU, fy: -260 - R() * 260, dr: (R() * 2 - 1) * 1.5 }); }
function levelAngle(t) {
  const k = seg(t, 9.12, 10.0);
  return -7.5 * DEG * Math.pow(1 - k, 2) * Math.cos(TAU * 1.55 * (t - 9.12));
}
function drawHeadline(t) {
  if (t < 7.95 || t > 11.6) return;
  const font = FONT.d(900, HL.size);
  const exitK = i => EZ.in(seg(t, 11.0 + i * 0.05, 11.32 + i * 0.05));
  const lineIn = (str, y, t0, idx, col) => {
    ctx.save(); ctx.beginPath(); ctx.rect(HL.x - 30, y - HL.size * 1.02, 1500, HL.size * 1.3); ctx.clip();
    letters(str, HL.x - 6, y, font, HL.size, col, (i, n) => {
      const k = EZ.out(seg(t, t0 + i * 0.028, t0 + i * 0.028 + 0.5));
      return { dy: (1 - k) * HL.size * 1.1 + exitK(idx) * HL.size * 1.15, r: (1 - k) * 0.1, a: 1 };
    }, -2.5);
    ctx.restore();
  };
  lineIn('Nyt tag', HL.y1, 8.0, 0, P.paper);
  lineIn('uden', HL.y2, 8.5, 1, P.paper);
  // line 3: chaos -> order
  const str = 'overraskelser.';
  const snapK = seg(t, 9.86, 10.0);
  const settle = t >= 10 ? spring(t - 10, 3.2, 0.32) : 0;
  const ex = exitK(2);
  if (t >= 9.0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(HL.x - 60, HL.y3 - HL.size * 4, 1500, HL.size * 4 + HL.size * 0.32 + 4 + (1 - ex) * 400); ctx.clip();
    const tilt = levelAngle(t);
    letters(str, HL.x - 6, HL.y3, font, HL.size, P.paper, (i, n) => {
      const c = CHAOS[i];
      const land = E.outBack(seg(t, 9.0 + i * 0.022, 9.0 + i * 0.022 + 0.32), 1.6);
      const jit = Math.sin(t * 21 + c.ph) * 5 + Math.sin(t * 37 + c.ph * 2) * 3;
      const lean = tilt * ((i - n / 2) * 0.9 * HL.size * 0.55);
      let chaos = 1 - EZ.in(snapK);
      let dy = lerp(c.fy, c.dy + jit + lean, land) * chaos;
      let r = (c.r + c.dr * (1 - land) + Math.sin(t * 13 + c.ph) * 0.05) * chaos;
      let s = lerp(1, c.s, chaos);
      if (t >= 10) { const o = 1 - settle; dy = o * (c.dy * 0.35); r = o * c.r * 0.35; s = 1 + o * (c.s - 1) * 0.3; }
      dy += ex * HL.size * 1.2;
      const col = i === n - 1 ? mix(P.paper, P.tealHi, seg(t, 9.96, 10.1)) : P.paper;
      return { dy, r, s, a: seg(t, 9.0 + i * 0.022, 9.06 + i * 0.022), col };
    }, -2.5);
    ctx.restore();
  }
  drawLevel(t, str, font);
  // subline
  const sub = 'Fra første beregning til færdigt tag.';
  const sk = EZ.out(seg(t, 10.18, 10.62));
  if (sk > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(HL.x - 10, HL.y3 + 104, 1200, 60); ctx.clip();
    text(sub, HL.x, HL.y3 + 146 + (1 - sk) * 44 + exitK(3) * 60, FONT.d(500, 36), P.muted2, 1);
    ctx.restore();
  }
}
function drawLevel(t, str, font) {
  if (t < 9.1) return;
  const L = charLayout(font, str, -2.5);
  const wFull = L.w + 20;
  const ex = EZ.in(seg(t, 11.12, 11.42));
  const w = wFull * (1 - ex);
  if (w < 2) return;
  const inK = EZ.out(seg(t, 9.12, 9.6));
  const x = HL.x - 14 + (1 - inK) * -900;
  const y = HL.y3 + 30, h = 46;
  const ang = levelAngle(t);
  const cx = x + wFull / 2;
  ctx.save();
  ctx.translate(cx, y + h / 2); ctx.rotate(ang); ctx.translate(-wFull / 2, -h / 2);
  ctx.globalAlpha = inK;
  // body
  rrect(0, 0, w, h, 9);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(scl(P.teal, 1.35))); g.addColorStop(0.5, rgba(P.teal)); g.addColorStop(1, rgba(scl(P.teal, 0.7)));
  ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(8, 3, Math.max(0, w - 16), 2);
  // end caps
  ctx.fillStyle = rgba(scl(P.teal, 0.55)); rrect(0, 0, 26, h, 9); ctx.fill(); if (w > 60) { rrect(w - 26, 0, 26, h, 9); ctx.fill(); }
  // measure ticks
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x2 = 40; x2 < w - 40; x2 += 18) { const big = Math.round((x2 - 40) / 18) % 5 === 0; ctx.fillRect(x2, h - (big ? 14 : 8), 1.4, big ? 14 : 8); }
  // vial
  if (ex < 0.3) {
    const vw = 190, vh = 28, vx = wFull / 2 - vw / 2, vy = h / 2 - vh / 2;
    rrect(vx - 6, vy - 5, vw + 12, vh + 10, 10); ctx.fillStyle = rgba(scl(P.teal, 0.5)); ctx.fill();
    rrect(vx, vy, vw, vh, 14);
    const vg = ctx.createLinearGradient(0, vy, 0, vy + vh);
    vg.addColorStop(0, 'rgba(210,255,240,0.95)'); vg.addColorStop(1, 'rgba(140,235,210,0.9)');
    ctx.fillStyle = vg; ctx.fill();
    const settled = seg(t, 9.97, 10.05);
    const mk = mix([30, 90, 85], P.teal, settled);
    ctx.fillStyle = rgba(mk);
    const bw = 62;
    ctx.fillRect(wFull / 2 - bw / 2 - 7, vy + 2, 2.5, vh - 4); ctx.fillRect(wFull / 2 + bw / 2 + 4.5, vy + 2, 2.5, vh - 4);
    // bubble: physical-ish lag on the tilt
    const bubbleOff = clamp(-ang / (7.5 * DEG), -1, 1) * (vw / 2 - bw / 2 - 6) + Math.sin(t * 9) * 4 * (1 - seg(t, 9.6, 10.0));
    const bx = wFull / 2 + bubbleOff;
    rrect(bx - bw / 2, vy + 5, bw, vh - 10, 9); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,1)'; rrect(bx - bw / 2 + 8, vy + 7, bw * 0.4, 4, 2); ctx.fill();
    if (t >= 10.0 && t < 10.6) { const k = seg(t, 10.0, 10.6); ctx.globalAlpha = (1 - k) * inK; ctx.strokeStyle = rgba(P.mint); ctx.lineWidth = 2.5; rrect(wFull / 2 - bw / 2 - k * 70, vy + 5 - k * 34, bw + k * 140, vh - 10 + k * 68, 9 + k * 30); ctx.stroke(); }
  }
  ctx.restore();
}

// Logo resolve
function drawLogo(t) {
  if (t < 12.3) return;
  const font1 = FONT.d(700, 62), font2 = FONT.d(500, 36);
  const l1 = 'Tømrermester Daniel Varle ApS', l2 = 'Specialister i nyt tag';
  const w1 = charLayout(font1, l1, -0.5).w, w2 = charLayout(font2, l2).w;
  const BS = 176, GAP = 46;
  const LW = BS + GAP + Math.max(w1, w2);
  const left = (W - LW) / 2;
  const by = 440;
  // whole lockup slowly breathes forward
  const z = 1 + 0.025 * EZ.soft(seg(t, 12.4, 15));
  ctx.save(); ctx.translate(W / 2, by + 60); ctx.scale(z, z); ctx.translate(-W / 2, -(by + 60));
  // badge path: from chalk dot -> centre -> lockup slot
  const p0 = { x: W / 2, y: 540 + 2.3 * (H / 2) / 7.9 };
  const mk = EZ.snap(seg(t, 12.35, 12.72));
  const mv = EZ.snap(seg(t, 12.86, 13.3));
  const cx = lerp(lerp(p0.x, W / 2, mk), left + BS / 2, mv);
  const cy = lerp(p0.y, by, mk);
  const gs = spring(t - 12.35, 2.4, 0.42);
  const size = lerp(10, BS, clamp(gs, 0, 1.2));
  const rad = lerp(size / 2, 30 * size / BS, EZ.out(seg(t, 12.38, 12.7)));
  // burst
  const bk = seg(t, 12.35, 12.95);
  if (bk > 0 && bk < 1) {
    ctx.save(); ctx.translate(lerp(p0.x, W / 2, mk), cy);
    ctx.strokeStyle = rgba(P.tealHi); ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + 0.2; const r0 = 60 + E.outCubic(bk) * 140, r1 = r0 + 26 * (1 - bk); ctx.globalAlpha = 1 - bk; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke(); }
    ctx.globalAlpha = (1 - bk) * 0.7; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 40 + E.outCubic(bk) * 220, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  rrect(cx - size / 2, cy - size / 2, size, size, rad);
  const g = ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
  g.addColorStop(0, rgba(scl(P.teal, 1.22))); g.addColorStop(1, rgba(scl(P.teal, 0.88)));
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.save(); rrect(cx - size / 2, cy - size / 2, size, size, rad); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(cx - size / 2, cy - size / 2, size, 1.5);
  // gloss sweep
  const gk = seg(t, 13.9, 14.5);
  if (gk > 0 && gk < 1) {
    const gx = lerp(cx - size, cx + size, EZ.inOut(gk));
    const sg = ctx.createLinearGradient(gx - 60, 0, gx + 60, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.28)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
  }
  // DV
  const dk = EZ.out(seg(t, 12.5, 12.95));
  const ds = size / BS;
  ctx.translate(cx, cy); ctx.scale(ds, ds);
  letters('DV', -charLayout(FONT.d(700, 90), 'DV', -1).w / 2, 32, FONT.d(700, 90), 90, P.paper, (i) => {
    const k = EZ.out(seg(t, 12.5 + i * 0.06, 12.5 + i * 0.06 + 0.45));
    return { dy: (1 - k) * 130, a: 1 };
  }, -1);
  ctx.restore();
  // text block
  const tx = left + BS + GAP;
  if (t > 13.1) {
  ctx.save(); ctx.beginPath(); ctx.rect(tx - 10, by - 70, 1300, 84); ctx.clip();
  letters(l1, tx, by - 6, font1, 62, P.paper, (i) => {
    const k = EZ.out(seg(t, 13.12 + i * 0.01, 13.12 + i * 0.01 + 0.5));
    return { dy: (1 - k) * 80, a: 1 };
  }, -0.5);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(tx - 10, by + 14, 1300, 56); ctx.clip();
  const k2 = EZ.out(seg(t, 13.24, 13.72));
  text(l2, tx, by + 54 + (1 - k2) * 56, font2, P.muted2, 1);
  ctx.restore();
  }
  // divider: the chalk line comes back
  const dkk = EZ.out(seg(t, 13.3, 13.75));
  if (dkk > 0) {
    const hw = LW / 2 * dkk;
    ctx.lineCap = 'round';
    glowLine({ x: W / 2 - hw, y: by + 136 }, { x: W / 2 + hw, y: by + 136 }, P.tealHi, 1.6, 0.9);
  }
  const cs = 'VARLE.DK   ·   53 27 24 45   ·   ALBERTSLUND & ROSKILDE';
  const cn = Math.floor(cs.length * seg(t, 13.42, 13.86));
  const cw = charLayout(FONT.m(600, 21), cs, 4).w;
  text(cs.slice(0, cn), W / 2 - cw / 2, by + 188, FONT.m(600, 21), P.paper, 0.9, { track: 4 });
  // CTA
  const pk = seg(t, 13.62, 14.0);
  if (pk > 0) {
    const s = E.outBack(pk, 2);
    const cta = 'Beregn pris på nyt tag';
    const fw = charLayout(FONT.d(600, 30), cta).w;
    const pw = fw + 60 + 44, ph = 72;
    const nudge = Math.max(0, Math.sin(Math.max(0, t - 14.0) * TAU * 1.6)) * 6 * (t > 14.0 ? 1 : 0);
    ctx.save(); ctx.translate(W / 2, by + 284); ctx.scale(s, s);
    rrect(-pw / 2, -ph / 2, pw, ph, 10); ctx.fillStyle = rgba(P.teal); ctx.fill();
    ctx.strokeStyle = rgba(P.tealHi, 0.45); ctx.lineWidth = 1.5; ctx.stroke();
    text(cta, -pw / 2 + 32, 2, FONT.d(600, 30), P.paper, 1, { base: 'middle' });
    text('→', pw / 2 - 52 + nudge, 1, FONT.d(600, 30), P.paper, 1, { base: 'middle' });
    ctx.restore();
  }
  ctx.restore();
  const tr = 'MEDLEM AF DANSK HÅNDVÆRK   ·   GRATIS BESIGTIGELSE   ·   FAST PRIS';
  const ta = seg(t, 13.85, 14.25);
  text(tr, W / 2, H - 78, FONT.m(500, 15), P.muted2, ta * 0.85, { track: 4, align: 'center' });
}

// HUD
const STEPS = [
  { n: '01', name: 'BESIGTIGELSE', t0: 0.3, t1: 3.0 },
  { n: '02', name: 'TILBUD', t0: 3.0, t1: 4.5 },
  { n: '03', name: 'UDFØRELSE', t0: 4.5, t1: 7.5 },
  { n: '04', name: 'AFLEVERING', t0: 7.5, t1: 10.9 },
];
function drawHUD(t) {
  const a = seg(t, 0.1, 0.5) * (1 - seg(t, 11.45, 11.85));
  if (a <= 0) return;
  // corner brackets
  const I = 40, A = 24 * EZ.out(seg(t, 0.1, 0.6));
  ctx.globalAlpha = 0.38 * a; ctx.strokeStyle = rgba(P.muted2); ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [x, y, sx, sy] of [[I, I, 1, 1], [W - I, I, -1, 1], [I, H - I, 1, -1], [W - I, H - I, -1, -1]]) { ctx.moveTo(x + sx * A, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * A); }
  ctx.stroke(); ctx.globalAlpha = 1;
  // brand
  const bk = EZ.out(seg(t, 0.2, 0.6));
  ctx.save(); ctx.globalAlpha = a; rrect(72, 66, 34 * bk, 34, 7); ctx.fillStyle = rgba(P.teal); ctx.fill(); ctx.restore();
  if (bk > 0.6) text('DV', 89, 84, FONT.d(700, 15), P.paper, a, { align: 'center', base: 'middle' });
  const bt = 'TØMRERMESTER DANIEL VARLE APS';
  text(bt.slice(0, Math.floor(bt.length * seg(t, 0.3, 0.75))), 122, 89, FONT.m(600, 14), P.muted2, a, { track: 3 });
  // step indicator top-right
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    const kin = EZ.out(seg(t, s.t0, s.t0 + 0.4));
    const kout = i < 3 ? EZ.in(seg(t, s.t1, s.t1 + 0.22)) : 0;
    if (kin <= 0 || kout >= 1) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(W - 520, 60, 450, 44); ctx.clip();
    const dy = (1 - kin) * 30 - kout * 30;
    const nm = s.name;
    const fw = charLayout(FONT.m(600, 14), nm, 3).w;
    text(nm, W - 72 - fw, 89 + dy, FONT.m(600, 14), P.paper, a, { track: 3 });
    text(`${s.n} / 04`, W - 72 - fw - 22, 89 + dy, FONT.m(700, 14), P.tealHi, a, { align: 'right' });
    ctx.restore();
  }
  // bottom progress bar (echoes the calculator's step bar on varle.dk)
  const x0 = 72, x1 = W - 72, gap = 14, y = H - 92;
  const sw = (x1 - x0 - gap * 3) / 4;
  const bar = EZ.out(seg(t, 0.25, 0.9));
  for (let i = 0; i < 4; i++) {
    const s = STEPS[i];
    const sx = x0 + i * (sw + gap);
    const w = sw * bar;
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fillRect(sx, y, w, 3);
    const p = seg(t, s.t0, s.t1);
    ctx.fillStyle = rgba(P.tealHi); ctx.fillRect(sx, y, w * p, 3);
    if (p > 0 && p < 1) { ctx.globalAlpha = a * 0.5; ctx.fillRect(sx + w * p - 2, y - 2, 4, 7); }
    const active = t >= s.t0 && (t < s.t1 || i === 3);
    const done = t >= s.t1 && i < 3;
    const col = active ? P.paper : done ? P.tealHi : P.muted;
    text(`${s.n}  ${s.name}`, sx, y + 30, FONT.m(600, 13), col, a * (active ? 1 : 0.8) * bar, { track: 2.6 });
    if (done || (i === 3 && t > 10.9)) {
      const ck = EZ.out(seg(t, i === 3 ? 10.9 : s.t1, (i === 3 ? 10.9 : s.t1) + 0.3));
      const lw = charLayout(FONT.m(600, 13), `${s.n}  ${s.name}`, 2.6).w;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(sx + lw + 12, y + 25); ctx.strokeStyle = rgba(P.tealHi); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); const pts = [[-5, 0], [-1.5, 3.5], [6, -4.5]]; ctx.moveTo(pts[0][0], pts[0][1]);
      if (ck < 0.4) ctx.lineTo(lerp(pts[0][0], pts[1][0], ck / 0.4), lerp(pts[0][1], pts[1][1], ck / 0.4)); else { ctx.lineTo(pts[1][0], pts[1][1]); const k = (ck - 0.4) / 0.6; ctx.lineTo(lerp(pts[1][0], pts[2][0], k), lerp(pts[1][1], pts[2][1], k)); }
      ctx.stroke(); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ───────────────────────────── frame
function drawScene(t, bloomTap) {
  setCam(camAt(t));
  FOLD = Math.max(0.002, 1 - E.inCubic(seg(t, 11.86, 12.1)));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]);
  drawBG(t);
  const sh = shake(t);
  ctx.save(); ctx.translate(sh.x, sh.y);
  drawGround(t);
  drawDust(t);
  drawShadow(t);
  const houseA = seg(t, 4.1, 4.55) * (1 - seg(t, 11.42, 11.72));
  if (houseA > 0) { drawWalls(t, houseA); drawRoof(t); drawWindowGlow(t); }
  drawHatch(t);
  drawChalk(t);
  drawWire(t);
  drawScan(t);
  drawAnnotations(t);
  ctx.restore();
  // lens treatment applies to the world only; graphics stay crisp on top
  ctx.drawImage(VIGN, 0, 0);
  if (bloomTap) tapBloom();
  ctx.save(); ctx.translate(sh.x, sh.y);
  drawCallout(t);
  drawMaterials(t);
  drawHeadline(t);
  drawLogo(t);
  ctx.restore();
  drawHUD(t);
}

let BL1, BL2;
// bloom source = world layer at mid-shutter (no typography, so type stays crisp)
function tapBloom() {
  if (!BL1) { BL1 = document.createElement('canvas'); BL1.width = 480; BL1.height = 270; BL2 = document.createElement('canvas'); BL2.width = 480; BL2.height = 270; }
  const b1 = BL1.getContext('2d');
  b1.filter = 'brightness(0.78) contrast(2.3)'; b1.drawImage(sc, 0, 0, 480, 270); b1.filter = 'none';
}
function post(t, fi) {
  const b2 = BL2.getContext('2d');
  b2.clearRect(0, 0, 480, 270); b2.filter = 'blur(7px)'; b2.drawImage(BL1, 0, 0); b2.filter = 'none';
  octx.save();
  octx.globalCompositeOperation = 'screen'; octx.globalAlpha = 0.3; octx.drawImage(BL2, 0, 0, W, H);
  // grain
  const n = NOISE[fi % 4];
  octx.globalCompositeOperation = 'overlay'; octx.globalAlpha = 0.055;
  const R = rng(fi * 13 + 1); const ox = (R() * 256) | 0, oy = (R() * 256) | 0;
  const pat = octx.createPattern(n, 'repeat');
  octx.translate(-ox, -oy); octx.fillStyle = pat; octx.fillRect(ox, oy, W, H);
  octx.restore();
  // fades
  const fa = 1 - seg(t, 0, 0.12) + seg(t, 14.82, 15.0);
  if (fa > 0) { octx.fillStyle = `rgba(0,0,0,${clamp(fa)})`; octx.fillRect(0, 0, W, H); }
}

function renderFrame(fi, sub = 8, shutter = 0.5) {
  const t0 = fi / FPS;
  octx.globalCompositeOperation = 'source-over';
  for (let k = 0; k < sub; k++) {
    const ts = sub === 1 ? t0 : t0 + ((k + 0.5) / sub - 0.5) * shutter / FPS;
    drawScene(Math.max(0, ts), k === (sub >> 1));
    octx.globalAlpha = 1 / (k + 1); octx.drawImage(sc, 0, 0);
  }
  octx.globalAlpha = 1;
  post(t0, fi);
}
function renderTime(t, sub = 1) { renderFrame(Math.round(t * FPS), sub); }

window.FILM = { W, H, FPS, DUR, renderFrame, renderTime, grab: (type = 'image/png', q) => out.toDataURL(type, q) };
window.ready = (async () => {
  await Promise.all(['400', '500', '600', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px IDisp`)).concat([document.fonts.load('500 20px JBM'), document.fonts.load('700 20px JBM')]));
  await document.fonts.ready;
  buildStatic();
  return document.fonts.check('900 40px IDisp') && document.fonts.check('600 20px JBM');
})();
// live preview when opened in a browser
if (!navigator.webdriver) {
  window.ready.then(() => { const st = performance.now(); const loop = () => { const t = ((performance.now() - st) / 1000) % DUR; renderTime(t, 1); requestAnimationFrame(loop); }; loop(); });
}
})();
