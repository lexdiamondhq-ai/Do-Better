/**
 * The day's chord: each part of you plays a note in the music's key of F. A Floor keep sounds its suit's
 * note softly, a Ceiling rings it an octave up, and a Comeback keep steps up into it. The keep that
 * finishes the day strums today's notes as one chord, low to high, while the pills light in time. At the
 * Showdown the five played cards ring as the hand's chord, each on the beat its card lifts.
 *
 * The notes are F, A, C and D: the key's own chord with its sixth, which sits under every bar of the
 * music (D, not E, for Mind, because E rubs against the B flat bars). `make-sounds.py check` measures
 * each one against music.mp3.
 *
 * The engine never imports lib: sound names are plain string unions that sound.ts must cover, and
 * sound.test.ts checks every one has a file. Nothing here counts anything: a missing suit is only a
 * quieter chord.
 */

import { SUITS, type Suit } from './cards';
import type { Level } from './kept';
import type { Hand, HandKind } from './poker';
import { handRhythm } from './rhythm';

export type Note = 'F' | 'A' | 'C' | 'D';

/** Spades (Body) F, Hearts (People) A, Diamonds (Craft) C, Clubs (Mind) D. */
export const SUIT_NOTE: Readonly<Record<Suit, Note>> = { spades: 'F', hearts: 'A', diamonds: 'C', clubs: 'D' };

/**
 * The sound a keep plays: the Floor's thump ending on the suit's note, the Ceiling's run up to its
 * octave, or a Comeback's leading note resolving into it. The plain `floor` and `ceiling` are kept for
 * places with no suit to sound.
 */
export type KeySound = 'floor' | 'ceiling' | `floor-${Suit}` | `ceiling-${Suit}` | `resolve-${Suit}`;

/** A ringing note: each suit's note and its octave, and a low F for cards with no suit. */
export type Tone = 'ring-f4' | 'ring-a4' | 'ring-c5' | 'ring-d5' | 'ring-f5' | 'ring-a5' | 'ring-c6' | 'ring-d6' | 'ring-low';

/** One note of a strum or a hand's chord, `delayMs` after it starts. `suit` lights that suit's pills. */
export type ToneStep = { tone: Tone; delayMs: number; suit: Suit | null };

/** Every ringing note, lowest first: the order a strum plays them in. */
export const TONES: readonly Tone[] = ['ring-low', 'ring-f4', 'ring-a4', 'ring-c5', 'ring-d5', 'ring-f5', 'ring-a5', 'ring-c6', 'ring-d6'];

/** Each note's pitch as a MIDI number, as make-sounds.py writes it (69 is the A above middle C). */
export const TONE_MIDI: Readonly<Record<Tone, number>> = {
  'ring-low': 53,
  'ring-f4': 65,
  'ring-a4': 69,
  'ring-c5': 72,
  'ring-d5': 74,
  'ring-f5': 77,
  'ring-a5': 81,
  'ring-c6': 84,
  'ring-d6': 86,
};

/** Each suit's note, and the same note an octave up for a Ceiling. */
const SUIT_TONES: Readonly<Record<Suit, readonly [Tone, Tone]>> = {
  spades: ['ring-f4', 'ring-f5'],
  hearts: ['ring-a4', 'ring-a5'],
  diamonds: ['ring-c5', 'ring-c6'],
  clubs: ['ring-d5', 'ring-d6'],
};

/** The suit whose pills a note lights, or null for the low F. */
export function toneSuit(tone: Tone): Suit | null {
  return SUITS.find((s) => SUIT_TONES[s].includes(tone)) ?? null;
}

/** Every keep sound, so sound.ts can be checked to cover them all. */
export const KEY_SOUNDS: readonly KeySound[] = ['floor', 'ceiling', ...SUITS.flatMap((s): KeySound[] => [`floor-${s}`, `ceiling-${s}`, `resolve-${s}`])];

