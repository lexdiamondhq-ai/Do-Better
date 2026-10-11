import { describe, expect, it } from 'vitest';

import { addDays, weekDays } from './day';
import type { DealHabit } from './deal';
import { BACKS, dealEvent, flushDraw, lastShowdown, playGame, playLiveWeek, playPastWeeks, suggestCall, unlocksFor, type GameInput, type Week } from './game';
import type { CheckIns, Level } from './kept';
import { atLeast, HANDS, type HandKind } from './poker';

// Mondays.
const W1 = '2026-09-21';
const W2 = '2026-09-28';
const W3 = '2026-10-05';

function input(over: Partial<GameInput> & { days?: Record<string, Record<string, Level>> }): GameInput {
  const { days = {}, ...rest } = over;
  const checkIns = new Map<string, CheckIns>(Object.entries(days).map(([id, d]) => [id, new Map(Object.entries(d))]));
  return { seed: 'test-user', today: '2026-10-07', habits: [read], checkIns, calls: new Map(), ...rest };
}

const read: DealHabit = { id: 'read', suit: 'clubs', startedOn: W1, archivedOn: null };
const walk: DealHabit = { id: 'walk', suit: 'spades', startedOn: W1, archivedOn: null };

/** Every day of a week (or the first `n`) at one level. */
function keep(start: string, level: Level = 'floor', n = 7): Record<string, Level> {
  return Object.fromEntries(weekDays(start).slice(0, n).map((d) => [d, level]));
}

describe('playGame', () => {
  it('plays every week from the first habit to now, and banks only finished ones', () => {
    const game = playGame(input({ days: { read: { ...keep(W1), ...keep(W2, 'floor', 3), ...keep(W3, 'ceiling', 2) } } }));
    expect(game.weeks.map((w) => w.start)).toEqual([W1, W2]);
    expect(game.current.start).toBe(W3);
    expect(game.current.live).toBe(true);
    expect(game.stack).toBe(game.weeks.reduce((s, w) => s + w.chips + w.bonus, 0));
    expect(game.stack).toBeGreaterThan(0);
  });

  it('makes a one-habit week of five kept days at least a Flush, since every card shares a suit', () => {
    const game = playGame(input({ days: { read: keep(W1, 'floor', 5) } }));
    expect(atLeast(game.weeks[0].hand!.kind, 'flush')).toBe(true);
    expect(game.weeks[0].hand?.cards.every((c) => c.suit === 'clubs')).toBe(true);
  });

  it('pays the called hand as a bonus when the week makes it, and nothing is lost when it does not', () => {
    const calls = new Map<string, HandKind>([[W1, 'flush'], [W2, 'royal-flush']]);
    const game = playGame(input({ calls, days: { read: { ...keep(W1, 'floor', 5), ...keep(W2, 'floor', 2) } } }));
    const [w1, w2] = game.weeks;
    expect(w1.madeCall).toBe(true);
    expect(w1.bonus).toBe(HANDS.flush.chips);
    expect(w2.madeCall).toBe(false);
    expect(w2.bonus).toBe(0);
    expect(w2.chips).toBe(HANDS[w2.hand!.kind].chips);
  });

  it('fills the Hall of Hands with counts, the first week and the best hand', () => {
    const game = playGame(input({ today: '2026-10-19', days: { read: { ...keep(W1), ...keep(W2), ...keep(W3, 'ceiling') } } }));
    const made = game.hall.filter((e) => e.count > 0);
    expect(made.reduce((s, e) => s + e.count, 0)).toBe(game.weeks.filter((w) => w.hand).length);
    for (const e of made) expect(e.best?.hand.kind).toBe(e.kind);
    expect(game.bestEver?.hand.score).toBe(Math.max(...game.weeks.map((w) => w.hand?.score ?? 0)));
  });

  it('unlocks the card back for the best hand made and every one below it, and tables as the stack grows', () => {
    const game = playGame(input({ days: { read: keep(W1, 'floor', 5) } }));
    const best = game.weeks[0].hand!.kind;
    for (const b of BACKS) expect(game.backs.has(b.key)).toBe(b.key === 'classic' || atLeast(best, b.hand));
    expect(game.tables.has('kitchen')).toBe(true);
    expect(game.tables.has('gold-room')).toBe(false);
  });

  it('has an empty week and no tips with no habits', () => {
    const game = playGame(input({ habits: [] }));
    expect(game.weeks).toEqual([]);
    expect(game.current.hand).toBeNull();
    expect(game.tips).toEqual([]);
  });
});

