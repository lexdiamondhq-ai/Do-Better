"""
Makes every sound in assets/sounds from scratch: the table music loop and one effect per action.
Nothing is sampled, so there is nothing to license. Needs numpy and ffmpeg (with MP3 and AAC).
Effects are MP3, which plays everywhere. The music is written twice: AAC in an .m4a for phones, which
loops without a gap, and MP3 for browsers.

    python3 scripts/make-sounds.py            # everything
    python3 scripts/make-sounds.py music      # only the named sounds
    python3 scripts/make-sounds.py check      # measure each suit's note against music.mp3

The day's chord (src/engine/chord.ts) gives each part of you a note in the music's key of F: Spades
(Body) F, Hearts (People) A, Diamonds (Craft) C, Clubs (Mind) D. Every keep sound ends on its suit's
note, and the ring notes are what a full day strums and a Showdown hand rings. These newer sounds each
draw their noise from their own seeded generator, so making one never changes another.
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


# The day's chord ------------------------------------------------------------------------------------

# Each part of you, as a MIDI note: F4, A4, C5 and D5. A Ceiling rings an octave up. D, not E, for Mind:
# E sits a half step under the F in the music's B flat bars. `check` measures it.
SUIT_NOTE = {'spades': 65, 'hearts': 69, 'diamonds': 72, 'clubs': 74}
# The notes a day strums and a hand rings, by the names sound.ts plays them under. The low F is for
# cards with no suit: saved days, the river and Jokers.
RING_NOTE = {'f4': 65, 'a4': 69, 'c5': 72, 'd5': 74, 'f5': 77, 'a5': 81, 'c6': 84, 'd6': 86, 'low': 53}
# A Ceiling climbs the key's own chord up to its suit's octave.
CEILING_RUN = {'spades': [65, 69, 72, 77], 'hearts': [69, 72, 77, 81], 'diamonds': [72, 77, 81, 84], 'clubs': [74, 77, 81, 86]}


def own_rng(name):
    """A noise source of the sound's own, so making one sound never shifts another's noise."""
    return np.random.default_rng(sum(ord(c) * 31 ** i for i, c in enumerate(name)) % (2 ** 32))


def fade(x, ms=30):
    """Ends a sound at silence, so nothing clicks."""
    n = min(len(x), int(ms / 1000 * RATE))
    x[len(x) - n:] *= np.linspace(1, 0, n)
    return x


def chime(note, seconds, vel=1.0, decay=0.9, low=False):
    """
    A ring note: the music's keys voice with a longer, cleaner ring. The low F carries more of its
    overtones, so a phone speaker that can't make the fundamental still says F.
    """
    x = t(seconds)
    f = hz(note)
    h2, h3 = (0.55, 0.3) if low else (0.28, 0.07)
    body = np.sin(2 * np.pi * f * x) + h2 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.5) + h3 * np.sin(2 * np.pi * 3 * f * x) * np.exp(-x / 0.25)
    bell = 0.16 * np.sin(2 * np.pi * 7.0 * f * x) * np.exp(-x / 0.04)
    trem = 1 + 0.05 * np.sin(2 * np.pi * 4.5 * x)
    return fade(vel * (body + bell) * trem * env(len(x), 0.004, decay))


def keep_floor(suit):
    """A Floor kept: the card set down on felt, then the suit's note, softly."""
    rng_ = own_rng(f'floor-{suit}')
    x = t(0.75)
    thump = np.sin(2 * np.pi * (70 + 60 * np.exp(-x / 0.03)) * x) * np.exp(-x / 0.07)
    paper = lowpass(rng_.standard_normal(len(x)), 3000) * np.exp(-x / 0.03)
    out = thump + 0.35 * paper
    put(out, 0.45 * chime(SUIT_NOTE[suit], 0.73, decay=0.6), 0.012)
    save(f'floor-{suit}', fade(normalize(out, 0.8)))


def keep_ceiling(suit):
    """A Ceiling reached: a run up the key's chord that lands on the suit's note an octave up, and rings."""
    run = CEILING_RUN[suit]
    out = np.zeros(int(1.1 * RATE))
    for i, n in enumerate(run):
        last = i == len(run) - 1
        put(out, chime(n, 1.0 if last else 0.75 - i * 0.07, 0.95 if last else 0.6 + i * 0.1, decay=0.8 if last else 0.4), i * 0.07)
    top = run[-1]
    for i, (n, vel) in enumerate([(top + 12, 0.14), (top + 24, 0.06)]):
        put(out, vel * np.sin(2 * np.pi * hz(n) * t(0.5)) * np.exp(-t(0.5) / 0.15), 0.21 + i * 0.05)
    save(f'ceiling-{suit}', fade(normalize(out, 0.8)))


def resolve(suit):
    """
    A Comeback kept: the card turns back over. A brush of the card, the note a half step under the suit's
    (the dark side), then the suit's own note, with its octave and the octave below for warmth.
    """
    rng_ = own_rng(f'resolve-{suit}')
    note = SUIT_NOTE[suit]
    out = np.zeros(int(1.3 * RATE))
    x = t(0.18)
    brush = lowpass(rng_.standard_normal(len(x)), 2400) * np.minimum(1, x / 0.02) * np.exp(-x / 0.05)
    put(out, 0.18 * brush, 0)
    lead = chime(note - 1, 0.16, 0.5, decay=0.12)
    put(out, lead, 0.01)
    put(out, chime(note, 1.15, 0.95, decay=0.85), 0.12)
    put(out, chime(note + 12, 0.8, 0.22, decay=0.4), 0.12)
    put(out, chime(note - 12, 1.0, 0.24, decay=0.6), 0.12)
    save(f'resolve-{suit}', fade(normalize(out, 0.8)))