/** Notes in a strum, and in a hand's chord when it has no shape to follow. */
export const STRUM_MS = 70;
/** At most every suit's note and its octave. */
export const MAX_DAY_NOTES = 8;
/** How long after the hand's last beat the cards that only fill it ring, and how far apart they roll. */
const FILL_GAP_MS = 260;
const FILL_ROLL_MS = 45;

/** The sound for a keep: the suit's note at the Floor, its octave at the Ceiling, a step up into it on a Comeback. */
export function keepSound(suit: Suit, level: Level, o?: { comeback?: boolean }): KeySound {
  if (o?.comeback) return `resolve-${suit}`;
  return level === 'ceiling' ? `ceiling-${suit}` : `floor-${suit}`;
}

const byPitch = (a: Tone, b: Tone) => TONE_MIDI[a] - TONE_MIDI[b];

/**
 * Today's notes from the cards and how each was kept: each kept suit's note, and its octave too when a
 * card of that suit reached the Ceiling. Each note sounds once, lowest first, at most eight. `complete`
 * once every card is kept.
 */
export function dayChord(cards: readonly { suit: Suit; level: Level | null }[]): { notes: Tone[]; complete: boolean } {
  const notes = new Set<Tone>();
  for (const c of cards) {
    if (c.level === null) continue;
    const [note, octave] = SUIT_TONES[c.suit];
    notes.add(note);
    if (c.level === 'ceiling') notes.add(octave);
  }
  return {
    notes: [...notes].sort(byPitch).slice(0, MAX_DAY_NOTES),
    complete: cards.length > 0 && cards.every((c) => c.level !== null),
  };
}

/** The notes played low to high as a strum, 70 ms apart, each lighting its suit. A note given twice plays once. */
export function strum(notes: readonly Tone[]): ToneStep[] {
  return [...new Set(notes)].sort(byPitch).map((tone, i) => ({ tone, delayMs: i * STRUM_MS, suit: toneSuit(tone) }));
}

/**
 * The hand's five played cards as a chord: each card's suit note, the low F for a card with no suit (a
 * saved day, the river or a Joker). A suit that comes round again climbs to its octave, so a pair in one
 * suit rings two notes rather than one twice.
 *
 * Given the hand's `kind`, each card rings on the beat it lifts in `handRhythm`, so the chord is spelled
 * in the hand's own shape (a full house rings three, then two), and the cards that only fill the hand roll
 * in after the last beat. Without a kind, the cards roll across the fan 70 ms apart.
 */
export function handChord(hand: Pick<Hand, 'cards'> & { kind?: HandKind }): ToneStep[] {
  const cards = hand.cards.slice(0, 5);
  const seen = new Map<Suit, number>();
  const tones = cards.map((c): { tone: Tone; suit: Suit | null } => {
    if (!c.suit || c.joker) return { tone: 'ring-low', suit: null };
    const n = seen.get(c.suit) ?? 0;
    seen.set(c.suit, n + 1);
    return { tone: SUIT_TONES[c.suit][n % 2], suit: c.suit };
  });
  if (!hand.kind) return tones.map((t, i) => ({ ...t, delayMs: i * STRUM_MS }));
  const beatOf = new Map<number, number>();
  for (const b of handRhythm(hand.kind)) if (b.card >= 0 && b.card < tones.length && !beatOf.has(b.card)) beatOf.set(b.card, b.at);
  // The cards that only fill the hand: a quick roll one group-gap after the hand's own beats.
  let filler = beatOf.size ? Math.max(...beatOf.values()) + FILL_GAP_MS : 0;
  const steps = tones.map((t, i) => {
    const at = beatOf.get(i);
    if (at !== undefined) return { ...t, delayMs: at };
    const step = { ...t, delayMs: filler };
    filler += FILL_ROLL_MS;
    return step;
  });
  return steps.sort((a, b) => a.delayMs - b.delayMs);
}