describe('playPastWeeks', () => {
  it('can be kept and handed back without changing the game', () => {
    const i = input({ days: { read: { ...keep(W1), ...keep(W2, 'ceiling', 4), ...keep(W3, 'floor', 2) } } });
    expect(playGame(i, playPastWeeks(i))).toEqual(playGame(i));
  });
});

describe('suggestCall', () => {
  const week = (kind: HandKind | null): Week => ({
    start: W1,
    slots: [],
    hand: kind ? { kind, cards: [], ranks: [], suit: null, score: 0, title: '' } : null,
    call: null,
    madeCall: false,
    chips: 0,
    bonus: 0,
    live: false,
  });

  it('starts everyone on a Flush', () => {
    expect(suggestCall([])).toBe('flush');
  });

  it('suggests one step above your usual hand', () => {
    expect(suggestCall([week('pair'), week('two-pair'), week('pair'), week('flush')])).toBe('two-pair');
    expect(suggestCall([week('high-card')])).toBe('pair');
    expect(suggestCall([week('royal-flush'), week('royal-flush')])).toBe('royal-flush');
  });

  it('skips weeks with no hand at all', () => {
    expect(suggestCall([week('flush'), week(null), week(null)])).toBe('full-house');
  });
});

describe('tips', () => {
  it('asks for a habit when today has no card yet', () => {
    const game = playGame(input({ days: { read: keep(W3, 'floor', 2) } }));
    expect(game.tips[0]).toMatchObject({ tone: 'deal' });
  });

  it('offers to rescue yesterday after a blank day', () => {
    const game = playGame(input({ days: { read: { ...keep(W2), [W3]: 'floor' } } }));
    expect(game.rescue).toBe('2026-10-06');
    expect(game.tips.some((t) => t.tone === 'rescue')).toBe(true);
  });

  it('points at a face card within reach today, and deals a Joker when it lands', () => {
    // Nine Clubs votes so far: one more earns the Jack.
    const nine = Object.fromEntries(weekDays(W2).concat(weekDays(W3).slice(0, 2)).slice(-9).map((d) => [d, 'floor' as Level]));
    const before = playGame(input({ days: { read: nine } }));
    expect(before.tips[0]).toMatchObject({ tone: 'face', text: expect.stringContaining('Jack of Clubs') });
    const after = playGame(input({ days: { read: { ...nine, '2026-10-07': 'floor' } } }));
    expect(after.current.slots[2].card?.kind).toBe('joker');
    expect(after.tips[0]).toMatchObject({ tone: 'joker' });
    expect(after.faces.map((f) => f.face.face)).toEqual(['jack']);
  });

  it('calls a perfect day locked in', () => {
    const game = playGame(input({ habits: [read, walk], days: { read: keep(W3, 'ceiling', 3), walk: keep(W3, 'ceiling', 3) } }));
    expect(game.tips[0]).toMatchObject({ tone: 'done' });
  });

  it('nudges for the rest of the deck on a partial day', () => {
    const game = playGame(input({ habits: [read, walk], days: { read: keep(W3, 'floor', 3), walk: keep(W3, 'floor', 2) } }));
    expect(game.tips[0]).toMatchObject({ tone: 'climb', text: expect.stringContaining('up to an Ace') });
  });

  it('spots a flush draw and says what it needs', () => {
    const game = playGame(input({ habits: [read, walk], days: { read: keep(W3, 'floor', 2), walk: keep(W3, 'floor', 3) } }));
    const draw = flushDraw(game.current, input({ habits: [read, walk] }));
    expect(draw).toMatchObject({ suit: 'spades', have: 3, left: 4 });
    expect(game.tips.some((t) => t.tone === 'draw' && t.text.includes('♠'))).toBe(true);
  });

  it('opens calls on Monday and warns on Sunday', () => {
    expect(playGame(input({ today: W3 })).tips.some((t) => t.tone === 'call')).toBe(true);
    expect(playGame(input({ today: W3 })).callOpen).toBe(true);
    expect(playGame(input({ today: addDays(W3, 6) })).tips.some((t) => t.tone === 'showdown')).toBe(true);
  });
});

