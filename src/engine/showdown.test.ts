import { describe, expect, it } from 'vitest';

import { createDemoBackend } from '@/lib/demo';
import { gameInput } from '@/lib/play';

import type { Rank, Suit } from './cards';
import { addDays, weekday, weekDays, type Day } from './day';
import { RIVER_DAYS, unit, type DayCard, type DealHabit, type Slot } from './deal';
import { playPastWeeks, weekTotal, type Week } from './game';
import type { CheckIns, Level } from './kept';
import { bestHand, handIndex, HANDS } from './poker';
import {
  captionsFor,
  comebackCredit,
  fanOrder,
  floorCredit,
  handSoFar,
  isFloorDay,
  madeThisLine,
  payoutLine,
  payoutPieces,
  riverCredit,
  stampsFor,
  type CaptionFacts,
} from './showdown';

const MON = '2026-10-05';
const days = weekDays(MON);

type Spec = { rank: Rank; suits?: Suit[]; up?: Suit[]; saved?: boolean; joker?: boolean } | null;

/** A day card as the deal makes it: a Floor day unless it has `up` (Ceiling suits), a saved day with no suit. */
function dayCard(day: Day, s: NonNullable<Spec>): DayCard {
  const ceilingSuits = s.up ?? [];
  if (s.joker) return { kind: 'joker', day, suits: s.suits ?? ['clubs'], ceilingSuits, tier: 'kept-all', lo: 5 };
  if (s.saved) return { kind: 'card', day, rank: s.rank, suits: [], ceilingSuits: [], tier: 'showed-up', lo: 2, rescued: true };
  return { kind: 'card', day, rank: s.rank, suits: s.suits ?? ['clubs'], ceilingSuits, tier: ceilingSuits.length ? 'reached-up' : 'kept-all', lo: 5, rescued: false };
}

/** A finished week from seven day specs (null for a day with no card) and an optional river rank. */
function weekOf(specs: Spec[], river?: Rank): Week {
  const slots: Slot[] = days.map((day, i) => {
    const s = specs[i];
    return s ? { day, state: 'dealt', card: dayCard(day, s), isToday: false } : { day, state: 'before', card: null, isToday: false };
  });
  const dealt = slots.flatMap((s) => (s.card ? [s.card] : []));
  const kept = dealt.filter((c) => !(c.kind === 'card' && c.rescued)).length;
  const riverCard: DayCard | null =
    river && kept >= RIVER_DAYS ? { kind: 'card', day: addDays(MON, 7), rank: river, suits: [], ceilingSuits: [], tier: 'kept-all', lo: 5, rescued: false, river: true } : null;
  const hand = bestHand(riverCard ? [...dealt, riverCard] : dealt);
  return {
    start: MON,
    slots,
    hand,
    call: null,
    madeCall: false,
    chips: hand ? HANDS[hand.kind].chips : 0,
    suitedBonus: 0,
    bonus: 0,
    callMultiplier: 0,
    live: false,
    warmup: false,
    river: { earned: kept >= RIVER_DAYS, need: Math.max(0, RIVER_DAYS - kept), card: riverCard },
    contains: new Set(),
    keptDays: kept,
  };
}

const up = (rank: Rank, suit: Suit = 'clubs'): Spec => ({ rank, suits: [suit], up: [suit] });
const floor = (rank: Rank, suit: Suit = 'clubs'): Spec => ({ rank, suits: [suit] });

/** Every finished week of the demo deck, the curated player and the typical one, seen from a few days. Dealt once. */
let demo: Promise<Week[]> | null = null;
const loadDemoWeeks = () => (demo ??= dealDemoWeeks());

async function dealDemoWeeks(): Promise<Week[]> {
  const out: Week[] = [];
  for (const today of ['2026-10-23', '2026-10-26', '2026-10-28']) {
    for (const typical of [false, true]) {
      const backend = createDemoBackend(today, { typical });
      const data = await backend.load('UTC');
      out.push(...playPastWeeks(gameInput(data, today, backend.seed)));
    }
  }
  return out.filter((w) => w.hand);
}

