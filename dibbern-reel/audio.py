"""Synthesized score + sound design for the Dibbern reel.

Every cue time below mirrors a timestamp in reel.js, so picture and sound
are locked to the frame. 120 BPM, D minor -> F major.
    python3 audio.py out.wav
"""
import sys
import wave
import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

mix = np.zeros((2, N))      # dry
verb = np.zeros((2, N))     # reverb send
duck_src = np.zeros(N)      # kick envelope for sidechain


def T(sec):
    return np.arange(int(sec * SR)) / SR


def note(name):
    names = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
             'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
    p, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[p] + 12 * (o + 1) - 69) / 12)


def place(sig, t, gain=1.0, pan=0.0, send=0.0, bus=None):
    """Add a mono or stereo signal at time t (s)."""
    i = int(round(t * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.vstack([sig * l * 1.414, sig * r * 1.414])
    j = min(N, i + sig.shape[1])
    s0 = max(0, -i)
    seg = sig[:, s0:j - i] * gain
    tgt = mix if bus is None else bus
    tgt[:, max(i, 0):j] += seg
    if send:
        verb[:, max(i, 0):j] += seg * send


def filt(x, kind, f, order=2):
    sos = signal.butter(order, f, btype=kind, fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def sweep_bp(x, f0, f1, q=1.2, curve=1.0):
    """Band-pass with a moving centre frequency (block-wise, state carried)."""
    out = np.zeros_like(x)
    blk = 256
    nb = (len(x) + blk - 1) // blk
    zi = None
    for b in range(nb):
        u = (b / max(1, nb - 1)) ** curve
        fc = f0 * (f1 / f0) ** u
        lo, hi = fc / (1 + 1 / (2 * q)), min(fc * (1 + 1 / (2 * q)), SR / 2 - 100)
        sos = signal.butter(2, [lo, hi], btype='bandpass', fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[b * blk:(b + 1) * blk], zi = signal.sosfilt(sos, x[b * blk:(b + 1) * blk], zi=zi)
    return out


def env_exp(n_sec, decay, attack=0.002):
    t = T(n_sec)
    a = np.clip(t / attack, 0, 1) if attack > 0 else 1
    return a * np.exp(-t / decay)


def saw(f, t, voices=1, detune=0.0):
    out = np.zeros_like(t)
    for v in range(voices):
        d = 1 + detune * (v - (voices - 1) / 2) / max(1, voices - 1) * 2 if voices > 1 else 1
        ph = rng.random()
        # band-limited-ish additive saw
        fv = f * d
        kmax = int(min(40, (SR / 2.2) / fv))
        for k in range(1, kmax + 1):
            out += np.sin(2 * np.pi * k * fv * t + ph * k) / k
    return out / voices


# ───────────────────────── instruments ─────────────────────────
def kick(t0, g=1.0):
    t = T(0.6)
    f = 46 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.28)
    click = filt(noise(0.6), 'highpass', 2500) * np.exp(-t / 0.004) * 0.35
    s = np.tanh((body + click) * 1.6)
    place(s, t0, 0.9 * g)
    i = int(t0 * SR)
    e = np.exp(-T(0.5) / 0.16)
    duck_src[i:i + len(e)] = np.maximum(duck_src[i:i + len(e)], e[:max(0, min(len(e), N - i))])


def clap(t0, g=1.0):
    n = noise(0.4)
    t = T(0.4)
    e = np.zeros_like(t)
    for k, dt in enumerate([0, 0.011, 0.022]):
        e += np.where(t >= dt, np.exp(-(t - dt) / (0.009 if k < 2 else 0.12)), 0)
    s = filt(filt(n, 'bandpass', [900, 4200]), 'highpass', 600) * e
    place(s, t0, 0.32 * g, pan=0.05, send=0.35)


def hat(t0, g=1.0, open_=False, pan=0.25):
    d = 0.16 if open_ else 0.035
    s = filt(noise(0.3), 'highpass', 7500) * env_exp(0.3, d, 0.001)
    place(s, t0, 0.13 * g, pan=pan)


def pluck(t0, f, g=1.0, pan=0.0, dec=0.35, send=0.3):
    t = T(1.2)
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.08)
         + 0.18 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / 0.05))
    s *= env_exp(1.2, dec, 0.0015)
    place(s, t0, 0.16 * g, pan=pan, send=send)


