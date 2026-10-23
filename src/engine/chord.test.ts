import { describe, expect, it } from 'vitest';

import { SUITS, type Suit } from './cards';
import { dayChord, handChord, KEY_SOUNDS, keepSound, MAX_DAY_NOTES, strum, SUIT_NOTE, TONE_MIDI, TONES, toneSuit, type Tone } from './chord';
import type { Level } from './kept';
import type { HandKind, PlayedCard } from './poker';
import { handRhythm } from './rhythm';

const card = (suit: Suit, level: Level | null) => ({ suit, level });
const played = (suit: PlayedCard['suit'], extra: Partial<PlayedCard> = {}): PlayedCard => ({ rank: 7, suit, day: '2026-10-19', joker: false, ...extra });
const pitches = (tones: readonly Tone[]) => tones.map((t) => TONE_MIDI[t]);

describe('each part of you plays a note', () => {
  it('gives each part of you a note in F', () => {
    expect(SUIT_NOTE).toEqual({ spades: 'F', hearts: 'A', diamonds: 'C', clubs: 'D' });
  });

  it('sounds the suit at the Floor, its octave at the Ceiling, and a step up into it on a Comeback', () => {
    expect(keepSound('clubs', 'floor')).toBe('floor-clubs');
    expect(keepSound('spades', 'ceiling')).toBe('ceiling-spades');
    expect(keepSound('hearts', 'floor', { comeback: true })).toBe('resolve-hearts');
    expect(keepSound('diamonds', 'ceiling', { comeback: true })).toBe('resolve-diamonds');
    expect(keepSound('diamonds', 'ceiling', { comeback: false })).toBe('ceiling-diamonds');
  });

  it('names every keep sound once, for sound.ts to cover', () => {
    for (const suit of SUITS) for (const level of ['floor', 'ceiling'] as const) {
      expect(KEY_SOUNDS).toContain(keepSound(suit, level));
      expect(KEY_SOUNDS).toContain(keepSound(suit, level, { comeback: true }));
    }
    expect(new Set(KEY_SOUNDS).size).toBe(KEY_SOUNDS.length);
    expect(KEY_SOUNDS).toHaveLength(14);
  });

  it('pitches each suit’s notes as F, A, C and D, an octave apart, with the low F below them all', () => {
    const names = ['F', 'F', 'A', 'C', 'D', 'F', 'A', 'C', 'D'];
    const NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    expect(TONES.map((t) => NAME[TONE_MIDI[t] % 12])).toEqual(names);
    expect(pitches(TONES)).toEqual([...pitches(TONES)].sort((a, b) => a - b));
    for (const suit of SUITS) {
      const [floor] = dayChord([card(suit, 'floor')]).notes;
      const both = dayChord([card(suit, 'ceiling')]).notes;
      expect(both).toHaveLength(2);
      expect(TONE_MIDI[both[1]] - TONE_MIDI[floor]).toBe(12);
      expect(toneSuit(floor)).toBe(suit);
    }
    expect(toneSuit('ring-low')).toBeNull();
  });
});

describe('the day’s chord', () => {
  it('only sounds the suits that were kept', () => {
    const { notes } = dayChord([card('clubs', 'floor'), card('hearts', null), card('spades', 'floor')]);
    expect(notes).toEqual(['ring-f4', 'ring-d5']);
    expect(dayChord([card('clubs', null)]).notes).toEqual([]);
  });

  it('adds the octave for a suit kept at the Ceiling, and each note sounds once', () => {
    expect(dayChord([card('hearts', 'floor'), card('hearts', 'ceiling')]).notes).toEqual(['ring-a4', 'ring-a5']);
    expect(dayChord([card('diamonds', 'floor'), card('diamonds', 'floor')]).notes).toEqual(['ring-c5']);
  });

  it('runs low to high and never passes eight notes, however big the deck', () => {
    const deck = SUITS.flatMap((s) => [card(s, 'ceiling'), card(s, 'floor'), card(s, 'ceiling')]);
    const { notes } = dayChord(deck);
    expect(notes.length).toBeLessThanOrEqual(MAX_DAY_NOTES);
    expect(notes).toHaveLength(8);
    expect(pitches(notes)).toEqual([...pitches(notes)].sort((a, b) => a - b));
    expect(notes).not.toContain('ring-low');
  });

  it('is complete only once every card is kept', () => {
    expect(dayChord([card('clubs', 'floor'), card('hearts', 'ceiling')]).complete).toBe(true);
    expect(dayChord([card('clubs', 'floor'), card('hearts', null)]).complete).toBe(false);
    expect(dayChord([]).complete).toBe(false);
  });
});