/** 200 finished weeks from random decks: one to four habits, kept on random days at random levels. Dealt once. */
let random: Week[] | null = null;
const randomWeeks = () => (random ??= dealRandomWeeks());

function dealRandomWeeks(): Week[] {
  const out: Week[] = [];
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  for (let n = 0; out.length < 200; n++) {
    const r = (k: string) => unit(`random:${n}:${k}`);
    const habits: DealHabit[] = Array.from({ length: 1 + Math.floor(r('count') * 4) }, (_, i) => ({ id: `h${i}`, suit: suits[Math.floor(r(`suit${i}`) * 4)], startedOn: '2026-09-07', archivedOn: null }));
    const keep = 0.35 + r('keep') * 0.6;
    const reach = r('reach') * 0.6;
    const checkIns = new Map<string, CheckIns>();
    for (const h of habits) {
      const m = new Map<Day, Level>();
      for (let d = 0; d < 28; d++) {
        const day = addDays('2026-09-07', d);
        if (r(`${h.id}:${day}`) < keep) m.set(day, r(`${h.id}:${day}:up`) < reach ? 'ceiling' : 'floor');
      }
      checkIns.set(h.id, m);
    }
    const weeks = playPastWeeks({ seed: `seed-${n}`, today: '2026-10-05', habits, checkIns, calls: new Map() });
    out.push(...weeks.filter((w) => w.hand && !w.warmup));
  }
  return out.slice(0, 200);
}

describe('a Floor day', () => {
  it('is a dealt day with nothing kept at its Ceiling', () => {
    expect(isFloorDay(dayCard(days[0], floor(9)!))).toBe(true);
    expect(isFloorDay(dayCard(days[0], up(9)!))).toBe(false);
  });

  it('is never a saved day or the river', () => {
    expect(isFloorDay(dayCard(days[0], { rank: 7, saved: true }))).toBe(false);
    const river = weekOf([floor(2), floor(3), floor(4), floor(5), floor(9)], 6).river.card!;
    expect(river.kind === 'card' && river.river).toBe(true);
    expect(isFloorDay(river)).toBe(false);
  });

  it('counts a Joker by its own day', () => {
    expect(isFloorDay(dayCard(days[0], { rank: 2, joker: true }))).toBe(true);
    expect(isFloorDay(dayCard(days[0], { rank: 2, joker: true, up: ['hearts'] }))).toBe(false);
  });
});

describe('what the Floor days made', () => {
  it('names the hand without them only when they changed its kind', () => {
    // A Pair of Nines, both Floor days; the Ceiling days alone are King high.
    const w = weekOf([floor(9), up(13), floor(9), up(4)]);
    const credit = floorCredit(w);
    expect(credit).toMatchObject({ inHand: 2, of: 4, made: true });
    expect(credit.without?.title).toBe('King high');
    expect(madeThisLine(w)).toBe('Floor days made this Pair. Without them: King high.');

    // The pair is on Ceiling days, so the Floor days were only kickers: no credit, and too few to count.
    const kicker = weekOf([up(9), up(9), floor(4), floor(3)]);
    expect(floorCredit(kicker)).toMatchObject({ inHand: 2, made: false });
    expect(madeThisLine(kicker)).toBeNull();
  });

  it('says no hand when every card is a Floor day', () => {
    const w = weekOf([floor(9), floor(9), floor(4)]);
    expect(floorCredit(w)).toMatchObject({ inHand: 3, of: 3, without: null, made: true });
    expect(madeThisLine(w)).toBe('Floor days made this Pair. Without them: no hand.');
  });

  it('drops the river when the days left without them can no longer earn it, and never deals it again', () => {
    // Five kept days earn the river, a Six that makes the straight. Two are Floor days, so without them
    // only three days are kept: the river goes too, and the Ceiling days alone are Nine high.
    const w = weekOf([up(2, 'hearts'), floor(3), up(4, 'spades'), floor(5), up(9, 'diamonds')], 6);
    expect(w.hand?.kind).toBe('straight');
    expect(floorCredit(w).without?.title).toBe('Nine high');
    expect(madeThisLine(w)).toBe('Floor days made this Straight. Without them: Nine high.');

    // Seven kept days, two of them Floor days: five are left, so the river stays, at the same rank.
    const keeps = weekOf([up(6), up(6), up(13), floor(2), up(12), floor(3), up(11)], 6);
    const without = floorCredit(keeps).without!;
    expect(without.cards.some((c) => c.river && c.rank === 6)).toBe(true);
    expect(without.kind).toBe('three-of-a-kind');
  });

  it('counts the Floor days in the hand when they changed nothing, from three of them', () => {
    const w = weekOf([floor(13), floor(9), floor(7), up(5), up(5)]);
    expect(madeThisLine(w)).toBe('3 of these 5 cards are Floor days.');
    const all = weekOf([floor(13), floor(9), floor(7), floor(5), floor(3)]);
    // All five are Floor days and without them there is no hand at all, so that is the credit.
    expect(madeThisLine(all)).toBe('Floor days made this High card. Without them: no hand.');
  });

  it('is never stronger without them, across every demo week and 200 random weeks', async () => {
    const weeks = [...(await loadDemoWeeks()), ...randomWeeks()];
    expect(weeks.length).toBeGreaterThan(200);
    for (const w of weeks) {
      const credit = floorCredit(w);
      if (credit.without) expect(credit.without.score).toBeLessThanOrEqual(w.hand!.score);
      // Credit only when the kind changed.
      expect(credit.made).toBe(!credit.without || handIndex(credit.without.kind) < handIndex(w.hand!.kind));
      const back = comebackCredit(w);
      if (back) expect(w.hand!.cards.map((c) => c.day)).toContain(back.day);
      const line = madeThisLine(w);
      if (line) expect(line).not.toMatch(/rescued/i);
    }
  });
});