def chime(t0, f, g=1.0, pan=0.0):
    t = T(2.0)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.7) + 0.5 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.25)
         + 0.25 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t / 0.1))
    s *= np.clip(t / 0.002, 0, 1)
    place(s, t0, 0.075 * g, pan=pan, send=0.55)


def tick(t0, g=1.0, f=4200, pan=0.0):
    s = filt(noise(0.03), 'bandpass', [f * 0.7, f * 1.4]) * env_exp(0.03, 0.0035, 0.0003)
    place(s, t0, 0.22 * g, pan=pan)


def flick(t0, g=1.0, pan=0.0, f=2600):
    # paper-card flick: noise snap + tiny body
    t = T(0.08)
    s = filt(noise(0.08), 'bandpass', [f * 0.6, f * 1.8]) * np.exp(-t / 0.006)
    s += 0.25 * np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.012)
    place(s, t0, 0.3 * g, pan=pan, send=0.12)


def thock(t0, f=190, g=1.0, pan=0.0):
    t = T(0.3)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.07) + 0.4 * np.sin(2 * np.pi * f * 2.3 * t) * np.exp(-t / 0.03)
    s += filt(noise(0.3), 'lowpass', 2500) * np.exp(-t / 0.004) * 0.6
    place(np.tanh(s * 1.3), t0, 0.32 * g, pan=pan, send=0.15)


def pop(t0, g=1.0, f0=900, f1=280, pan=0.0):
    t = T(0.12)
    f = f1 + (f0 - f1) * np.exp(-t / 0.018)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(0.12, 0.035, 0.001)
    place(s, t0, 0.3 * g, pan=pan, send=0.2)


def whoosh(t0, dur, f0=300, f1=5000, g=1.0, pan0=-0.6, pan1=0.6, curve=1.0, shape='bell'):
    n = noise(dur)
    s = sweep_bp(n, f0, f1, q=0.9, curve=curve)
    t = T(dur)
    u = t / dur
    if shape == 'bell':
        e = np.sin(np.pi * u) ** 2
    elif shape == 'up':
        e = u ** 2.2 * np.clip((1 - u) / 0.04, 0, 1)
    else:
        e = (1 - u) ** 2 * np.clip(u / 0.02, 0, 1)
    s *= e
    pans = pan0 + (pan1 - pan0) * u
    l, r = np.cos((pans + 1) * np.pi / 4) * 1.414, np.sin((pans + 1) * np.pi / 4) * 1.414
    place(np.vstack([s * l, s * r]), t0, 0.5 * g, send=0.25)


def spray(t0, dur, g=1.0, pan=0.0):
    n = noise(dur + 0.25)
    t = T(dur + 0.25)
    e = np.clip(t / 0.02, 0, 1) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.07))
    sputter = 1 + 0.18 * filt(noise(dur + 0.25), 'lowpass', 40) * 6
    s = filt(filt(n, 'highpass', 2400), 'lowpass', 11000) * 0.7 + filt(n, 'bandpass', [5000, 9000]) * 0.5
    s *= e * np.clip(sputter, 0.3, 1.6)
    place(s, t0, 0.2 * g, pan=pan, send=0.1)


def riser(t0, t1, f0=180, f1=1400, g=1.0):
    dur = t1 - t0
    t = T(dur)
    u = t / dur
    f = f0 * (f1 / f0) ** (u ** 1.6)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    nz = sweep_bp(noise(dur), 400, 9000, q=0.7, curve=1.6)
    s = (tone * 0.35 + nz) * u ** 2.4
    place(np.vstack([s, np.roll(s, 240)]), t0, 0.32 * g, send=0.4)


def rev_cymbal(t1, dur=0.8, g=1.0):
    t = T(dur)
    u = t / dur
    s = filt(noise(dur), 'highpass', 5000) * u ** 3
    place(np.vstack([s, np.roll(s, 120)]), t1 - dur, 0.28 * g, send=0.3)


def crash(t0, g=1.0):
    t = T(2.5)
    s = filt(noise(2.5), 'highpass', 4000) * np.exp(-t / 0.7) * np.clip(t / 0.001, 0, 1)
    place(np.vstack([s, np.roll(s, 300)]), t0, 0.12 * g, send=0.4)


