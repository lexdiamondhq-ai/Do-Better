import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RANKS, type Rank, type Suit } from './cards';
import { weekDays, type Day } from './day';
import * as deal from './deal';
import { keptCards, riverBand, type DayCard, type Slot } from './deal';
import type { Week } from './game';
import { callGap, callGroups, callLine, drawsLeft, drawsLine, outCards, outName, outs, outsLine, outsWorthSaying, phrase, riverOuts, riverOutsLine, type OutGroup } from './outs';
import { bestHand, handIndex, HANDS, handsIn, type HandKind } from './poker';

// The live river card must never be worked out early: every call to it from here is recorded.
vi.mock('./deal', async (importOriginal) => {
  const real = await importOriginal<typeof import('./deal')>();
  return { ...real, riverCard: vi.fn(real.riverCard), unit: vi.fn(real.unit) };
});

// 2026-10-05 is a Monday.
const MON = '2026-10-05';
const DAYS = weekDays(MON);
const SUN = DAYS[6];
const ROTATE: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const WEEKDAY = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;

/** A day's card: a rank with suits (taking turns by default), a saved day, a Joker, or nothing (a blank day). */
type Spec = Rank | [Rank, ...Suit[]] | { saved: Rank } | 'joker' | null;

function cardFor(spec: Exclude<Spec, null>, day: Day, i: number, lo: Rank): DayCard {
  if (spec === 'joker') return { kind: 'joker', day, suits: ['clubs'], ceilingSuits: [], tier: 'kept-all', lo };
  if (typeof spec === 'object' && !Array.isArray(spec)) return { kind: 'card', day, rank: spec.saved, suits: [], ceilingSuits: [], tier: 'showed-up', lo: 2, rescued: true };
  const [rank, ...given] = Array.isArray(spec) ? spec : [spec];
  const suits = given.length ? given : [ROTATE[i % 4]];
  return { kind: 'card', day, rank, suits, ceilingSuits: [], tier: lo >= 5 ? 'kept-all' : 'showed-up', lo, rescued: false };
}

/**
 * A week being played, Monday onward, one spec per day up to and including `today`. Days after today are
 * still to come. `lo` sets each kept day's band (5, a fully kept day, by default).
 */
function live(specs: readonly Spec[], today: Day, o: { lo?: Rank | readonly Rank[]; call?: HandKind | null; warmup?: boolean } = {}): Week {
  const slots: Slot[] = DAYS.map((day, i) => {
    const isToday = day === today;
    if (day > today) return { day, state: 'future', card: null, isToday };
    const spec = specs[i] ?? null;
    if (spec === null) return { day, state: isToday ? 'open' : 'blank', card: null, isToday };
    const lo = Array.isArray(o.lo) ? (o.lo as Rank[])[i] : ((o.lo as Rank | undefined) ?? 5);
    return { day, state: 'dealt', card: cardFor(spec, day, i, lo), isToday };
  });
  const cards = slots.flatMap((s) => (s.card ? [s.card] : []));
  const kept = keptCards(slots).length;
  const warmup = !!o.warmup;
  return {
    start: MON,
    slots,
    hand: bestHand(cards),
    call: o.call ?? null,
    madeCall: false,
    chips: 0,
    suitedBonus: 0,
    bonus: 0,
    callMultiplier: 0,
    live: true,
    warmup,
    river: { earned: !warmup && kept >= 5, need: Math.max(0, 5 - kept), card: null },
    contains: handsIn(cards),
    keptDays: kept,
  };
}

const cardsOf = (w: Week) => w.slots.flatMap((s) => (s.card ? [s.card] : []));
const ranksOf = (groups: readonly OutGroup[]) => groups.flatMap((g) => g.ranks);