describe('what a comeback made', () => {
  it('credits the saved card that changed the kind, naming the day of the comeback', () => {
    // Monday was blank and saved by Tuesday: its Nine pairs with Thursday's.
    const w = weekOf([{ rank: 9, saved: true }, up(13), up(4), up(9), up(2)]);
    expect(comebackCredit(w)).toEqual({ day: days[0], lifted: 'pair', without: 'high-card' });
    expect(madeThisLine(w)).toBe('↺ Tuesday’s comeback made this Pair.');
  });

  it('says nothing when the saved card is only a kicker', () => {
    const w = weekOf([{ rank: 7, saved: true }, up(13), up(13), up(4)]);
    expect(w.hand?.cards.some((c) => c.day === days[0])).toBe(true);
    expect(comebackCredit(w)).toBeNull();
  });

  it('comes first, before the Floor days', () => {
    const w = weekOf([{ rank: 9, saved: true }, floor(9), up(4), floor(13)]);
    expect(floorCredit(w).made).toBe(true);
    expect(madeThisLine(w)?.startsWith('↺ Tuesday’s comeback')).toBe(true);
  });

  it('never credits a Sunday, which can never be saved', async () => {
    const weeks = [...(await loadDemoWeeks()), ...randomWeeks()];
    for (const w of weeks) {
      const back = comebackCredit(w);
      if (back) {
        expect(weekday(back.day)).not.toBe(6);
        expect(w.hand!.cards.find((c) => c.day === back.day)?.suit).toBeNull();
      }
    }
  });

  it('prints the demo weeks a comeback made, for replaying them', async () => {
    const found = (await loadDemoWeeks()).filter((w) => comebackCredit(w)).map((w) => `${w.start}: ${madeThisLine(w)}`);
    // Not every demo deals one; the cases above cover the rule either way.
    console.log(found.length ? `Demo weeks a comeback made:\n${[...new Set(found)].join('\n')}` : 'No demo week was made by a comeback.');
    expect(Array.isArray(found)).toBe(true);
  });
});