def boom(t0, g=1.0):
    t = T(2.0)
    f = 30 + 45 * np.exp(-t / 0.25)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.75) * np.clip(t / 0.004, 0, 1)
    s += filt(noise(2.0), 'lowpass', 900) * np.exp(-t / 0.09) * 0.5
    place(np.tanh(s * 1.4), t0, 0.75 * g, send=0.25)


def drop_bloop(t0, g=1.0):
    t = T(0.25)
    f = 650 * np.exp(t / 0.045)
    f = np.minimum(f, 2600)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(0.25, 0.05, 0.0008)
    place(s, t0, 0.3 * g, send=0.5)


def shing(t0, g=1.0, pan=0.0):
    t = T(1.6)
    parts = [(2093, 1.0, 0.5), (3136, 0.6, 0.35), (4186, 0.5, 0.3), (5274, 0.3, 0.2), (6645, 0.25, 0.15)]
    s = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in parts)
    s *= np.clip(t / 0.003, 0, 1)
    nz = sweep_bp(noise(0.45), 3000, 12000, q=1.0) * np.sin(np.pi * T(0.45) / 0.45) ** 2
    place(s, t0, 0.05 * g, pan=pan, send=0.6)
    place(nz, t0 - 0.12, 0.12 * g, pan=pan, send=0.3)


# ───────────────────────── music bed ─────────────────────────
pad = np.zeros((2, N))
bass = np.zeros(N)
CHORDS = [  # (start, end, notes, bass root)
    (0.0, 2.0, ['D3', 'A3', 'E4', 'F4'], 'D2'),
    (2.0, 4.0, ['Bb2', 'F3', 'A3', 'D4'], 'Bb1'),
    (4.0, 6.0, ['F3', 'A3', 'C4', 'E4'], 'F1'),
    (6.0, 8.0, ['C3', 'G3', 'C4', 'E4'], 'C2'),
    (8.0, 10.0, ['D3', 'A3', 'C4', 'F4'], 'D2'),
    (10.0, 12.02, ['Bb2', 'F3', 'A3', 'D4'], 'Bb1'),
    (12.02, 15.0, ['F2', 'C3', 'A3', 'E4', 'G4'], 'F1'),
]
for a, b, notes, root in CHORDS:
    dur = b - a + 0.6
    t = T(dur)
    att = 0.04 if a > 0 else 0.9
    e = np.clip(t / att, 0, 1) * np.clip((dur - t) / 0.6, 0, 1)
    for k, nm in enumerate(notes):
        f = note(nm)
        sL = saw(f, t, voices=2, detune=0.004)
        sR = saw(f * 1.0015, t, voices=2, detune=0.004)
        i = int(a * SR)
        j = min(N, i + len(t))
        pad[0, i:j] += (sL * e)[:j - i] * 0.08
        pad[1, i:j] += (sR * e)[:j - i] * 0.08
# pad brightness: dark intro, open after the drop, softer during the quote
lp = np.zeros_like(pad)
for ch in range(2):
    lo = filt(pad[ch], 'lowpass', 700)
    hi = filt(pad[ch], 'lowpass', 2600)
    tt = np.arange(N) / SR
    w = np.clip((tt - 1.0) / 1.0, 0, 1) * (1 - 0.6 * np.clip((tt - 10.4) / 0.3, 0, 1) * (1 - np.clip((tt - 12.02) / 0.05, 0, 1)))
    lp[ch] = lo * (1 - w) + hi * w
pad = lp

# bass: plucky 8ths from the drop, sustained during the quote, long note at the end
for a, b, _, root in CHORDS:
    f = note(root)
    if a < 2.0:
        continue
    if 10.0 <= a < 12.0:
        steps = [(a, b - a, 0.9)]
    elif a >= 12.0:
        steps = [(a, b - a, 1.2)]
    else:
        steps = [(a + k * 0.25, 0.22, 0.7) for k in range(int((b - a) / 0.25))]
    for st, du, dec in steps:
        t = T(du + 0.1)
        s = np.sin(2 * np.pi * f * t) + 0.45 * saw(f * 2, t) * np.exp(-t / 0.08)
        s *= np.clip(t / 0.003, 0, 1) * np.exp(-t / dec) * np.clip((du + 0.1 - t) / 0.03, 0, 1)
        i = int(st * SR)
        j = min(N, i + len(t))
        bass[i:j] += s[:j - i] * 0.33