describe('the strum', () => {
  it('plays low to high, 70 ms apart, each note lighting its suit', () => {
    const steps = strum(['ring-d6', 'ring-f4', 'ring-a4', 'ring-d5']);
    expect(steps.map((s) => s.tone)).toEqual(['ring-f4', 'ring-a4', 'ring-d5', 'ring-d6']);
    expect(steps.map((s) => s.delayMs)).toEqual([0, 70, 140, 210]);
    expect(steps.map((s) => s.suit)).toEqual(['spades', 'hearts', 'clubs', 'clubs']);
  });

  it('plays a note given twice once, and nothing for no notes', () => {
    expect(strum(['ring-c5', 'ring-c5']).map((s) => s.tone)).toEqual(['ring-c5']);
    expect(strum([])).toEqual([]);
  });

  it('strums a whole kept day as one chord in under half a second', () => {
    const steps = strum(dayChord(SUITS.map((s) => card(s, 'ceiling'))).notes);
    expect(steps).toHaveLength(8);
    expect(steps.at(-1)?.delayMs).toBe(490);
    for (let i = 1; i < steps.length; i++) expect(steps[i].delayMs - steps[i - 1].delayMs).toBe(70);
  });
});

describe('the hand’s chord', () => {
  it('rings each played card’s note, five at most, with the low F for a card with no suit', () => {
    const steps = handChord({ cards: [played('clubs'), played(null), played(null, { joker: true }), played('hearts'), played(null, { river: true }), played('spades')] });
    expect(steps.length).toBeLessThanOrEqual(5);
    expect(steps.map((s) => s.tone)).toEqual(['ring-d5', 'ring-low', 'ring-low', 'ring-a4', 'ring-low']);
    expect(steps.filter((s) => s.tone === 'ring-low').every((s) => s.suit === null)).toBe(true);
  });

  it('climbs to the octave when a suit comes round again', () => {
    const steps = handChord({ cards: [played('diamonds'), played('diamonds'), played('diamonds')] });
    expect(steps.map((s) => s.tone)).toEqual(['ring-c5', 'ring-c6', 'ring-c5']);
  });

  it('rolls across the fan 70 ms apart when it has no shape to follow', () => {
    const steps = handChord({ cards: [played('clubs'), played('hearts'), played('spades')] });
    expect(steps.map((s) => s.delayMs)).toEqual([0, 70, 140]);
  });

  it('rings each card on the beat it lifts, then rolls in the cards that only fill the hand', () => {
    const five = ['clubs', 'hearts', 'spades', 'diamonds', 'clubs'].map((s) => played(s as Suit));
    const full = handChord({ kind: 'full-house', cards: five });
    expect(full.map((s) => s.delayMs)).toEqual(handRhythm('full-house').map((b) => b.at));
    const pair = handChord({ kind: 'pair', cards: five });
    expect(pair.map((s) => s.delayMs)).toEqual([0, 90, 350, 395, 440]);
    const kinds: HandKind[] = ['high-card', 'pair', 'two-pair', 'three-of-a-kind', 'straight', 'full-house', 'four-of-a-kind', 'straight-flush', 'royal-flush', 'five-of-a-kind', 'flush'];
    for (const kind of kinds) {
      const steps = handChord({ kind, cards: five });
      expect(steps).toHaveLength(5);
      for (let i = 1; i < steps.length; i++) expect(steps[i].delayMs).toBeGreaterThan(steps[i - 1].delayMs);
      for (const b of handRhythm(kind)) if (b.card >= 0) expect(steps.some((s) => s.delayMs === b.at)).toBe(true);
      expect(steps.at(-1)!.delayMs).toBeLessThanOrEqual(1300);
    }
  });

  it('copes with a short week’s hand', () => {
    expect(handChord({ kind: 'pair', cards: [played('clubs'), played('clubs')] }).map((s) => [s.tone, s.delayMs])).toEqual([
      ['ring-d5', 0],
      ['ring-d6', 90],
    ]);
    expect(handChord({ kind: 'high-card', cards: [] })).toEqual([]);
  });
});
