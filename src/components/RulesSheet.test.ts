import { describe, expect, it, vi } from 'vitest';

import { FACES, RUNGS } from '@/engine/court';
import { KEPT_LO, RIVER_DAYS, TOP_LO } from '@/engine/deal';
import { CALL_HISTORY } from '@/engine/game';
import { HANDS, SUITED_BONUS } from '@/engine/poker';

// The sheet's words are plain data; nothing on screen is drawn here.
vi.mock('react-native', () => ({ Modal: () => null, Platform: { OS: 'ios' }, Pressable: () => null, ScrollView: () => null, View: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('@/theme/ThemeProvider', () => ({ useTheme: () => ({}) }));
vi.mock('@/lib/feel', () => ({ tick: () => {} }));
vi.mock('./ui', () => ({ Body: () => null, Display: () => null, Label: () => null }));
vi.mock('./HandFan', () => ({ EXAMPLES: {}, HandRow: () => null }));
vi.mock('./Suit', () => ({ SuitGlyph: () => null }));
vi.mock('./Chips', () => ({ formatChips: (n: number) => String(n) }));

const { RULES, HAND_PRICES } = await import('./RulesSheet');

const all = RULES.flatMap((s) => [s.title, s.chip, ...s.rules.flatMap((r) => [r.term, r.line])]);
const line = (term: string) => RULES.flatMap((s) => s.rules).find((r) => r.term === term)?.line ?? '';

describe('the rules sheet', () => {
  it('has a section for every topic a screen can open it at', () => {
    expect(RULES.map((s) => s.key).sort()).toEqual(['call', 'comeback', 'court', 'deal', 'river', 'week']);
  });

  it('prices every hand the way the engine pays it, with no Flush', () => {
    expect(HAND_PRICES.map((h) => `${h.name} ${h.chips}`)).toEqual([
      'High card 10',
      'Pair 30',
      'Two pair 50',
      'Three of a kind 70',
      'Straight 100',
      'Full house 140',
      'Four of a kind 250',
      'Straight flush 350',
      'Royal flush 500',
      'Five of a kind 800',
    ]);
    for (const h of HAND_PRICES) expect(HANDS[h.kind].chips).toBe(h.chips);
    expect(line('No Flush')).toMatch(/isn’t a hand/);
  });

  it('describes the bands the deal really uses', () => {
    expect(KEPT_LO).toBe(5);
    expect(TOP_LO).toBe(6);
    expect(line('Some kept')).toMatch(/2, 3 or 4/);
    expect(line('Everything kept')).toMatch(new RegExp(`${KEPT_LO} or better`));
    expect(line('Everything at its Ceiling')).toMatch(new RegExp(`${TOP_LO} or better`));
    expect(line('Up to the Ace')).toMatch(/Ace/);
  });

  it('says Suited pays nothing, because it doesn’t', () => {
    expect(SUITED_BONUS).toBe(0);
    expect(line('Suited')).toMatch(/pays nothing/);
    expect(all.join(' ')).not.toMatch(/\+\s?30/);
  });

  it('gets the river, the calls and the Court right', () => {
    expect(line('River card')).toMatch(new RegExp(`${RIVER_DAYS} days`));
    expect(line('River card')).toMatch(/saved days don’t count/);
    expect(line('Face down')).toMatch(/no suit/);
    expect(line('Safe ×1, Stretch ×2, Long shot ×3')).toMatch(new RegExp(`last ${CALL_HISTORY} weeks`));
    expect(line('When')).toBe('A call stays open until the end of the first day this week you keep something.');
    expect(line('Face cards')).toBe(`${FACES.map((f) => `${f.name} at ${f.votes}`).join(', ')} days.`);
    expect(line('Face cards')).toBe('Jack at 10, Queen at 30, King at 100, Ace at 365 days.');
    expect(RUNGS).toEqual([150, 200, 250, 300]);
    expect(line('Rungs')).toMatch(/150, 200, 250 and 300 days.*no Joker/);
    expect(line('Four suits')).toMatch(/♥ People/);
    expect(new Set(RULES.flatMap((s) => s.rules.map((r) => r.term))).size).toBe(RULES.flatMap((s) => s.rules).length);
    expect(line('Joker')).toMatch(/no suit/);
    expect(line('One a week')).toMatch(/none is ever lost/);
  });

  it('gets coming back right', () => {
    expect(line('Saved day')).toMatch(/no suit/);
    expect(line('Sunday')).toMatch(/can’t be saved/);
    expect(line('Did it, forgot to log')).toMatch(/yesterday.*same week/);
  });

  it('speaks in Do Better’s own words', () => {
    const text = all.join('\n');
    expect(text).not.toMatch(/\bodds\b|wager|jackpot|\bbets?\b|\brake\b|high-roller|best value/i);
    expect(text.replace(/No streaks/g, '')).not.toMatch(/streak/i);
    expect(text).not.toMatch(/\bvot(e|es|ing)\b|two-minute|2-minute|never (miss )?twice|rescued|habit-days|crowned/i);
  });
});