bass = np.tanh(filt(bass, 'lowpass', 900) * 1.5) * 0.6

# ───────────────────────── arrangement / cues ─────────────────────────
# SCENE 1 — spray stencil
tick(0.31, 1.2, f=3000)                 # trigger click
spray(0.34, 0.84, g=0.8)
shing(1.22, g=1.0, pan=0.2)
rev_cymbal(1.985, 0.9, g=1.0)
riser(1.25, 1.985, 160, 1600, g=0.9)
whoosh(1.55, 0.44, 200, 7000, g=0.9, pan0=0, pan1=0, curve=1.8, shape='up')

# SCENE 2 — drop + groove
boom(1.985, 0.8)
crash(1.985, 1.0)
for b in np.arange(2.0, 10.25, 0.5):
    if 4.95 < b < 5.6:
        continue           # breath while the deck stacks
    kick(b, 1.0 if b in (2.0, 4.0, 8.0) else 0.85)
for b in np.arange(2.25, 10.2, 0.5):
    if 4.95 < b < 5.6:
        continue
    hat(b, 1.0, open_=(int(b * 2) % 4 == 3), pan=0.22)
for b in np.arange(2.0, 10.2, 0.125):
    if (b * 8) % 2 == 1 and not (4.95 < b < 5.6):
        hat(b, 0.35, pan=-0.3)
for b in [2.5, 3.5, 4.5, 6.5, 7.5, 8.5, 9.5]:
    clap(b)
clap(3.875, 0.5)

word_times = [2.12, 2.5, 3.0, 3.5, 3.75]
word_notes = ['F5', 'A5', 'C6', 'A5', 'D6']
for t0, nm in zip(word_times, word_notes):
    pluck(t0, note(nm), 1.0, pan=-0.3, dec=0.25)
    tick(t0, 0.7, f=5200, pan=-0.3)
for t0 in [2.22, 2.5, 3.0, 3.5, 3.75, 4.0]:
    spray(t0 + 0.04, 0.16, g=0.45, pan=0.45)
# 'alt.' — stab chord
for nm in ['F5', 'A5', 'C6', 'F6']:
    pluck(4.0, note(nm), 0.8, pan=0.0, dec=0.5, send=0.5)
whoosh(4.07, 0.22, 800, 6000, g=0.5, pan0=-0.5, pan1=0.1)
pop(2.4, 0.9, 700, 250, pan=0.4)       # badge

# SCENE 3 — stripes riffle, stack, fan
for i in range(13):
    flick(4.6 + i * 0.021, 0.9, pan=-0.8 + i * 0.13, f=2400 + i * 60)
