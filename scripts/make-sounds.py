"""
Makes every sound in assets/sounds from scratch: the table music loop and one effect per action.
Nothing is sampled, so there is nothing to license. Needs numpy and ffmpeg (with MP3 and AAC).
Effects are MP3, which plays everywhere. The music is written twice: AAC in an .m4a for phones, which
loops without a gap, and MP3 for browsers.

    python3 scripts/make-sounds.py            # everything
    python3 scripts/make-sounds.py music      # only the named sounds
"""

import math
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

RATE = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')
rng = np.random.default_rng(7)


def t(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def hz(note):
    """MIDI note number to frequency."""
    return 440.0 * 2 ** ((note - 69) / 12)


def env(n, attack=0.005, decay=0.3, length=None):
    """A plucked shape: quick rise, exponential fall."""
    x = np.arange(n) / RATE
    a = np.minimum(1, x / max(attack, 1e-4))
    d = np.exp(-x / decay)
    e = a * d
    if length is not None:
        # Fade the last 30 ms so nothing clicks.
        tail = int(0.03 * RATE)
        cut = int(length * RATE)
        if cut < n:
            e[cut:] = 0
            e[max(0, cut - tail):cut] *= np.linspace(1, 0, min(tail, cut))
    return e


def lowpass(x, cutoff):
    """One-pole low-pass."""
    a = math.exp(-2 * math.pi * cutoff / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def keys(note, seconds, vel=1.0):
    """A soft electric piano: a sine with a little bell on the attack."""
    x = t(seconds)
    f = hz(note)
    body = np.sin(2 * np.pi * f * x) + 0.25 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.4)
    bell = 0.18 * np.sin(2 * np.pi * 7.0 * f * x) * np.exp(-x / 0.05)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 4.5 * x)
    return vel * (body + bell) * trem * env(len(x), 0.004, 1.6)


def bass(note, seconds, vel=1.0):
    x = t(seconds)
    f = hz(note)
    y = np.sin(2 * np.pi * f * x) + 0.3 * np.sin(2 * np.pi * 2 * f * x)
    return vel * y * env(len(x), 0.01, 0.9, length=seconds * 0.92)


def kick(vel=1.0):
    x = t(0.35)
    f = 90 * np.exp(-x / 0.05) + 45
    phase = 2 * np.pi * np.cumsum(f) / RATE
    return vel * np.sin(phase) * np.exp(-x / 0.12)


def hat(vel=1.0, length=0.06):
    x = t(length)
    n = highpass(rng.standard_normal(len(x)), 7000)
    return vel * 0.5 * n * np.exp(-x / (length / 3))


def snare(vel=1.0):
    x = t(0.25)
    n = lowpass(highpass(rng.standard_normal(len(x)), 1200), 6000)
    tone = np.sin(2 * np.pi * 190 * x) * np.exp(-x / 0.04)
    return vel * (0.45 * n * np.exp(-x / 0.07) + 0.3 * tone)


def put(track, sound, at):
    i = int(at * RATE)
    j = min(len(track), i + len(sound))
    track[i:j] += sound[: j - i]
    # Anything that runs past the end wraps to the start, so the loop is seamless.
    if i + len(sound) > len(track):
        rest = sound[j - i:]
        track[: len(rest)] += rest


def normalize(x, peak=0.8):
    m = np.max(np.abs(x)) or 1
    return x * (peak / m)


def save(name, mono, fmt='mp3', bitrate='96k'):
    os.makedirs(OUT, exist_ok=True)
    data = (np.clip(mono, -1, 1) * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        path = f.name
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data.tobytes())
    codec = {'mp3': ['-c:a', 'libmp3lame'], 'm4a': ['-c:a', 'aac', '-movflags', '+faststart']}
    for f in fmt.split(','):
        dest = os.path.join(OUT, f'{name}.{f}')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, *codec[f], '-b:a', bitrate, dest], check=True)
        print(dest, os.path.getsize(dest), 'bytes')
    os.remove(path)