def ring(name):
    """One note of the day's chord or a hand's chord. Several ring at once, so each stays quiet."""
    note = RING_NOTE[name]
    save(f'ring-{name}', normalize(chime(note, 1.3, decay=0.75, low=name == 'low'), 0.6))


def deal():
    """A card dealt into its slot: floor()'s paper, brushed across the felt, and a soft tap as it lands."""
    rng_ = own_rng('deal')
    x = t(0.24)
    paper = highpass(lowpass(rng_.standard_normal(len(x)), 3000), 350)
    brush = paper * np.minimum(1, x / 0.012) * np.exp(-x / 0.045)
    tap_ = np.zeros_like(x)
    put(tap_, np.sin(2 * np.pi * (110 + 40 * np.exp(-t(0.12) / 0.02)) * t(0.12)) * np.exp(-t(0.12) / 0.03), 0.035)
    save('deal', fade(normalize(brush + 0.5 * tap_, 0.55)))


def check():
    """
    Measures each note the app plays against music.mp3, bar by bar. For every bar it takes the strongest
    pitches in the music, then scores how much a note in the keys voice would beat against them (Sethares'
    roughness: two partials a little apart beat, unisons and wide gaps don't). Lower is smoother. It prints
    each suit's note and its octave beside E, the note D replaced, so the choice can be seen, and flags
    any bar where a note is rougher than the worst a plain chord tone of that bar gets.
    """
    src = os.path.join(OUT, 'music.mp3')
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src, '-f', 's16le', '-ac', '1', '-ar', str(RATE), '-'], check=True, capture_output=True).stdout
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768
    bar = 4 * 60 / 80
    chords = ['F'] * 2 + ['Dm'] * 2 + ['Bb'] * 2 + ['C'] * 2 + ['Gm'] * 2 + ['C'] * 2 + ['Am', 'Dm', 'Bb', 'C']
    chords = chords + chords[:8]
    size = 16384
    window = np.hanning(size)
    freqs = np.fft.rfftfreq(size, 1 / RATE)
    band = (freqs > 60) & (freqs < 2600)

    def peaks(seg):
        mags = np.zeros(len(freqs))
        for i in range(0, len(seg) - size, size // 4):
            mags += np.abs(np.fft.rfft(seg[i:i + size] * window))
        mags[~band] = 0
        local = (mags > np.roll(mags, 1)) & (mags > np.roll(mags, -1))
        idx = np.argsort(np.where(local, mags, 0))[::-1][:24]
        top = mags[idx]
        return freqs[idx], top / (top.max() or 1)

    def rough(f1, a1, f2, a2):
        lo, hi = np.minimum(f1, f2), np.abs(f2 - f1)
        s_ = 0.24 / (0.021 * lo + 19)
        return a1 * a2 * (np.exp(-3.5 * s_ * hi) - np.exp(-5.75 * s_ * hi))

    def score(note, pf, pa):
        f = hz(note)
        partials = [(f, 1.0), (2 * f, 0.25)]
        return sum(float(np.sum(rough(fp, ap, pf, pa))) for fp, ap in partials)

    tested = {'F4': 65, 'A4': 69, 'C5': 72, 'D5': 74, 'E5 (not used)': 76, 'F5': 77, 'A5': 81, 'C6': 84, 'D6': 86, 'low F3': 53}
    # The Comeback's leading notes pass in 110 ms on the way into the suit's note; shown for the record.
    tested.update({f'into {k} (passing)': SUIT_NOTE[s] - 1 for k, s in [('F', 'spades'), ('A', 'hearts'), ('C', 'diamonds'), ('D', 'clubs')]})
    bars = [peaks(audio[int(b * bar * RATE):int((b + 1) * bar * RATE)]) for b in range(24)]
    # What a note that belongs to the bar's chord scores there: the yardstick for "sits in the music".
    tones = {'F': [65, 69, 72], 'Dm': [62, 65, 69], 'Bb': [58, 62, 65], 'C': [60, 64, 67], 'Gm': [55, 58, 62], 'Am': [57, 60, 64]}
    print(f'{"note":>18} ' + ' '.join(f'{c:>5}' for c in chords) + '   mean  worst bar')
    yard = [max(score(n + 12 * k, *bars[b]) for n in tones[chords[b]] for k in (0, 1)) for b in range(24)]
    print(f'{"chord tone max":>18} ' + ' '.join(f'{y:5.2f}' for y in yard))
    for label, note in tested.items():
        scores = [score(note, *bars[b]) for b in range(24)]
        worst = int(np.argmax(scores))
        over = [b for b in range(24) if scores[b] > yard[b] * 1.05]
        flag = f'  rougher than the chord on bars {over}' if over else ''
        print(f'{label:>18} ' + ' '.join(f'{v:5.2f}' for v in scores) + f'  {np.mean(scores):5.2f}  {worst} ({chords[worst]}){flag}')


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
    **{f'floor-{suit}': (lambda suit=suit: keep_floor(suit)) for suit in SUIT_NOTE},
    **{f'ceiling-{suit}': (lambda suit=suit: keep_ceiling(suit)) for suit in SUIT_NOTE},
    **{f'resolve-{suit}': (lambda suit=suit: resolve(suit)) for suit in SUIT_NOTE},
    **{f'ring-{name}': (lambda name=name: ring(name)) for name in RING_NOTE},
    'deal': deal,
}

if __name__ == '__main__':
    if sys.argv[1:] == ['check']:
        check()
    else:
        for name in sys.argv[1:] or SOUNDS:
            SOUNDS[name]()