describe('what the river made', () => {
  it('credits the river when it changed the kind', () => {
    // Floor days are only Ceiling-free here because the river is the only thing that changes the kind:
    // every day reached its Ceiling.
    const w = weekOf([up(2), up(3), up(4), up(5), up(13)], 6);
    expect(riverCredit(w)).toEqual({ lifted: 'straight', without: 'high-card' });
    expect(madeThisLine(w)).toBe('The river made this Straight.');
  });

  it('says nothing when the river is only a kicker, or there is none', () => {
    expect(riverCredit(weekOf([up(9), up(9), up(4), up(5), up(13)], 2))).toBeNull();
    expect(riverCredit(weekOf([up(9), up(9), up(4)]))).toBeNull();
  });

  it('comes after a comeback and the Floor days', () => {
    // A straight that needs the river and Tuesday's Floor day: the Floor days get the credit.
    const w = weekOf([up(2), floor(3), up(4), up(5), up(13)], 6);
    expect(riverCredit(w)).not.toBeNull();
    expect(madeThisLine(w)?.startsWith('Floor days made this Straight')).toBe(true);
  });
});

describe('the stamps', () => {
  it('marks Ceiling days ↑ and Floor days ↓, and leaves saved days and the river bare', () => {
    const w = weekOf([{ rank: 6, saved: true }, up(7), floor(8), up(9), floor(13), up(2)], 10);
    expect(w.hand?.kind).toBe('straight');
    const stamps = stampsFor(w);
    expect(stamps).toEqual({ [days[1]]: 'ceiling', [days[2]]: 'floor', [days[3]]: 'ceiling' });
    expect(Object.keys(stamps)).not.toContain(addDays(MON, 7));
  });

  it('stamps a Joker by its own day', () => {
    const w = weekOf([up(9), floor(9), { rank: 2, joker: true }]);
    expect(stampsFor(w)[days[2]]).toBe('floor');
  });
});

describe('the hand naming itself', () => {
  it('names the cards turned so far, and never gets weaker as more turn', async () => {
    expect(handSoFar([])).toBeNull();
    const w = weekOf([floor(6), up(9), floor(6), up(9), up(2), floor(6)]);
    const cards = w.slots.flatMap((s) => (s.card ? [s.card] : []));
    const titles = cards.map((_, i) => handSoFar(cards.slice(0, i + 1))!.title);
    expect(titles).toEqual(['Six high', 'Nine high', 'Pair of Sixes', 'Two pair, Nines and Sixes', 'Two pair, Nines and Sixes', 'Full house, Sixes over Nines']);
    for (const week of [...(await loadDemoWeeks()), ...randomWeeks()]) {
      const all = [...week.slots.flatMap((s) => (s.card ? [s.card] : [])), ...(week.river.card ? [week.river.card] : [])];
      let last = -1;
      for (let i = 1; i <= all.length; i++) {
        const score = bestHand(all.slice(0, i))!.score;
        expect(score).toBeGreaterThanOrEqual(last);
        last = score;
      }
      expect(handSoFar(all)?.title).toBe(week.hand?.title);
    }
  });
});

describe('the captions', () => {
  const facts = (late: Day[] = []): CaptionFacts => ({
    names: (day) => (day === days[1] ? ['Read', 'Walk'] : day === days[3] ? ['Read', 'Walk', 'Stretch', 'Call home', 'Journal'] : ['Read']),
    ceiling: () => false,
    late: (day) => late.includes(day),
  });

  it('say what each card is, who dealt it and when, and whether it was a Ceiling day', () => {
    const w = weekOf([{ rank: 9, saved: true }, up(9, 'hearts'), floor(9, 'spades'), up(13), { rank: 2, joker: true }], 4);
    const c = captionsFor(w, facts([days[2]]));
    expect(c[days[0]]).toBe('Nine, no suit: Monday, saved when you kept Tuesday.');
    expect(c[days[1]]).toBe('Nine of Hearts: Read and Walk, Tuesday. Ceiling day.');
    expect(c[days[2]]).toBe('Nine of Spades: Read, Wednesday. Floor day. Logged late.');
    expect(c[days[3]]).toBe('King of Clubs: Read, Walk, Stretch and 2 more, Thursday. Ceiling day.');
    // The Joker plays as a fourth Nine.
    expect(c[days[4]]).toBe('Joker: plays as a Nine. Read, Friday. Floor day.');
  });

  it('name the river card by how it was earned', () => {
    const w = weekOf([up(2), up(3), up(4), up(5), up(13)], 6);
    expect(captionsFor(w, facts())[addDays(MON, 7)]).toBe('River card: earned by five kept days.');
  });

  it('only ever say saved, never rescued, and agree with the stamps', async () => {
    for (const w of [...(await loadDemoWeeks()), ...randomWeeks()]) {
      const c = captionsFor(w, facts());
      const stamps = stampsFor(w);
      expect(Object.keys(c).length).toBe(w.hand!.cards.length);
      for (const [day, line] of Object.entries(c)) {
        expect(line).not.toMatch(/rescued/i);
        if (stamps[day] === 'ceiling') expect(line).toMatch(/Ceiling day\./);
        if (stamps[day] === 'floor') expect(line).toMatch(/Floor day\./);
      }
    }
  });
});