describe('dealEvent', () => {
  it('reports the card a check-in dealt and the hand before and after', () => {
    const before = playLiveWeek(input({ days: { read: keep(W3, 'floor', 2) } }));
    const after = playLiveWeek(input({ days: { read: keep(W3, 'floor', 3) } }));
    const event = dealEvent(before, after);
    expect(event?.was).toBeNull();
    expect(event?.card.day).toBe('2026-10-07');
    expect(event?.hand).toEqual(after.hand);
  });

  it('stays quiet when nothing about the card changed', () => {
    const week = playLiveWeek(input({ days: { read: keep(W3, 'floor', 3) } }));
    expect(dealEvent(week, week)).toBeNull();
  });

  it('stays quiet when the card gets worse, and announces it when it gets better', () => {
    const today = '2026-10-07';
    const week = (seed: string, level: Level) => playLiveWeek(input({ seed, days: { read: { ...keep(W3, 'floor', 2), [today]: level } } }));
    const rank = (w: Week) => {
      const card = w.slots[2].card;
      return card?.kind === 'card' ? card.rank : 0;
    };
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      // One habit: its Floor deals 2 to Ace and its Ceiling 10 to Ace, so on most seeds the Ceiling is higher.
      const floor = week(`p-${i}`, 'floor');
      const ceiling = week(`p-${i}`, 'ceiling');
      if (rank(floor) === rank(ceiling)) continue;
      checked++;
      expect(rank(floor)).toBeLessThan(rank(ceiling));
      expect(dealEvent(floor, ceiling)?.card.day).toBe(today);
      expect(dealEvent(ceiling, floor)).toBeNull();
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('announces the same rank in one more suit, and stays quiet when it loses one', () => {
    const today = '2026-10-07';
    const craft: DealHabit = { id: 'craft', suit: 'diamonds', startedOn: W1, archivedOn: null };
    const habits = [read, walk, craft];
    // One or two of three kept is Showed up either way, so the rank stays and only the suits change.
    const one = playLiveWeek(input({ habits, days: { read: { [today]: 'floor' } } }));
    const two = playLiveWeek(input({ habits, days: { read: { [today]: 'floor' }, walk: { [today]: 'floor' } } }));
    const [a, b] = [one.slots[2].card, two.slots[2].card];
    expect(a?.kind === 'card' && b?.kind === 'card' && a.rank === b.rank).toBe(true);
    expect(b?.suits).toEqual(['clubs', 'spades']);
    expect(dealEvent(one, two)?.was).toEqual(a);
    expect(dealEvent(two, one)).toBeNull();
  });

  it('announces a Joker once, not again when more habits are kept that day', () => {
    const today = '2026-10-07';
    // Nine Clubs votes so far: keeping Read today earns the Jack, which deals today's Joker.
    const nine = Object.fromEntries(weekDays(W2).concat(weekDays(W3).slice(0, 2)).map((d) => [d, 'floor' as Level]));
    const habits = [read, walk];
    const before = playLiveWeek(input({ habits, days: { read: nine } }));
    const one = playLiveWeek(input({ habits, days: { read: { ...nine, [today]: 'floor' } } }));
    const two = playLiveWeek(input({ habits, days: { read: { ...nine, [today]: 'floor' }, walk: { [today]: 'floor' } } }));
    expect(dealEvent(before, one)?.card.kind).toBe('joker');
    expect(two.slots[2].card?.kind).toBe('joker');
    expect(dealEvent(one, two)).toBeNull();
  });
});

describe('showdown', () => {
  it('shows last week once the new week starts, with what it unlocked', () => {
    const game = playGame(input({ days: { read: { ...keep(W1, 'floor', 1), ...keep(W2, 'floor', 5) } } }));
    const week = lastShowdown(game);
    expect(week?.start).toBe(W2);
    const unlocks = unlocksFor(game, week!);
    expect(unlocks.firstOfKind).toBe(game.weeks[0].hand?.kind !== week?.hand?.kind);
    // The first week was one kept day, a high card, so a Flush or better here opens a run of backs at once.
    expect(unlocks.backs).toContain('velvet');
    expect(unlocks.backs).not.toContain('classic');
  });

  it('has no showdown when last week had no cards', () => {
    expect(lastShowdown(playGame(input({ days: { read: keep(W1, 'floor', 2) } })))).toBeNull();
  });
});
