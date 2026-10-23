/**
 * The day's chord: each part of you plays a note in the music's key of F. A Floor keep sounds its suit's
 * note softly, a Ceiling an octave up, and the keep that finishes the day strums today's notes as one
 * chord. At the Showdown the five played cards ring as the hand's chord.
 *
 * The engine never imports lib: sound names are plain string unions that sound.ts must cover. Stream 6
 * widens `KeySound` and `Tone` and writes the bodies; until then a keep plays today's Floor or Ceiling
 * sound and nothing rings.
 */

import type { Suit } from './cards';
import type { Level } from './kept';
import type { Hand } from './poker';

export type Note = 'F' | 'A' | 'C' | 'D';

/** Spades (Body) F, Hearts (People) A, Diamonds (Craft) C, Clubs (Mind) D. */
export const SUIT_NOTE: Readonly<Record<Suit, Note>> = { spades: 'F', hearts: 'A', diamonds: 'C', clubs: 'D' };

/** The sound a keep plays. Stream 6 widens it: `floor-${Suit}` | `ceiling-${Suit}` | `resolve-${Suit}`. */
export type KeySound = 'floor' | 'ceiling';

/** A ringing note. Stream 6 widens it: 'ring-f4' | … | 'ring-low'. */
export type Tone = never;

/** One note of a strum or a hand's chord, `delayMs` after it starts. `suit` lights that suit's pills. */
export type ToneStep = { tone: Tone; delayMs: number; suit: Suit | null };

/** The sound for a keep. Until stream 6, today's Floor or Ceiling sound. */
export function keepSound(suit: Suit, level: Level, o?: { comeback?: boolean }): KeySound {
  return level;
}

/** Today's notes from the cards and how each was kept. `complete` once every card is kept. */
export function dayChord(cards: readonly { suit: Suit; level: Level | null }[]): { notes: Tone[]; complete: boolean } {
  return { notes: [], complete: cards.length > 0 && cards.every((c) => c.level !== null) };
}

/** The notes played low to high as a strum. */
export function strum(notes: readonly Tone[]): ToneStep[] {
  return [];
}

/** The hand's five played cards as a chord. */
export function handChord(hand: Pick<Hand, 'cards'>): ToneStep[] {
  return [];
}