whoosh(5.06, 0.42, 1200, 300, g=0.55, pan0=0.4, pan1=-0.2, shape='bell')
thock(5.48, f=150, g=0.8)
fan_notes = ['F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'G5', 'A5', 'C6', 'D6', 'F6', 'G6', 'A6']
for i, nm in enumerate(fan_notes):
    t0 = 5.5 + i * 0.022
    flick(t0, 0.7, pan=-0.8 + i * 0.13, f=3000)
    pluck(t0 + 0.005, note(nm), 0.55, pan=-0.8 + i * 0.13, dec=0.6, send=0.45)
pop(6.8, 0.9, 500, 1100, pan=0.35)     # card lift (rising)
riser(7.3, 7.97, 220, 1300, g=0.8)
whoosh(7.3, 0.66, 250, 4000, g=0.8, pan0=0.4, pan1=0, curve=1.4, shape='up')
rev_cymbal(7.97, 0.6, 0.8)

# SCENE 4 — bento (panel entrance times mirror S4.inT in reel.js)
A_IN, B_IN, C_IN, D_IN = 7.92, 8.0, 8.08, 8.16
crash(7.95, 0.7)
for k, (t0, f) in enumerate([(A_IN, 170), (B_IN, 200), (C_IN, 225), (D_IN, 255)]):
    thock(t0 + 0.03, f=f, g=0.9, pan=[-0.4, 0.3, 0.2, 0.5][k])
# odometer ticks at each integer crossing
tt = np.arange(A_IN + 0.12, A_IN + 1.0, 1 / SR * 40)
v = 40 * (1 - 2 ** (-10 * np.clip((tt - (A_IN + 0.12)) / 0.88, 0, 1)))
cross = np.where(np.diff(np.floor(v)) > 0)[0]
for idx in cross:
    tick(tt[idx], 0.55, f=3600 + v[idx] * 30, pan=-0.45)
for k, nm in enumerate(['D5', 'F5', 'A5', 'C6', 'D6']):
    chime(B_IN + 0.3 + k * 0.075, note(nm), 1.0, pan=0.25 + k * 0.08)
chime(B_IN + 0.8, note('F6'), 0.6, pan=0.6)   # 5th star fills to 90 %
chime(D_IN + 0.55, note('A5'), 0.9, pan=0.5)  # checkmark
for k in range(6):
    tick(C_IN + 0.2 + k * 0.12, 0.25, f=2500, pan=0.15)   # clock
whoosh(10.16, 0.42, 3000, 400, g=0.7, pan0=-0.3, pan1=0.3, shape='bell')

# SCENE 5 — quote (breakdown)
thock(10.5, f=110, g=1.1)
boom(10.5, 0.35)
thock(10.64, f=130, g=0.8)
for i in range(9):
    tick(10.8 + i * 0.022, 0.4, f=3000 + i * 250, pan=-0.4 + i * 0.1)
kick(10.82, 0.7)
pop(11.02, 0.9, 1200, 400, pan=0.3)
spray(11.0, 0.3, g=0.7, pan=0.0)
for k in range(5):
    chime(11.15 + k * 0.04, note(['C6', 'D6', 'F6', 'G6', 'A6'][k]), 0.45, pan=-0.3 + k * 0.1)
rev_cymbal(12.02, 1.0, 1.0)
riser(11.4, 12.02, 200, 900, g=0.6)
# drop toss: pitch up then down with the arc
t = T(0.46)
f = 500 + 700 * np.sin(np.pi * np.clip(t / 0.46, 0, 1)) ** 1.5
toss = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.46) * 0.5
place(toss, 11.58, 0.1, pan=0.0, send=0.4)

# SCENE 6 — impact + logo
kick(12.02, 1.1)
boom(12.02, 1.0)
drop_bloop(12.0, 1.0)
crash(12.02, 1.1)
for nm, pn in [('F5', -0.3), ('A5', 0.0), ('C6', 0.3), ('E6', 0.5), ('G6', -0.5)]:
    chime(12.06, note(nm), 0.7, pan=pn)
whoosh(12.6, 0.68, 400, 2200, g=0.45, pan0=0.3, pan1=-0.5)
tick(12.95, 0.4, f=3000)
tick(13.07, 0.4, f=3400)
pop(13.48, 0.9, 600, 1000, pan=0.3)
shing(13.82, 1.0, pan=-0.3)
shing(14.06, 0.6, pan=0.4)
tick(14.4, 0.5, f=4000, pan=0.4)

# ───────────────────────── mixdown ─────────────────────────
duck = 1 - 0.55 * np.convolve(duck_src, np.ones(64) / 64, mode='same')
music = pad * duck + np.vstack([bass, bass]) * duck
mix += music * 0.9
verb += pad * 0.25

# reverb: stereo decorrelated exponentially decaying noise IR
L = int(1.9 * SR)
ti = np.arange(L) / SR
ir = np.vstack([filt(rng.standard_normal(L), 'lowpass', 6000) * np.exp(-ti / 0.45) for _ in range(2)])
ir[:, :int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
wet = np.vstack([signal.fftconvolve(filt(verb[c], 'highpass', 250), ir[c])[:N] for c in range(2)])
out = mix + wet * 0.55

# glue: gentle low shelf cleanup + soft limiter
out = np.vstack([filt(out[c], 'highpass', 28) for c in range(2)])
peak = np.max(np.abs(out))
out = np.tanh(out / peak * 1.25) / np.tanh(1.25)
fade = np.clip((DUR - np.arange(N) / SR) / 0.35, 0, 1)
out *= fade * 0.93
fadein = np.clip(np.arange(N) / (0.01 * SR), 0, 1)
out *= fadein

pcm = (np.clip(out.T, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('soundtrack ok', out.shape, 'rms dB', 20 * np.log10(np.sqrt((out ** 2).mean())))