def music():
    """
    The card room after hours: a slow, warm loop in F at 80 beats a minute, 72 seconds long and seamless.
    Three eight-bar parts: the home chords, a turn through G minor and C with lighter drums, then home
    again with a soft melody on top. Soft keys, a round bass, brushed drums and a little vinyl dust.
    Anything ringing past the end wraps to the start, so the loop never clicks.
    """
    beat = 60 / 80
    bar = 4 * beat
    length = 24 * bar
    keys_track = np.zeros(int(length * RATE))
    lead = np.zeros_like(keys_track)
    low = np.zeros_like(keys_track)
    drums = np.zeros_like(keys_track)
    home = [(41, [57, 60, 64, 67])] * 2 + [(38, [57, 60, 62, 65])] * 2 + [(46, [57, 62, 65, 69])] * 2 + [(36, [58, 62, 64, 67])] * 2
    turn = [(43, [58, 62, 65, 69])] * 2 + [(36, [58, 64, 69, 74])] * 2 + [(45, [55, 60, 64, 67]), (38, [57, 60, 62, 65]), (46, [57, 62, 65, 69]), (36, [58, 62, 64, 67])]
    chords = home + turn + home
    swing = beat * 0.08
    for b in range(24):
        root, voicing = chords[b]
        light = 8 <= b < 16
        start = b * bar
        # Keys: the chord on beat 1, a softer echo on the and of 2, a single top note on 4.
        for k, n in enumerate(voicing):
            put(keys_track, keys(n, 3.2, 0.3 if light else 0.34), start + k * 0.012)
        for n in voicing[1:]:
            put(keys_track, keys(n + 12 if b % 2 else n, 1.6, 0.16), start + 1.5 * beat + swing)
        put(keys_track, keys(voicing[-1] + 12, 1.2, 0.14), start + 3 * beat + swing)
        # Bass: root, then the fifth, walking a half step into the next chord.
        nxt = chords[(b + 1) % 24][0]
        put(low, bass(root, beat * 1.9, 0.55), start)
        put(low, bass(root + 7, beat * 0.9, 0.42), start + 2 * beat)
        if nxt != root:
            put(low, bass(nxt - 1 if nxt > root else nxt + 1, beat * 0.9, 0.36), start + 3 * beat + swing)
        else:
            put(low, bass(root + 12, beat * 0.9, 0.3), start + 3 * beat + swing)
        # Drums: kick on 1 and the and of 2, snare on 2 and 4, swung hats. The middle part drops the second kick.
        put(drums, kick(0.6 if light else 0.7), start)
        if not light:
            put(drums, kick(0.45), start + 1.5 * beat + swing)
        put(drums, snare(0.22 if light else 0.32), start + beat)
        put(drums, snare(0.22 if light else 0.32), start + 3 * beat)
        for e in range(8):
            put(drums, hat(0.16 if e % 2 else 0.24), start + e * beat / 2 + (swing if e % 2 else 0))
    # The melody, over the last part: a phrase for each chord, as (beat, note, beats long).
    phrases = [
        [(0, 81, 1.5), (1.5, 79, 0.5), (2, 77, 1), (3, 76, 1), (4, 72, 2.5), (7, 74, 1)],
        [(0, 77, 1.5), (1.5, 76, 0.5), (2, 74, 1), (3, 72, 1), (4, 69, 3)],
        [(0, 74, 1), (1, 77, 1), (2, 81, 1.5), (3.5, 79, 0.5), (4, 77, 3)],
        [(0, 76, 1), (1, 74, 1), (2, 72, 1), (3, 70, 1), (4, 72, 3.5)],
    ]
    for i, phrase in enumerate(phrases):
        at = (16 + 2 * i) * bar
        for when, n, beats in phrase:
            note = keys(n, beats * beat + 0.8, 0.22)
            t0 = at + when * beat + (swing if when % 1 else 0)
            put(lead, note, t0)
            # A soft echo, three eighths later.
            put(lead, 0.3 * note, t0 + 1.5 * beat)
    keys_track = lowpass(keys_track, 3800)
    lead = lowpass(lead, 4200)
    dust = np.zeros_like(keys_track)
    for at in rng.uniform(0, length, 480):
        put(dust, hat(rng.uniform(0.02, 0.07), 0.012), at)
    hum = 0.004 * lowpass(rng.standard_normal(len(keys_track)), 400)
    mix = keys_track + 0.8 * lead + 0.9 * low + 0.55 * drums + dust + hum
    save('music', normalize(mix, 0.7), fmt='m4a,mp3', bitrate='80k')


def floor():
    """A card set down on felt: a low thump and a brush of paper."""
    x = t(0.3)
    thump = np.sin(2 * np.pi * (70 + 60 * np.exp(-x / 0.03)) * x) * np.exp(-x / 0.07)
    paper = lowpass(rng.standard_normal(len(x)), 3000) * np.exp(-x / 0.03)
    tone = 0.4 * keys(65, 0.3, 1.0)
    save('floor', normalize(thump + 0.35 * paper + tone[: len(x)], 0.8))


