import { describe, expect, it } from 'vitest';

import { dayChord, keepSound, SUIT_NOTE } from './chord';

describe('the day’s chord', () => {
  it('gives each part of you a note in F', () => {
    expect(SUIT_NOTE).toEqual({ spades: 'F', hearts: 'A', diamonds: 'C', clubs: 'D' });
  });

  it('keeps today’s Floor and Ceiling sounds until each suit has its own', () => {
    expect(keepSound('clubs', 'floor')).toBe('floor');
    expect(keepSound('hearts', 'ceiling', { comeback: true })).toBe('ceiling');
  });

  it('is complete only once every card is kept', () => {
    expect(dayChord([{ suit: 'clubs', level: 'floor' }, { suit: 'hearts', level: 'ceiling' }]).complete).toBe(true);
    expect(dayChord([{ suit: 'clubs', level: 'floor' }, { suit: 'hearts', level: null }]).complete).toBe(false);
    expect(dayChord([]).complete).toBe(false);
  });
});
