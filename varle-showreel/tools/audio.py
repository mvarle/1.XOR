"""Procedural score + sound design for the Varle film.

Everything is synthesised (no samples) and hit-synced to the same timeline as film.js.
120 BPM, D minor -> resolves to F major on the logo ("no surprises").
usage: python3 audio.py out.wav
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
DUR = 15.0
N = int(SR * (DUR + 1.5))
rng = np.random.default_rng(11)

sfx = np.zeros((2, N))     # one-shots
music = np.zeros((2, N))   # ducked by the kick
drums = np.zeros((2, N))
room = np.zeros((2, N))    # reverb sends
hall = np.zeros((2, N))


def T(n):
    return np.arange(n) / SR


def place(bus, sig, t, g=1.0, pan=0.0, rs=0.0, hs=0.0):
    sig = np.asarray(sig, dtype=float)
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        st = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    else:
        st = sig
    i = int(round(t * SR))
    if i < 0:
        st = st[:, -i:]
        i = 0
    n = min(st.shape[1], N - i)
    if n <= 0:
        return
    seg = st[:, :n] * g
    bus[:, i:i + n] += seg
    if rs:
        room[:, i:i + n] += seg * rs
    if hs:
        hall[:, i:i + n] += seg * hs


def _f(kind, f, order=2):
    return butter(order, f, btype=kind, fs=SR, output='sos')


def lp(x, f, o=2): return sosfilt(_f('low', f, o), x)
def hp(x, f, o=2): return sosfilt(_f('high', f, o), x)
def bp(x, lo, hi, o=2): return sosfilt(_f('band', [lo, hi], o), x)


def noise(n): return rng.standard_normal(n)


def S(*xs):
    """sum signals of different lengths"""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


# ───────────────────────── instruments
def kick(dur=0.5, f0=160, f1=45, k=30, click=0.5, dec=7.0):
    t = T(int(dur * SR))
    f = f1 + (f0 - f1) * np.exp(-t * k)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * dec)
    cl = hp(noise(len(t)), 2500) * np.exp(-t * 350) * click
    return np.tanh((s + cl) * 1.5)


def clap():
    t = T(int(0.4 * SR))
    n = bp(noise(len(t)), 900, 7000)
    env = np.zeros(len(t))
    for d in (0, 0.009, 0.019):
        env += (t >= d) * np.exp(-np.clip(t - d, 0, None) * 110) * 0.55
    env += (t >= 0.028) * np.exp(-np.clip(t - 0.028, 0, None) * 15)
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30) * 0.3
    return n * env * 0.5 + body


def hat(dec=45, g=1.0):
    t = T(int(0.15 * SR))
    return hp(noise(len(t)), 7500, 4) * np.exp(-t * dec) * g


def pluck(f, dur=0.4, bright=1.0):
    t = T(int(dur * SR))
    s = np.zeros(len(t))
    for k in range(1, 30):
        if f * k > 15000:
            break
        s += np.sin(2 * np.pi * f * k * t + rng.uniform(0, 0.4)) / k * np.exp(-t * (5 + k * k * 0.4 / bright))
    s *= np.minimum(1, t * SR / 40)
    return s * 0.55


def pad(freqs, dur, att=0.5, rel=0.9, harm=9, tilt=1.6):
    n = int(dur * SR)
    t = T(n)
    L = np.zeros(n)
    R = np.zeros(n)
    for f in freqs:
        for det, pn in ((-0.0045, -0.75), (0.0, 0.0), (0.0045, 0.75)):
            ff = f * (1 + det)
            s = np.zeros(n)
            for k in range(1, harm + 1):
                if ff * k > 11000:
                    break
                s += np.sin(2 * np.pi * ff * k * t + rng.uniform(0, 6.28)) / (k ** tilt)
            a = (pn + 1) * np.pi / 4
            L += s * np.cos(a)
            R += s * np.sin(a)
    env = np.minimum(1, t / att) * np.clip((dur - t) / rel, 0, 1)
    return np.vstack([L, R]) * env / (len(freqs) * 2.2)


def bass(f, dur):
    t = T(int(dur * SR))
    s = np.sin(2 * np.pi * f * t)
    for k in range(2, 9):
        s += np.sin(2 * np.pi * f * k * t) / (k ** 1.8) * 0.7
    env = np.minimum(1, t / 0.008) * np.clip((dur - t) / 0.06, 0, 1)
    return np.tanh(s * 1.3) * env


def bell(f, dur=2.5, ratio=3.5, I0=3.5, dec=2.2):
    t = T(int(dur * SR))
    I = I0 * np.exp(-t * 5)
    s = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t)) * np.exp(-t * dec)
    return s * np.minimum(1, t * SR / 25)


BANDS = [(120, 240), (240, 480), (480, 960), (960, 1920), (1920, 3840), (3840, 7680), (7680, 14000)]


def sweep_noise(dur, f_from, f_to, env=None, width=0.6):
    n = int(dur * SR)
    t = T(n)
    x = noise(n)
    cen = np.exp(np.linspace(np.log(f_from), np.log(f_to), n))
    out = np.zeros(n)
    for lo, hi in BANDS:
        c = np.sqrt(lo * hi)
        w = np.exp(-0.5 * (np.log(cen / c) / width) ** 2)
        out += bp(x, lo, hi) * w
    if env is None:
        env = np.sin(np.pi * t / dur) ** 2
    return out * env


def riser(dur, f0=200, f1=2400, tone=0.25):
    n = int(dur * SR)
    t = T(n)
    env = (t / dur) ** 2.2
    nz = sweep_noise(dur, 400, 9000, env=env)
    f = f0 * (f1 / f0) ** (t / dur)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env * tone
    return nz * 0.6 + s


def rev_cymbal(dur):
    t = T(int(dur * SR))
    return hp(noise(len(t)), 5000, 2) * (t / dur) ** 3


def impact(g_sub=1.0, f0=70, f1=30, dec=2.2):
    t = T(int(2.5 * SR))
    f = f1 + (f0 - f1) * np.exp(-t * 6)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * dec) * g_sub
    body = lp(noise(len(t)), 900) * np.exp(-t * 14) * 0.7
    crack = hp(noise(len(t)), 3000) * np.exp(-t * 60) * 0.5
    return np.tanh((sub + body + crack) * 1.2)


def ks(f, dur, damp=0.995):
    n = int(dur * SR)
    L = max(2, int(round(SR / f)))
    buf = list(rng.uniform(-1, 1, L))
    out = np.zeros(n)
    for i in range(n):
        j = i % L
        v = buf[j]
        out[i] = v
        buf[j] = damp * 0.5 * (v + buf[(j + 1) % L])
    return out


def tick(f=3200, dec=700, dur=0.025):
    t = T(int(dur * SR))
    return np.sin(2 * np.pi * f * t) * np.exp(-t * dec)


def click(lo=2500, dec=900, dur=0.012):
    t = T(int(dur * SR))
    return hp(noise(len(t)), lo) * np.exp(-t * dec)


def clack(f=2200):
    t = T(int(0.05 * SR))
    tone = np.sin(2 * np.pi * f * t) * np.exp(-t * 120) * 0.6 + np.sin(2 * np.pi * f * 1.63 * t) * np.exp(-t * 160) * 0.3
    nz = bp(noise(len(t)), 1500, 7000) * np.exp(-t * 300)
    return tone + nz


def knock(f=560):
    t = T(int(0.08 * SR))
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 55) + lp(noise(len(t)), 2000) * np.exp(-t * 200) * 0.4


# ease port of film.js bezier for sync
def bezier(x1, y1, x2, y2):
    cx = 3 * x1; bx = 3 * (x2 - x1) - cx; ax = 1 - cx - bx
    cy = 3 * y1; by = 3 * (y2 - y1) - cy; ay = 1 - cy - by

    def f(x):
        if x <= 0: return 0.0
        if x >= 1: return 1.0
        lo, hi = 0.0, 1.0
        t = x
        for _ in range(50):
            sx = ((ax * t + bx) * t + cx) * t
            if sx < x: lo = t
            else: hi = t
            t = (lo + hi) / 2
        return ((ay * t + by) * t + cy) * t
    return f


EZ_OUT = bezier(0.16, 1, 0.3, 1)

# ───────────────────────── harmony (Hz)
NOTE = dict(F1=43.65, Bb1=58.27, C2=65.41, D2=73.42, F2=87.31, A2=110.0, Bb2=116.54, C3=130.81, D3=146.83, E3=164.81,
            F3=174.61, G3=196.0, A3=220.0, Bb3=233.08, C4=261.63, D4=293.66, E4=329.63, F4=349.23, G4=392.0,
            A4=440.0, Bb4=466.16, C5=523.25, D5=587.33, E5=659.25, F5=698.46, G5=783.99, A5=880.0, C6=1046.5)
n = lambda *k: [NOTE[x] for x in k]
SECTIONS = [  # start, end, pad voicing, bass root, arp tones
    (2.0, 4.0, n('D3', 'F3', 'A3', 'E4'), NOTE['D2'], n('D4', 'A4', 'F4', 'E5', 'D5', 'A4', 'F4', 'A4')),
    (4.0, 6.0, n('Bb2', 'F3', 'D4', 'C5'), NOTE['Bb1'], n('Bb3', 'F4', 'D5', 'C5', 'Bb4', 'F4', 'D4', 'F4')),
    (6.0, 8.0, n('F3', 'A3', 'C4', 'G4'), NOTE['F2'], n('F4', 'C5', 'A4', 'G5', 'F5', 'C5', 'A4', 'C5')),
    (8.0, 9.0, n('C3', 'G3', 'E4', 'D5'), NOTE['C2'], n('C4', 'G4', 'E5', 'D5', 'C5', 'G4', 'E4', 'G4')),
    (9.0, 10.0, n('C3', 'F3', 'G3', 'Bb3'), NOTE['C2'], None),
    (10.0, 11.0, n('Bb2', 'F3', 'D4', 'A4'), NOTE['Bb1'], n('Bb4', 'F5', 'D5', 'C6', 'Bb4', 'F5', 'D5', 'A4')),
    (11.0, 12.35, n('C3', 'G3', 'E4', 'G4'), NOTE['C2'], None),
]

# ───────────────────────── music bed
# intro pad + drone
place(music, pad(n('D3', 'A3', 'D4'), 2.3, att=1.2, rel=0.4, harm=6), 0.0, 0.5, hs=0.4)
t = T(int(2.2 * SR))
place(music, np.sin(2 * np.pi * NOTE['D2'] * t) * np.minimum(1, t / 1.0) * np.clip((2.2 - t) / 0.3, 0, 1), 0.0, 0.2)

for (a, b, voicing, root, arp) in SECTIONS:
    place(music, pad(voicing, b - a + 0.25, att=0.06 if a in (2.0, 10.0) else 0.25, rel=0.25), a, 0.55, hs=0.35)
    place(music, bass(root, b - a), a, 0.34 if a != 9.0 else 0.2)
    if root >= 65:
        place(music, np.sin(2 * np.pi * root / 2 * T(int((b - a) * SR))) * np.clip(((b - a) - T(int((b - a) * SR))) / 0.05, 0, 1), a, 0.1)
    if arp:
        steps = int(round((b - a) / 0.125))
        for i in range(steps):
            tt = a + i * 0.125
            br = 0.6 + 1.6 * (tt - 2.0) / 9.0
            acc = 1.0 if i % 4 == 0 else 0.7
            place(music, pluck(arp[i % len(arp)], 0.35, br), tt, 0.2 * acc, pan=(-0.45 if i % 2 else 0.45), rs=0.25, hs=0.15)

# final chord: F add9 — long, wide, warm
place(music, pad(n('F2', 'C3', 'F3', 'A3', 'C4', 'G4', 'A4'), 3.4, att=0.02, rel=2.2, harm=10, tilt=1.4), 12.35, 0.9, hs=0.5)
place(sfx, bass(NOTE['F1'], 2.4) * np.exp(-T(int(2.4 * SR)) * 1.1), 12.35, 0.55)
for i, f in enumerate(n('F4', 'A4', 'C5', 'F5', 'A5', 'C6')):
    place(sfx, bell(f, 2.6, ratio=2.0 + (i % 2) * 1.5, I0=2.2, dec=1.6), 12.35 + i * 0.045, 0.085, pan=-0.6 + i * 0.24, hs=0.6)

# ───────────────────────── drums
kicks = [2.0 + 0.5 * i for i in range(14)] + [10.0, 10.5]
for k_t in kicks:
    place(drums, kick(), k_t, 0.95)
for c_t in [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 10.5]:
    place(drums, clap(), c_t, 0.42, rs=0.35)
for i in range(int((9.0 - 2.0) / 0.125)):
    tt = 2.0 + i * 0.125
    off = (i % 4 == 2)
    place(drums, hat(55 if off else 90), tt, 0.16 if off else 0.06, pan=0.3 if i % 2 else -0.2)
for i in range(8):
    tt = 10.0 + i * 0.125
    place(drums, hat(55 if i % 4 == 2 else 90), tt, 0.15 if i % 4 == 2 else 0.05, pan=0.25)
# intro "clock" ticks
for i in range(12):
    tt = 0.5 + i * 0.125
    place(sfx, tick(5200 if i % 4 == 0 else 4100, 900), tt, 0.05 if i % 4 else 0.08, pan=0.3 if i % 2 else -0.3)

# sidechain: duck the music bus under each kick
tt = np.arange(N) / SR
duck = np.ones(N)
for k_t in kicks + [12.35]:
    m = tt >= k_t
    duck[m] -= 0.6 * np.exp(-(tt[m] - k_t) / 0.13)
music *= np.clip(duck, 0.3, 1)

# ───────────────────────── sound design, synced to picture
# 0.18 seed dot
place(sfx, S(tick(1760, 60, 0.15) * 0.6, tick(2640, 90, 0.1) * 0.3), 0.18, 0.25, hs=0.4)
# 0.38 chalk line zips out, 0.5 snap + string twang (vibrates at ~10.5 Hz like the line)
place(sfx, sweep_noise(0.14, 900, 7000, env=np.linspace(0, 1, int(0.14 * SR)) ** 2), 0.37, 0.35, rs=0.3)
tw = ks(NOTE['D2'] * 2, 1.4, 0.9965)
tw *= (0.75 + 0.25 * np.sin(2 * np.pi * 10.5 * T(len(tw))))
place(sfx, lp(tw, 2400), 0.5, 0.55, rs=0.3, hs=0.25)
place(sfx, click(2000, 300, 0.05) * 1.4, 0.5, 0.6, rs=0.4)
place(sfx, kick(0.4, 110, 40, 35, 0.2, 9), 0.5, 0.55)
# walls rise
for p, tt in ((-0.5, 0.6), (0.5, 0.62)):
    place(sfx, sweep_noise(0.24, 500, 4000), tt, 0.12, pan=p)
# apex ping on the beat
place(sfx, bell(NOTE['A5'], 1.8, 3.5, 3.0, 2.6), 1.0, 0.22, hs=0.6)
place(sfx, bell(NOTE['E5'], 1.6, 2.0, 2.0, 2.8), 1.0, 0.12, pan=0.3, hs=0.5)
# angle / width counters
for i in range(10):
    place(sfx, tick(3000 + i * 120, 800), 1.06 + i * 0.032, 0.07, pan=-0.3)
for i in range(9):
    place(sfx, tick(2600 + i * 90, 800), 1.12 + i * 0.04, 0.06, pan=0.3)
# dolly-zoom whoosh + build into the drop
place(sfx, sweep_noise(1.0, 250, 5000, env=np.sin(np.pi * T(int(1.0 * SR)) / 1.0) ** 1.5), 1.35, 0.42, rs=0.2)
place(sfx, rev_cymbal(0.55), 1.45, 0.16)
place(sfx, impact(0.9, 60, 32, 2.6), 2.0, 0.45, hs=0.25)
# length counter
for i in range(12):
    place(sfx, tick(2800 + i * 60, 800), 2.27 + i * 0.04, 0.05, pan=-0.2)
# inspection scan
st = T(int(0.65 * SR))
scan = np.sin(2 * np.pi * np.cumsum(900 + 500 * np.sin(np.pi * st / 0.65)) / SR) * np.sin(np.pi * st / 0.65) ** 2
place(sfx, scan * 0.5 + sweep_noise(0.65, 6000, 1500) * 0.4, 2.5, 0.12, pan=0.0, rs=0.3)
# HUD step changes
for tt in (3.0, 4.5, 7.5):
    place(sfx, S(tick(1480, 70, 0.12) * 0.7, tick(2220, 90, 0.1) * 0.5), tt, 0.12, pan=0.7, rs=0.3)
    place(sfx, tick(2960, 90, 0.1), tt + 0.06, 0.08, pan=0.7, rs=0.3)
# formula typing
for i in range(20):
    place(sfx, click(3000, 1200), 3.16 + i * 0.017 + rng.uniform(0, 0.005), 0.12, pan=-0.4)
# counter ticks every 5 m²
ck = [EZ_OUT(x) for x in np.linspace(0, 1, 2000)]
last = -1
for i, v in enumerate(ck):
    q = int(v * 110.9 // 5)
    if q != last:
        last = q
        place(sfx, tick(3400, 1000), 3.32 + 0.6 * i / 1999, 0.07, pan=-0.35)
# FAST PRIS stamp
place(sfx, impact(0.8, 90, 40, 6), 4.0, 0.55, rs=0.3)
place(sfx, knock(140) * 1.2, 4.0, 0.5)
place(sfx, click(1200, 200, 0.06), 4.0, 0.35)
for i in range(25):
    place(sfx, click(3200, 1300), 4.1 + i * 0.009, 0.06, pan=-0.2)
# battens: wood knocks
for r in range(11):
    place(sfx, knock(520 + r * 18), 4.2 + r * 0.022, 0.09, pan=0.4 - r * 0.03, rs=0.3)
# tile cascade: one clack per tile on the visible plane
R = np.random.default_rng(7)
for r in range(11):
    for c in range(24):
        land = 4.5 + r * 0.05 + (c / 24) * 0.22 + R.uniform(0, 0.03) + 0.14
        place(sfx, clack(R.uniform(1700, 3000)), land, 0.035, pan=-0.6 + 1.2 * c / 23, rs=0.25)
# material waves: tile flips ripple + whoosh on the word swap
for w_t in (5.36, 6.36):
    for c in range(24):
        for r in range(0, 11, 3):
            d = (c / 24) * 0.3 + (r / 11) * 0.12
            place(sfx, clack(R.uniform(2600, 4200)) * 0.5, w_t + d + 0.15, 0.03, pan=-0.6 + 1.2 * c / 23, rs=0.2)
    place(sfx, sweep_noise(0.5, 3000, 600), w_t + 0.02, 0.18, pan=-0.3)
place(sfx, sweep_noise(0.4, 2500, 500), 4.55, 0.14, pan=-0.4)
# Aflevering: windows switch on (warm tinks) + roof sheen
for i in range(9):
    place(sfx, bell([NOTE['F5'], NOTE['A5'], NOTE['C6']][i % 3] * (1 if i < 6 else 0.5), 1.2, 2.0, 1.2, 4.0), 7.55 + i * 0.045, 0.05, pan=-0.4 + i * 0.1, hs=0.5)
    place(sfx, click(4000, 1500), 7.55 + i * 0.045, 0.05)
place(sfx, sweep_noise(0.85, 2500, 11000, width=0.45), 7.55, 0.07, pan=0.4, hs=0.4)
# headline slams
for tt, g in ((8.0, 0.55), (8.5, 0.4)):
    place(sfx, impact(0.6, 120, 50, 9), tt, g, rs=0.4)
    place(sfx, sweep_noise(0.18, 6000, 800, env=np.exp(-T(int(0.18 * SR)) * 20)), tt, 0.25)
# 9.0 chaos: drums drop, glitches, the bubble wobbles, riser into the snap
for i in range(14):
    tt = 9.0 + i * 0.022
    place(sfx, clack(R.uniform(900, 2600)) * 0.8, tt + 0.25, 0.08, pan=R.uniform(-0.7, 0.7), rs=0.3)
glitch_t = 9.05
while glitch_t < 9.86:
    L = R.uniform(0.02, 0.06)
    tt = T(int(L * SR))
    f = R.choice([220, 330, 440, 660, 880, 1320])
    g = np.sign(np.sin(2 * np.pi * f * tt)) * np.exp(-tt * 20)
    place(sfx, g, glitch_t, 0.035, pan=R.uniform(-0.8, 0.8))
    glitch_t += R.uniform(0.04, 0.11)
wt = T(int(1.0 * SR))
depth = (1 - wt / 1.0) ** 2
wob = np.sin(2 * np.pi * np.cumsum(520 + 160 * depth * np.cos(2 * np.pi * 1.55 * wt)) / SR) * np.minimum(1, wt / 0.1) * (0.4 + 0.6 * depth)
place(sfx, wob, 9.0, 0.07, hs=0.3)
place(sfx, riser(0.95, 180, 1600, 0.2), 9.05, 0.32)
place(sfx, rev_cymbal(0.7), 9.3, 0.22)
# 10.0 THE SNAP: level clicks home
place(sfx, click(1500, 400, 0.03) * 2.0, 10.0, 0.5, rs=0.3)
place(sfx, knock(900) + knock(1350) * 0.5, 10.0, 0.4)
place(sfx, impact(1.0, 75, 30, 2.0), 10.0, 0.62, hs=0.35)
for i, f in enumerate(n('Bb4', 'D5', 'F5')):
    place(sfx, bell(f, 1.6, 2.0, 1.5, 2.5), 10.0 + i * 0.03, 0.06, pan=-0.3 + i * 0.3, hs=0.5)
# 11.0 type exits + camera rewinds to the blueprint
place(sfx, sweep_noise(0.4, 4000, 900), 11.0, 0.2, pan=-0.4)
rw = T(int(0.85 * SR))
rew = np.sin(2 * np.pi * np.cumsum(1400 * (0.25 ** (rw / 0.85))) / SR) * np.sin(np.pi * rw / 0.85) ** 2
place(sfx, rew * 0.35 + sweep_noise(0.85, 6000, 300) * 0.8, 11.0, 0.22, rs=0.3)
place(sfx, riser(1.3, 120, 900, 0.15), 11.05, 0.22)
# 11.86 house folds into the line
fw = T(int(0.3 * SR))
place(sfx, np.sin(2 * np.pi * np.cumsum(300 * (0.3 ** (fw / 0.3))) / SR) * np.exp(-fw * 4), 11.86, 0.2)
place(sfx, kick(0.35, 90, 38, 30, 0.1, 10), 12.1, 0.5)
# 12.1 line contracts (reverse zip) into the logo
place(sfx, sweep_noise(0.25, 900, 9000, env=np.linspace(0, 1, int(0.25 * SR)) ** 3), 12.1, 0.3)
place(sfx, rev_cymbal(0.5), 11.85, 0.2)
# 12.35 LOGO
place(sfx, impact(1.1, 65, 28, 1.5), 12.35, 0.75, hs=0.4)
place(sfx, kick(0.6, 150, 42, 24, 0.6, 5), 12.35, 0.7)
pp = T(int(0.12 * SR))
place(sfx, np.sin(2 * np.pi * np.cumsum(400 + 1400 * pp / 0.12) / SR) * np.exp(-pp * 30), 12.38, 0.12)
# lockup text + UI
place(sfx, sweep_noise(0.35, 1200, 5000), 12.5, 0.08)
for i in range(29):
    place(sfx, click(4000, 1600), 13.12 + i * 0.01, 0.025, pan=0.2)
for i in range(52):
    place(sfx, click(3500, 1400), 13.42 + i * (0.44 / 52), 0.03, pan=0.1)
place(sfx, sweep_noise(0.45, 600, 6000), 13.3, 0.07)
cp = T(int(0.15 * SR))
place(sfx, np.sin(2 * np.pi * np.cumsum(500 + 900 * (1 - np.exp(-cp * 30))) / SR) * np.exp(-cp * 25), 13.62, 0.14, hs=0.3)
place(sfx, sweep_noise(0.6, 4000, 12000, width=0.4), 13.9, 0.05, hs=0.5)

# ───────────────────────── reverb + master
def ir(dur, damp_hz, seed):
    r = np.random.default_rng(seed)
    t = T(int(dur * SR))
    e = np.exp(-t * 6.9 / dur)
    L = lp(r.standard_normal(len(t)), damp_hz) * e
    Rr = lp(r.standard_normal(len(t)), damp_hz) * e
    pre = int(0.012 * SR)
    L[:pre] = 0
    Rr[:pre] = 0
    return np.vstack([L, Rr]) / np.sqrt(np.sum(L ** 2))


ir_room, ir_hall = ir(0.7, 6000, 1), ir(2.8, 4500, 2)
wet = np.zeros((2, N))
for ch in range(2):
    wet[ch] += fftconvolve(room[ch], ir_room[ch])[:N] * 0.45
    wet[ch] += fftconvolve(hall[ch], ir_hall[ch])[:N] * 0.4

master = sfx + music * 0.85 + drums * 0.8 + wet
master = np.vstack([hp(master[0], 32, 3), hp(master[1], 32, 3)])
# glue: gentle tanh saturation, then peak-normalise to -1 dBFS
master /= np.max(np.abs(master))
master = np.tanh(master * 1.25) / np.tanh(1.25)   # gentle glue, loudness is set at mux time
master *= 0.89
n_out = int(DUR * SR)
master = master[:, :n_out]
fade = np.ones(n_out)
fl = int(0.35 * SR)
fade[-fl:] = np.linspace(1, 0, fl) ** 2
master *= fade
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'score.wav', SR, (master.T * 32767).astype(np.int16))
print('ok', master.shape, 'rms', float(np.sqrt(np.mean(master ** 2))))