def ceiling():
    """Reaching up: a bright arpeggio that climbs and rings."""
    out = np.zeros(int(0.9 * RATE))
    for i, n in enumerate([72, 76, 79, 84]):
        put(out, keys(n, 0.9 - i * 0.07, 0.6 + i * 0.1), i * 0.07)
    shimmer = np.zeros_like(out)
    for i, n in enumerate([96, 100, 103]):
        put(shimmer, 0.15 * np.sin(2 * np.pi * hz(n) * t(0.5)) * np.exp(-t(0.5) / 0.15), 0.21 + i * 0.05)
    save('ceiling', normalize(out + shimmer, 0.8))


def later():
    """Sideways: a quick whoosh of air."""
    x = t(0.32)
    noise = rng.standard_normal(len(x))
    sweep = np.zeros_like(noise)
    acc = 0.0
    for i, v in enumerate(noise):
        cutoff = 600 + 3500 * math.sin(math.pi * i / len(noise))
        a = math.exp(-2 * math.pi * cutoff / RATE)
        acc = (1 - a) * v + a * acc
        sweep[i] = acc
    shape = np.sin(np.pi * np.arange(len(x)) / len(x)) ** 2
    save('later', normalize(sweep * shape, 0.55))


def flip():
    """A card turning over: a crisp snap."""
    x = t(0.12)
    snap = highpass(rng.standard_normal(len(x)), 2500) * np.exp(-x / 0.012)
    body = np.sin(2 * np.pi * 900 * x) * np.exp(-x / 0.02)
    save('flip', normalize(snap + 0.3 * body, 0.6))


def card_up():
    """Today's card got better: two notes, up a fifth."""
    out = np.zeros(int(0.7 * RATE))
    put(out, keys(74, 0.6, 0.8), 0)
    put(out, keys(81, 0.6, 0.9), 0.1)
    save('card-up', normalize(out, 0.75))


def joker():
    """A Joker: a sparkling run down and back up."""
    out = np.zeros(int(1.3 * RATE))
    notes = [96, 93, 91, 88, 86, 84, 86, 88, 91, 96, 100]
    for i, n in enumerate(notes):
        x = t(0.5)
        ping = np.sin(2 * np.pi * hz(n) * x) * np.exp(-x / 0.12)
        put(out, 0.5 * ping, i * 0.055)
    put(out, keys(72, 1.0, 0.5), 0.6)
    put(out, keys(79, 1.0, 0.4), 0.6)
    save('joker', normalize(out, 0.75))


def face():
    """A face card in the Court: a short, warm fanfare."""
    out = np.zeros(int(1.6 * RATE))

    def horn(n, seconds, vel):
        x = t(seconds)
        f = hz(n)
        y = sum((1 / k) * np.sin(2 * np.pi * k * f * x) for k in range(1, 7))
        return vel * lowpass(y, 2200) * np.minimum(1, x / 0.04) * np.exp(-x / 0.8)

    for at, notes, seconds in [(0, [65, 69, 72], 0.22), (0.24, [65, 69, 72], 0.14), (0.4, [70, 74, 77], 1.1)]:
        for n in notes:
            put(out, horn(n, seconds + 0.2, 0.35), at)
    save('face', normalize(out, 0.8))


def chips():
    """Chips into the stack: a handful of clinks."""
    out = np.zeros(int(0.9 * RATE))
    for at in sorted(rng.uniform(0, 0.45, 7)):
        x = t(0.18)
        f = rng.uniform(2600, 4200)
        clink = (np.sin(2 * np.pi * f * x) + 0.6 * np.sin(2 * np.pi * f * 1.48 * x)) * np.exp(-x / 0.035)
        put(out, rng.uniform(0.4, 0.8) * clink, at)
    save('chips', normalize(out, 0.7))


def call():
    """A call made: one round bell."""
    x = t(1.4)
    f = hz(79)
    bell = sum(a * np.sin(2 * np.pi * f * r * x) * np.exp(-x / d) for a, r, d in [(1, 1, 0.9), (0.5, 2.0, 0.5), (0.3, 2.76, 0.3), (0.2, 5.4, 0.12)])
    save('call', normalize(bell, 0.7))


def tap():
    """A soft tick for small taps."""
    x = t(0.05)
    save('tap', normalize(np.sin(2 * np.pi * 1600 * x) * np.exp(-x / 0.008), 0.35))


SOUNDS = {
    'music': music,
    'floor': floor,
    'ceiling': ceiling,
    'later': later,
    'flip': flip,
    'card-up': card_up,
    'joker': joker,
    'face': face,
    'chips': chips,
    'call': call,
    'tap': tap,
}

if __name__ == '__main__':
    for name in sys.argv[1:] or SOUNDS:
        SOUNDS[name]()
