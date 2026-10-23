import { describe, expect, it } from 'vitest';

import type { DayCard } from './deal';
import { weekTotal, type Week } from './game';
import { bestHand } from './poker';
import { payoutPieces } from './showdown';

const card = (day: string, rank: number): DayCard => ({ kind: 'card', day, rank, suits: ['clubs'], ceilingSuits: [], tier: 'kept-all', lo: 5, rescued: false }) as DayCard;

function week(extra: Partial<Week>): Week {
  const hand = bestHand([card('2026-10-05', 9), card('2026-10-06', 9), card('2026-10-07', 4)]);
  return { start: '2026-10-05', slots: [], hand, call: null, madeCall: false, chips: 30, suitedBonus: 0, bonus: 0, callMultiplier: 0, live: false, warmup: false, river: { earned: false, need: 2, card: null }, contains: new Set(), keptDays: 3, ...extra };
}

describe('the payout', () => {
  it('comes in pieces that add up to what the week paid: the hand, then the call', () => {
    const plain = week({});
    expect(payoutPieces(plain)).toEqual([{ label: 'Pair', chips: 30 }]);
    const called = week({ call: 'pair', madeCall: true, bonus: 60, callMultiplier: 2 });
    expect(payoutPieces(called)).toEqual([
      { label: 'Pair', chips: 30 },
      { label: 'Call', chips: 60 },
    ]);
    // A Suited week (if Suited ever pays again) is its own piece, never counted as the call.
    const suited = week({ call: 'pair', madeCall: true, bonus: 60, callMultiplier: 2, suitedBonus: 25 });
    expect(payoutPieces(suited)).toEqual([
      { label: 'Pair', chips: 30 },
      { label: 'Suited', chips: 25 },
      { label: 'Call', chips: 60 },
    ]);
    for (const w of [plain, called, suited]) expect(payoutPieces(w).reduce((sum, p) => sum + p.chips, 0)).toBe(weekTotal(w));
    expect(payoutPieces(week({ hand: null, chips: 0 }))).toEqual([]);
  });
});