describe('the payout', () => {
  const base = (extra: Partial<Week>) => ({ ...weekOf([up(9), up(9), floor(4)]), ...extra });

  it('comes in pieces that add up to what the week paid: the hand, then the call', () => {
    const plain = base({});
    expect(payoutPieces(plain)).toEqual([{ label: 'Pair', chips: 30 }]);
    const called = base({ call: 'pair', madeCall: true, bonus: 60, callMultiplier: 2 });
    expect(payoutPieces(called)).toEqual([
      { label: 'Pair', chips: 30 },
      { label: 'Call', chips: 60 },
    ]);
    // A Suited week (if Suited ever pays again) is its own piece, never counted as the call.
    const suited = base({ call: 'pair', madeCall: true, bonus: 60, callMultiplier: 2, suitedBonus: 25 });
    expect(payoutPieces(suited)).toEqual([
      { label: 'Pair', chips: 30 },
      { label: 'Suited', chips: 25 },
      { label: 'Call', chips: 60 },
    ]);
    for (const w of [plain, called, suited]) expect(payoutPieces(w).reduce((sum, p) => sum + p.chips, 0)).toBe(weekTotal(w));
    expect(payoutPieces(base({ hand: null, chips: 0 }))).toEqual([]);
  });

  it('is said as one sum', () => {
    expect(payoutLine(base({}))).toBe('Pair 30');
    expect(payoutLine(base({ call: 'pair', madeCall: true, bonus: 30, callMultiplier: 1 }))).toBe('Pair 30 + Call 30 = 60');
    expect(payoutLine(base({ chips: 800, call: 'four-of-a-kind', madeCall: true, bonus: 750, callMultiplier: 3 }))).toBe('Pair 800 + Call 750 = 1,550');
    expect(payoutLine(base({ hand: null }))).toBeNull();
  });

  it('adds up for every demo week', async () => {
    for (const w of await loadDemoWeeks()) expect(payoutPieces(w).reduce((sum, p) => sum + p.chips, 0)).toBe(weekTotal(w));
  });
});

describe('the fan', () => {
  it('turns a straight to climb low to high, the wheel from the Ace', () => {
    expect(fanOrder([10, 9, 8, 7, 6])).toEqual([4, 3, 2, 1, 0]);
    expect(fanOrder([5, 4, 3, 2, 14])).toEqual([4, 3, 2, 1, 0]);
    expect(fanOrder([14, 13, 12, 11, 10])).toEqual([4, 3, 2, 1, 0]);
  });

  it('keeps any other hand as it is, groups first', () => {
    expect(fanOrder([9, 9, 13, 7, 4])).toEqual([0, 1, 2, 3, 4]);
    expect(fanOrder([9, 8, 7])).toEqual([0, 1, 2]);
    expect(fanOrder([10, 9, 8, 7, null])).toEqual([0, 1, 2, 3, 4]);
  });

  it('fans every straight the engine makes low to high', async () => {
    for (const w of [...(await loadDemoWeeks()), ...randomWeeks()]) {
      if (!w.hand || !['straight', 'straight-flush', 'royal-flush'].includes(w.hand.kind)) continue;
      const shown = fanOrder(w.hand.cards.map((c) => c.rank)).map((i) => w.hand!.cards[i].rank);
      const low = shown.map((r, i) => (i === 0 && r === 14 && shown[1] === 2 ? 1 : r));
      expect(low).toEqual([...low].sort((a, b) => a - b));
    }
  });
});