/** A little seeded random, so the property checks are the same every run. */
function rng(seed: number) {
  let x = seed;
  return () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

function randomWeek(next: () => number): Week {
  const today = DAYS[Math.floor(next() * 7)];
  const specs: Spec[] = DAYS.map((day) => {
    if (day > today) return null;
    const roll = next();
    if (roll < 0.12) return null;
    if (roll < 0.17) return 'joker';
    const suits = ROTATE.filter(() => next() < 0.4);
    return [(2 + Math.floor(next() * 13)) as Rank, ...(suits.length ? suits : ['clubs' as Suit])];
  });
  const lo = DAYS.map(() => (2 + Math.floor(next() * 5)) as Rank);
  return live(specs, today, { lo });
}

beforeEach(() => {
  vi.mocked(deal.riverCard).mockClear();
  vi.mocked(deal.unit).mockClear();
});

describe('outs', () => {
  it('names both ends of an open straight draw', () => {
    const groups = outs(cardsOf(live([6, 7, 8, 9], DAYS[3])));
    expect(groups[0]).toEqual({ makes: 'straight', ranks: [10, 5] });
    expect(groups[1]).toEqual({ makes: 'pair', ranks: [9, 8, 7, 6] });
  });

  it('names the one rank that fills a gutshot', () => {
    const groups = outs(cardsOf(live([5, 6, 8, 9], DAYS[3])));
    expect(groups[0]).toEqual({ makes: 'straight', ranks: [7] });
  });

  it('takes trips to Four of a kind and a Full house', () => {
    const groups = outs(cardsOf(live([8, 8, 8, 13, 6], DAYS[4])));
    expect(groups).toEqual([
      { makes: 'four-of-a-kind', ranks: [8] },
      { makes: 'full-house', ranks: [13, 6] },
    ]);
  });

  it('lets a Joker play as whatever helps, outs included', () => {
    const w = live([7, 8, 'joker', 10], DAYS[3]);
    expect(w.hand?.kind).toBe('pair');
    const straight = outs(cardsOf(w)).find((g) => g.makes === 'straight');
    expect(straight?.ranks).toEqual([11, 9, 6]);
  });

  it('never names a rank below 5, even when asked to', () => {
    const groups = outs(cardsOf(live([2, 3, 4, 13], DAYS[3])), { minRank: 2 });
    expect(Math.min(...ranksOf(groups))).toBeGreaterThanOrEqual(5);
    // An Ace-to-Five straight needs a Five, which is named; the Two, Three and Four are not.
    expect(groups.find((g) => g.makes === 'straight')).toBeUndefined();
    expect(outs(cardsOf(live([2, 3, 4, 14], DAYS[3])))[0]).toEqual({ makes: 'straight', ranks: [5] });
  });

  it('never names a rank below 5 and lists groups best first, across many weeks', () => {
    const next = rng(17);
    for (let i = 0; i < 400; i++) {
      const w = randomWeek(next);
      const groups = outs(cardsOf(w));
      for (const r of ranksOf(groups)) expect(r).toBeGreaterThanOrEqual(5);
      for (let k = 1; k < groups.length; k++) expect(handIndex(groups[k - 1].makes)).toBeGreaterThan(handIndex(groups[k].makes));
      for (const g of groups) {
        expect(handIndex(g.makes)).toBeGreaterThan(handIndex(w.hand!.kind));
        expect([...g.ranks].sort((a, b) => b - a)).toEqual(g.ranks);
      }
    }
  });

  it('has nothing to add to a Royal flush, or to no cards at all', () => {
    expect(outs(cardsOf(live([[10, 'clubs'], [11, 'clubs'], [12, 'clubs'], [13, 'clubs'], [14, 'clubs']], DAYS[4])))).toEqual([]);
    expect(outs([])).toEqual([]);
  });
});

describe('drawsLeft', () => {
  it('counts the days still to play, today while it has no card', () => {
    expect(drawsLeft(live([5, 6], DAYS[2]), DAYS[2])).toEqual({ days: 5, river: true });
    expect(drawsLeft(live([5, 6, 7], DAYS[2]), DAYS[2])).toEqual({ days: 4, river: true });
  });

  it('knows when the river is out of reach, and when it is earned', () => {
    // Thursday with one kept day: four more days can't make five.
    expect(drawsLeft(live([null, null, null, 9], DAYS[3]), DAYS[3])).toEqual({ days: 3, river: false });
    expect(drawsLeft(live([5, 6, 7, 8, 9, 10, 11], SUN), SUN)).toEqual({ days: 0, river: true });
  });

  it('has no draws left on a locked Sunday without a river', () => {
    expect(drawsLeft(live([5, null, 7, null, 9, null, 11], SUN), SUN)).toEqual({ days: 0, river: false });
  });

  it('gives a warm-up week no river', () => {
    expect(drawsLeft(live([5, 6, 7, 8, 9], DAYS[4], { warmup: true }), DAYS[4]).river).toBe(false);
  });
});

describe('a locked Sunday with no river', () => {
  const w = live([5, null, 7, null, 9, null, 11], SUN, { call: 'straight' });

  it('has no outs to say, no river outs and no gap to the call', () => {
    expect(outsWorthSaying(w)).toBe(false);
    expect(riverOuts(w)).toBeNull();
    expect(callGap(w, 'straight', SUN)).toEqual({ made: false, cards: null, ranks: [], days: 0 });
    expect(drawsLine(w, SUN)).toBeNull();
  });
});

describe('outsWorthSaying', () => {
  it('needs three cards this week, a day still to play, and not a warm-up', () => {
    expect(outsWorthSaying(live([5, 6], DAYS[2]))).toBe(false);
    expect(outsWorthSaying(live([5, 6, 7], DAYS[3]))).toBe(true);
    expect(outsWorthSaying(live([5, 6, 7], DAYS[3], { warmup: true }))).toBe(false);
    expect(outsWorthSaying({ ...live([5, 6, 7], DAYS[3]), live: false })).toBe(false);
  });
});

describe('callGap', () => {
  it('is 0 when the hand already makes the call', () => {
    expect(callGap(live([9, 9, 4], DAYS[2]), 'pair', DAYS[2])).toMatchObject({ made: true, cards: 0 });
    // Better than called still makes it.
    expect(callGap(live([9, 9, 9], DAYS[2]), 'pair', DAYS[2])).toMatchObject({ made: true, cards: 0 });
  });

  it('is 1 when any single out makes it, and names those ranks', () => {
    const w = live([8, 8, 8, 13, 6], DAYS[4]);
    expect(callGap(w, 'full-house', DAYS[4])).toEqual({ made: false, cards: 1, ranks: [13, 8, 6], days: 2 });
  });

  it('is 2 when only a pair of ranks makes it', () => {
    expect(callGap(live([13, 13, 9, 6], DAYS[3]), 'full-house', DAYS[3])).toMatchObject({ made: false, cards: 2, ranks: [] });
  });

  it('is null when nothing still to come can make it', () => {
    // Saturday with today kept and three kept days: one day left, no river, and a Full house needs two cards.
    const sat = live([13, 13, null, null, null, 6], DAYS[5]);
    expect(drawsLeft(sat, DAYS[5])).toEqual({ days: 1, river: false });
    expect(callGap(sat, 'full-house', DAYS[5]).cards).toBeNull();
    expect(callGap(live([2, 3, 4], DAYS[2]), 'royal-flush', DAYS[2]).cards).toBeNull();
    // A Flush call from the old rules is made by Ceilings, never by a rank.
    expect(callGap(live([9, 9, 4], DAYS[2]), 'flush', DAYS[2]).cards).toBeNull();
  });

  it('stays quiet in a warm-up week', () => {
    expect(callGap(live([8, 8, 8, 13], DAYS[3], { warmup: true }), 'full-house', DAYS[3])).toMatchObject({ made: false, cards: null });
  });

  it('counts the river as the last draw on Sunday, from its band up', () => {
    // Every day kept at a band of 6, Sunday kept: only the river is left, and it deals 6 or better.
    const w = live([7, 7, 7, 13, 9, 2, 3], SUN, { lo: 6 });
    expect(drawsLeft(w, SUN)).toEqual({ days: 0, river: true });
    expect(callGap(w, 'full-house', SUN)).toMatchObject({ cards: 1, ranks: [13, 9, 7] });
    expect(callGap(w, 'four-of-a-kind', SUN)).toMatchObject({ cards: 1, ranks: [7] });
  });
});

describe('riverOuts', () => {
  const friday = live([7, 7, 7, 13, 9], DAYS[4]);

  it('names the ranks the river could lift the hand with, once it is earned', () => {
    const r = riverOuts(friday);
    expect(r).toMatchObject({ ifToday: false, stands: false });
    expect(r?.groups).toEqual([
      { makes: 'four-of-a-kind', ranks: [7] },
      { makes: 'full-house', ranks: [13, 9] },
    ]);
  });

  it('matches a brute force over every rank the river can deal', () => {
    const next = rng(5);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const w = randomWeek(next);
      const r = riverOuts(w);
      if (!r) continue;
      checked++;
      const now = w.hand!;
      const expected = RANKS.filter((rank) => rank >= Math.max(5, r.band)).filter((rank) => {
        const river: DayCard = { kind: 'card', day: '2026-10-12', rank, suits: [], ceilingSuits: [], tier: 'kept-all', lo: 5, rescued: false, river: true };
        return handIndex(bestHand([...cardsOf(w), river])!.kind) > handIndex(now.kind);
      });
      expect(ranksOf(r.groups).sort((a, b) => a - b)).toEqual(expected);
      // Standing is a stronger promise than having nothing to name: it never comes with a named out.
      if (r.stands) expect(expected).toEqual([]);
      expect(r.band).toBeGreaterThanOrEqual(riverBand(w.slots) ?? 2);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('gives the same answer whatever the river card would be, and never deals it', () => {
    const a = { ...friday, river: { ...friday.river, card: deal.riverCard(MON, friday.slots, 'seed-a') } };
    const b = { ...friday, river: { ...friday.river, card: deal.riverCard(MON, friday.slots, 'seed-b') } };
    vi.mocked(deal.riverCard).mockClear();
    vi.mocked(deal.unit).mockClear();
    expect(riverOuts(a)).toEqual(riverOuts(b));
    expect(riverOuts(a)).toEqual(riverOuts(friday));
    riverOutsLine(a);
    callGap(a, 'four-of-a-kind', DAYS[4]);
    expect(deal.riverCard).not.toHaveBeenCalled();
    for (const [key] of vi.mocked(deal.unit).mock.calls) expect(key).not.toMatch(/river/);
  });

  it('looks ahead one kept day: Friday with four kept and nothing kept yet today', () => {
    const r = riverOuts(live([7, 7, 7, 13, null], DAYS[4]));
    expect(r).toMatchObject({ ifToday: true });
    expect(r?.groups[0]).toEqual({ makes: 'four-of-a-kind', ranks: [7] });
  });

  it('is null with no river in reach, and in a warm-up week', () => {
    expect(riverOuts(live([7, 7, 7], DAYS[2]))).toBeNull();
    // Four kept, but today is already kept: the river is a day off, not today.
    expect(riverOuts(live([7, 7, null, 13, 9], DAYS[4]))).toBeNull();
    expect(riverOuts(live([7, 7, 7, 13, 9], DAYS[4], { warmup: true }))).toBeNull();
    expect(riverOuts({ ...friday, live: false })).toBeNull();
  });

  it('starts at the river’s band, the highest the rest of the week could lift it to', () => {
    // Every kept day perfect: the band is 6, so a Five is never named.
    const w = live([5, 9, 10, 11, 13], DAYS[4], { lo: 6 });
    const r = riverOuts(w)!;
    expect(r.band).toBe(6);
    expect(ranksOf(r.groups)).not.toContain(5);
    // Partial days: the band is low, but nothing under 5 is named.
    const low = riverOuts(live([5, 9, 10, 11, 13], DAYS[4], { lo: 2 }))!;
    expect(ranksOf(low.groups)).toContain(5);
    expect(Math.min(...ranksOf(low.groups))).toBeGreaterThanOrEqual(5);
  });

  it('names only ranks the river can deal and promises a hand stands only when it does, however the rest of the week goes', () => {
    const next = rng(23);
    let checked = 0;
    let stood = 0;
    for (let i = 0; i < 300; i++) {
      const w = randomWeek(next);
      const r = riverOuts(w);
      if (!r) continue;
      const today = w.slots.find((s) => s.isToday)!.day;
      const now = w.hand!;
      const lifts = (rank: Rank) => {
        const river: DayCard = { kind: 'card', day: '2026-10-12', rank, suits: [], ceilingSuits: [], tier: 'kept-all', lo: 5, rescued: false, river: true };
        return handIndex(bestHand([...cardsOf(w), river])!.kind) > handIndex(now.kind);
      };
      if (r.stands) stood++;
      // Twenty ways the rest of the week could go: each day still to play skipped, or kept at any band.
      for (let k = 0; k < 20; k++) {
        const slots: Slot[] = w.slots.map((s, j) => {
          const open = s.day > today || (s.day === today && !s.card && s.state === 'open');
          if (!open || next() < 0.3) return s;
          const lo = (2 + Math.floor(next() * 5)) as Rank;
          return { ...s, state: 'dealt', card: cardFor([(lo + Math.floor(next() * (15 - lo))) as Rank], s.day, j, lo) };
        });
        const band = riverBand(slots);
        if (band === null) continue;
        checked++;
        // Every rank it names is one this river could really deal.
        for (const rank of ranksOf(r.groups)) expect(rank).toBeGreaterThanOrEqual(band);
        // "The hand stands" holds for every card this river could deal, ranks under 5 included.
        if (r.stands) for (const rank of RANKS.filter((x) => x >= band)) expect(lifts(rank)).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(stood).toBeGreaterThan(0);
  });

  it('never says the hand stands while a card the river could still deal would lift it', () => {
    // Friday, the river earned: Fives from kept-everything days, Nines from perfect days. Two perfect days to
    // come would lift the river's band to 6, so no Five is named; but with the weekend skipped the band stays
    // at 5, and a Five on the river makes Four of a kind. So it names nothing, and promises nothing either.
    const w = live([5, 5, 5, 9, 9], DAYS[4], { lo: [5, 5, 5, 6, 6] });
    expect(w.hand?.kind).toBe('full-house');
    const r = riverOuts(w)!;
    expect(r).toMatchObject({ band: 6, groups: [], stands: false });
    expect(riverOutsLine(w)).toBeNull();
    // Sunday, kept: nothing is left to pull the band under 6, so the same Full house truly stands.
    const locked = live([5, 5, 5, 9, 9, 11, 12], SUN, { lo: [5, 5, 5, 6, 6, 6, 6] });
    expect(riverOuts(locked)).toMatchObject({ band: 6, groups: [], stands: true });
    expect(riverOutsLine(locked)).toBe('Nothing on the river can lift it. The hand stands.');
  });

  it('says the hand stands when nothing on the river lifts it', () => {
    const royal = live([[10, 'clubs'], [11, 'clubs'], [12, 'clubs'], [13, 'clubs'], [14, 'clubs']], DAYS[4]);
    expect(riverOuts(royal)).toMatchObject({ stands: true, groups: [] });
    expect(riverOutsLine(royal)).toBe('Nothing on the river can lift it. The hand stands.');
  });
});

describe('words', () => {
  it('says a single draw the way a player would', () => {
    expect(outsLine([{ makes: 'straight', ranks: [9] }])).toBe('Drawing to a Straight: any Nine makes it.');
    expect(outsLine([{ makes: 'full-house', ranks: [11, 8] }])).toBe('Drawing to a Full house: any Jack or Eight makes it.');
    expect(outsLine([{ makes: 'three-of-a-kind', ranks: [9, 6, 5] }])).toBe('Drawing to Three of a kind: any Nine, Six or Five makes it.');
  });

  it('makes the called hand yours', () => {
    expect(outsLine([{ makes: 'full-house', ranks: [11, 8] }], { call: 'full-house' })).toBe('Any Jack or Eight makes your Full house.');
  });

  it('names two kinds at most, the second with its own articles', () => {
    expect(
      outsLine([
        { makes: 'four-of-a-kind', ranks: [7] },
        { makes: 'full-house', ranks: [11, 6] },
        { makes: 'two-pair', ranks: [9] },
      ]),
    ).toBe('Any Seven makes Four of a kind. A Jack or a Six makes a Full house.');
    expect(outsLine([{ makes: 'straight', ranks: [14] }, { makes: 'pair', ranks: [8] }])).toBe('Any Ace makes a Straight. An Eight makes a Pair.');
  });

  it('counts ranks instead of naming more than three', () => {
    expect(outsLine([{ makes: 'two-pair', ranks: [13, 11, 9, 6] }])).toBe('4 ranks make your Two pair.');
    expect(outsLine([{ makes: 'straight', ranks: [10, 5] }, { makes: 'pair', ranks: [9, 8, 7, 6] }])).toBe('Any Ten or Five makes a Straight. 4 ranks make your Pair.');
  });

  it('keeps the secret hand secret until it has been made', () => {
    expect(outsLine([{ makes: 'five-of-a-kind', ranks: [9] }])).toBe('Drawing to the secret hand: any Nine makes it.');
    expect(outsLine([{ makes: 'five-of-a-kind', ranks: [9] }], { secretKnown: true })).toBe('Drawing to Five of a kind: any Nine makes it.');
    expect(outName('five-of-a-kind')).toBe('Secret hand');
    expect(outName('straight')).toBe('Straight');
  });

  it('reads a kind the way a sentence needs it, for each ghost card’s spoken label', () => {
    expect(phrase('pair')).toBe('a Pair');
    expect(phrase('two-pair')).toBe('Two pair');
    expect(phrase('full-house')).toBe('a Full house');
    expect(phrase('four-of-a-kind')).toBe('Four of a kind');
    expect(phrase('five-of-a-kind')).toBe('the secret hand');
    expect(phrase('five-of-a-kind', { secretKnown: true })).toBe('Five of a kind');
  });

  it('has nothing to say with no outs', () => {
    expect(outsLine([])).toBeNull();
  });

  it('never names a weekday or a percentage, and never more than two kinds, across many weeks', () => {
    const next = rng(99);
    for (let i = 0; i < 300; i++) {
      const w = randomWeek(next);
      const today = w.slots.find((s) => s.isToday)!.day;
      const lines = [outsLine(outs(cardsOf(w))), riverOutsLine(w), callLine(w, 'full-house', today), callLine(w, 'straight', today), drawsLine(w, today)];
      for (const line of lines) {
        if (!line) continue;
        expect(line).not.toMatch(WEEKDAY);
        expect(line).not.toContain('%');
        expect(line).not.toMatch(/\b(odds|chance)\b/i);
        const kinds = Object.values(HANDS).filter((h) => line.includes(h.name)).length;
        expect(kinds).toBeLessThanOrEqual(2);
      }
    }
  });

  it('writes the call panel line', () => {
    const w = live([8, 8, 8, 13, 6], DAYS[4], { call: 'full-house' });
    // Friday kept, so Saturday and Sunday are left.
    expect(callLine(w, 'full-house', DAYS[4])).toBe('Not made yet. Any Eight makes Four of a kind. A King or a Six makes your Full house. 2 days left.');
    const kings = live([13, 13, 9, 6], DAYS[3]);
    expect(callLine(kings, 'full-house', DAYS[3])).toBe('Not made yet. Two more cards could make your Full house. 3 days left.');
    expect(callLine(live([2, 3, 4], DAYS[2]), 'royal-flush', DAYS[2])).toBe(`Not made yet. ${HANDS['royal-flush'].how}`);
    expect(callLine(live([9, 9], DAYS[1]), 'pair', DAYS[1])).toBeNull();
  });

  it('groups the call’s outs with the called kind kept even when a better kind takes the lead', () => {
    const w = live([9, 9, 13, 7, 6], DAYS[4]);
    const gap = callGap(w, 'two-pair', DAYS[4]);
    expect(callGroups(w, 'two-pair', gap)).toEqual([
      { makes: 'three-of-a-kind', ranks: [9] },
      { makes: 'two-pair', ranks: [13, 7, 6] },
    ]);
  });

  it('names the last draws on Sunday', () => {
    expect(drawsLine(live([5, 6, 7, 8, null, null, null], SUN), SUN)).toBe('Today’s card and the river are your last two draws.');
    expect(drawsLine(live([5, 6, 7, 8, 9, null, 11], SUN), SUN)).toBe('The river is your last draw.');
    expect(drawsLine(live([5, 6, 7], DAYS[3]), DAYS[3])).toBe('4 days left.');
  });

  it('adds “If you keep something today” to a river one kept day away', () => {
    const line = riverOutsLine(live([7, 7, 7, 13, null], DAYS[4]));
    expect(line).toBe('On the river: any Seven makes Four of a kind. A King makes a Full house. If you keep something today.');
    expect(riverOutsLine(live([7, 7, 7, 13, 9], DAYS[4]))).toBe('On the river: any Seven makes Four of a kind. A King or a Nine makes a Full house.');
    // Sunday, four kept and nothing kept yet today: the last chance at the river, said with today's card.
    const sunday = live([7, null, 7, 7, null, 13, null], SUN);
    expect(riverOutsLine(sunday)).toBe('On the river: any Seven makes Four of a kind. A King makes a Full house. If you keep something today.');
    expect(drawsLine(sunday, SUN)).toBe('Today’s card and the river are your last two draws.');
    // Once today is kept the river is earned, and the suffix goes.
    expect(riverOutsLine(live([7, null, 7, 7, null, 13, 9], SUN))).not.toContain('If you keep something today');
  });

  it('names the called hand as yours on the river, as the outs row and the call panel do', () => {
    const week = live([7, 7, 7, 13, 9], DAYS[4]);
    expect(riverOutsLine(week, { call: 'full-house' })).toBe('On the river: any Seven makes Four of a kind. A King or a Nine makes your Full house.');
    expect(riverOutsLine(week, { call: 'four-of-a-kind' })).toBe('On the river: any Seven makes your Four of a kind. A King or a Nine makes a Full house.');
    // A call the river can't reach changes nothing.
    expect(riverOutsLine(week, { call: 'royal-flush' })).toBe(riverOutsLine(week));
  });

  it('caps the ghost cards at six, best kind first', () => {
    const cards = outCards([
      { makes: 'straight', ranks: [10, 5] },
      { makes: 'pair', ranks: [9, 8, 7, 6, 13] },
      { makes: 'high-card', ranks: [2] },
    ]);
    expect(cards).toEqual([
      { makes: 'straight', ranks: [10, 5] },
      { makes: 'pair', ranks: [9, 8, 7, 6] },
    ]);
  });
});
