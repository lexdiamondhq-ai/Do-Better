import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUITS } from '@/engine/cards';
import type { DayCard } from '@/engine/deal';
import type { Week } from '@/engine/game';
import { bestHand, HAND_LADDER, HANDS, type HandKind } from '@/engine/poker';
import { contrast } from '@/theme/color';
import { tables, themes, type Theme } from '@/theme/tokens';

// Sharing reaches for the phone; here the phone is a stand-in that records what was asked of it.
const asked: string[] = [];
let os = 'web';
let shareFails = false;
let clipboard: string | null = null;

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return os;
    },
  },
  PixelRatio: { get: () => 3 },
  Share: {
    dismissedAction: 'dismissedAction',
    share: async ({ message }: { message: string }) => {
      if (shareFails) throw new Error('Share is not supported in this browser');
      asked.push(`text:${message}`);
      return { action: 'sharedAction' };
    },
  },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: async (url: string, opts: { mimeType: string }) => void asked.push(`file:${url}:${opts.mimeType}`),
}));
vi.mock('react-native-view-shot', () => ({
  captureRef: async (_view: unknown, opts: { width: number; height: number; format: string }) => {
    asked.push(`capture:${opts.format}:${opts.width}x${opts.height}`);
    return '/tmp/hand.png';
  },
}));

const {
  captionFacts,
  callHistoryLine,
  callLine,
  callPanelLines,
  callWindow,
  chipText,
  feltFor,
  firstShowdownDay,
  FOOTER,
  hallLine,
  handLines,
  identityPhrase,
  payoutSize,
  riverLine,
  share,
  SHARE_TEXT_WIDTH,
  shareCaption,
  showdownWhen,
  stampSize,
  stampWidth,
  suitedLine,
  weekLine,
  weekSuit,
} = await import('./share');

const card = (day: string, rank: number, suits: DayCard['suits'] = ['clubs'], ceilingSuits: DayCard['suits'] = []): DayCard =>
  ({ kind: 'card', day, rank, suits, ceilingSuits, tier: 'kept-all', lo: 5, rescued: false }) as DayCard;

/** A finished week with the hand those cards make, and whatever else the test says. */
function week(cards: DayCard[], extra: Partial<Week> = {}): Week {
  const hand = bestHand(cards);
  return {
    start: '2026-10-05',
    slots: [],
    hand,
    call: null,
    madeCall: false,
    chips: hand ? 50 : 0,
    suitedBonus: 0,
    bonus: 0,
    callMultiplier: 0,
    live: false,
    warmup: false,
    river: { earned: true, need: 0, card: null },
    contains: new Set(),
    keptDays: 20,
    ...extra,
  };
}

const twoPair = [card('2026-10-05', 14), card('2026-10-06', 14), card('2026-10-07', 8), card('2026-10-08', 8), card('2026-10-09', 10)];
/** Five Clubs Ceiling days: a Suited week. */
const suited = twoPair.map((c) => ({ ...c, ceilingSuits: ['clubs'] }) as DayCard);
const habits = [
  { name: 'Read', kept: 6, days: 7 },
  { name: 'Walk', kept: 5, days: 7 },
];

beforeEach(() => {
  asked.length = 0;
  os = 'web';
  shareFails = false;
  clipboard = null;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async (t: string) => void (clipboard = t) } },
  });
});

describe('the hand in words', () => {
  it('stamps the kind of hand and names its cards underneath', () => {
    expect(handLines(bestHand(twoPair)!)).toEqual({ name: 'Two pair', detail: 'Aces and Eights' });
    const run = [6, 7, 8, 9, 10].map((r, i) => card(`2026-10-0${5 + i}`, r, [SUITS[i % 4]]));
    expect(handLines(bestHand(run)!)).toEqual({ name: 'Straight', detail: 'Six to Ten' });
    const wheel = [14, 2, 3, 4, 5].map((r, i) => card(`2026-10-0${5 + i}`, r, ['spades']));
    expect(handLines(bestHand(wheel)!)).toEqual({ name: 'Straight flush', detail: 'Ace to Five in Spades' });
    expect(handLines({ kind: 'high-card', ranks: [13, 9, 4], suit: null })).toEqual({ name: 'High card', detail: 'King high' });
    expect(handLines({ kind: 'full-house', ranks: [13, 7], suit: null })).toEqual({ name: 'Full house', detail: 'Kings over Sevens' });
  });

  it('says Suited only for a Suited week, and never in chips', () => {
    expect(suitedLine(bestHand(twoPair))).toBeNull();
    expect(suitedLine(bestHand(suited))).toBe('Suited in Clubs: 5 Mind Ceiling days');
    expect(suitedLine(bestHand(suited))).not.toMatch(/\+|chip/i);
  });

  it('sums up the week in days dealt, Ceilings and the part that led', () => {
    expect(weekLine({ dealt: 6, ceilings: 8, lead: 'diamonds' })).toBe('6 days dealt · 8 Ceilings · Craft led the week');
    expect(weekLine({ dealt: 1, ceilings: 0, lead: null })).toBe('1 day dealt');
    expect(weekLine({ dealt: 3, ceilings: 1, lead: 'hearts' })).toBe('3 days dealt · 1 Ceiling · People led the week');
  });

  it('never names two suits for one week: a Suited week lets its Suited line say who showed up', () => {
    // Mind on the most days, but five Craft Ceiling days: the week is Suited in Diamonds.
    const craft = twoPair.map((c) => ({ ...c, ceilingSuits: ['diamonds'] }) as DayCard);
    const hand = bestHand(craft);
    expect(hand?.suited?.suit).toBe('diamonds');
    const line = weekLine({ dealt: 7, ceilings: 9, lead: 'clubs' }, hand);
    expect(line).toBe('7 days dealt · 9 Ceilings');
    expect(line).not.toMatch(/led the week/);
    // The felt follows the same suit the words name.
    expect(weekSuit({ lead: 'clubs' }, hand)).toBe('diamonds');
    expect(weekSuit({ lead: 'clubs' }, bestHand(twoPair))).toBe('clubs');
    expect(weekSuit(null, null)).toBeNull();
    // A week that isn't Suited still says who led.
    expect(weekLine({ dealt: 7, ceilings: 9, lead: 'clubs' }, bestHand(twoPair))).toMatch(/Mind led the week$/);
  });
});

describe('one hand name everywhere', () => {
  // Straights are named by their run ("Straight, Six to Ten", poker.ts's handTitle), so the stamp and its
  // detail line read as the title itself. Every other title already says what the detail line says.
  const RUNS: readonly HandKind[] = ['straight', 'straight-flush'];

  it('says the same hand on the stamp as in its title', () => {
    const run = (suit: (i: number) => DayCard['suits']) => [10, 9, 8, 7, 6].map((r, i) => card(`2026-10-0${5 + i}`, r, suit(i)));
    const hands = [
      bestHand(twoPair)!,
      bestHand(run((i) => [SUITS[i % 4]]))!,
      bestHand(run(() => ['clubs']))!,
      bestHand([14, 13, 12, 11, 10].map((r, i) => card(`2026-10-0${5 + i}`, r, ['diamonds'])))!,
      bestHand([card('2026-10-05', 9), card('2026-10-06', 9), card('2026-10-07', 9), card('2026-10-08', 4), card('2026-10-09', 4)])!,
      bestHand([card('2026-10-05', 9), card('2026-10-06', 13), card('2026-10-07', 4)])!,
    ];
    for (const hand of hands) {
      const { name, detail } = handLines(hand);
      if (RUNS.includes(hand.kind)) expect(`${name}, ${detail}`).toBe(hand.title);
      else if (hand.kind === 'royal-flush') expect(hand.title.endsWith(detail!.replace(/^Ten to Ace /, ''))).toBe(true);
      else expect(hand.title).toContain(detail!);
    }
  });
});

describe('what a held card knows about its day', () => {
  it('names every habit kept that day in deck order, archived ones too, with Ceilings and late logs', () => {
    const facts = captionFacts(
      [
        { id: 'read', name: 'Read' },
        { id: 'walk', name: 'Walk' },
        { id: 'old', name: 'Stretch' },
      ],
      [
        { habitId: 'walk', day: '2026-10-05', level: 'ceiling' },
        { habitId: 'read', day: '2026-10-05', level: 'floor' },
        { habitId: 'old', day: '2026-10-06', level: 'floor', loggedOn: '2026-10-07' },
        { habitId: 'gone', day: '2026-10-06', level: 'floor' },
      ],
    );
    expect(facts.names('2026-10-05')).toEqual(['Read', 'Walk']);
    expect(facts.ceiling('2026-10-05')).toBe(true);
    expect(facts.late('2026-10-05')).toBe(false);
    expect(facts.names('2026-10-06')).toEqual(['Stretch']);
    expect(facts.late('2026-10-06')).toBe(true);
    expect(facts.names('2026-10-09')).toEqual([]);
  });
});

describe('the stamp', () => {
  it('knows "Three of a kind" at 44 points runs past the share card, the way it was cut off', () => {
    expect(stampWidth('Three of a kind', 44)).toBeGreaterThan(SHARE_TEXT_WIDTH);
  });

  it.each(HAND_LADDER.map((k) => [HANDS[k].name, k] as const))('fits %s whole on the share card', (name) => {
    const size = stampSize(name, SHARE_TEXT_WIDTH, 44);
    expect(stampWidth(name, size)).toBeLessThanOrEqual(SHARE_TEXT_WIDTH);
    // Still a stamp, not small print.
    expect(size).toBeGreaterThanOrEqual(34);
  });

  it('keeps short names at full size, and fits every line under a hand', () => {
    expect(stampSize('Pair', SHARE_TEXT_WIDTH, 44)).toBe(44);
    for (const detail of ['Ace to Five in Diamonds', 'Ten to Ace in Diamonds', 'Queens and Eights', 'Kings over Sevens']) {
      expect(stampWidth(detail, stampSize(detail, SHARE_TEXT_WIDTH, 20))).toBeLessThanOrEqual(SHARE_TEXT_WIDTH);
    }
    for (const face of ['Queen of Diamonds', 'Jack of Spades', 'King of Hearts']) {
      expect(stampWidth(face, stampSize(face, SHARE_TEXT_WIDTH, 34))).toBeLessThanOrEqual(SHARE_TEXT_WIDTH);
    }
  });
});

describe('the payout sum', () => {
  // The Showdown's row at 390 and 375 points: the screen less its 20-point gutters and the gap before the total.
  const rows = [390 - 48, 375 - 48];
  const said = (hand: HandKind, chips: number, call: number) => `${HANDS[hand].name} ${chipText(chips)} + Call ${chipText(call)} =`;

  it('measures figures as figures, not as the widest letter', () => {
    expect(stampWidth('100', 10)).toBeCloseTo(15.09 - 0.3, 1);
    expect(stampWidth('1,500', 10)).toBeLessThan(stampWidth('WWWWW', 10) * 0.6);
  });

  it('keeps an everyday sum at full size', () => {
    expect(payoutSize(said('straight', 100, 100), 200, rows[0], { max: 19, chips: 36 })).toBe(19);
    // A short 375-point phone sets it at 17 beside a 30-point total.
    expect(payoutSize(said('straight', 100, 100), 200, rows[1], { max: 17, chips: 30 })).toBe(17);
    expect(payoutSize('Pair', 30, rows[1], { max: 17, chips: 30 })).toBe(17);
  });

  it('fits the longest sum on one line beside its total, never below 13 points', () => {
    for (const room of rows) {
      for (const [hand, chips, call] of [
        ['five-of-a-kind', 800, 1500],
        ['five-of-a-kind', 800, 140],
        ['four-of-a-kind', 250, 750],
        ['straight-flush', 350, 1050],
      ] as const) {
        const text = said(hand, chips, call);
        const size = payoutSize(text, chips + call, room, { max: 19, chips: 36 });
        expect(size).toBeGreaterThanOrEqual(13);
        // The sum, set a little wide, and the total's chip and digits share the row. Only the rarest sum of
        // all (a Five of a kind and a made Long shot on a Royal flush) can reach the floor and wrap on a 375.
        const fits = stampWidth(text, size) * 1.02 + 36 * 1.6 + stampWidth(chipText(chips + call), 36) * 1.03 <= room;
        expect(fits || (size === 13 && call === 1500 && room === rows[1])).toBe(true);
      }
    }
  });
});

describe('when things happen', () => {
  it('says the Showdown is tonight on Sunday, and on Sunday any other day', () => {
    expect(showdownWhen('2026-10-25')).toBe('tonight');
    expect(showdownWhen('2026-10-21')).toBe('on Sunday');
    expect(showdownWhen('2026-10-19')).toBe('on Sunday');
  });

  it('dates the first Showdown of a warm-up deck exactly: the Sunday the first full week ends', () => {
    // Warm-up week of Monday 12 October: the first full week is 19 to 25 October.
    expect(firstShowdownDay('2026-10-12')).toBe('2026-10-25');
  });

  it('says when a call closes the same way everywhere', () => {
    const open = { slots: [{ day: '2026-10-19', state: 'today', card: null, isToday: true }] } as unknown as Week;
    const kept = { slots: [{ day: '2026-10-19', state: 'today', card: card('2026-10-19', 9), isToday: true }] } as unknown as Week;
    expect(callWindow(open)).toEqual({ until: 'your first kept day ends', line: 'Open until your first kept day ends.' });
    expect(callWindow(kept)).toEqual({ until: 'midnight', line: 'Calls close at midnight.' });
  });
});

describe('a call’s history', () => {
  const ended = (kind: HandKind | null, contains: HandKind[] = kind ? [kind] : [], extra: Partial<Week> = {}) =>
    ({ hand: kind ? ({ kind } as Week['hand']) : null, live: false, warmup: false, contains: new Set(contains), ...extra }) as Week;

  it('agrees with the Hall when only a higher hand came up', () => {
    // Eight weeks, one of them Five Kings: it beats a Royal flush but never held one.
    const weeks = [...Array.from({ length: 7 }, () => ended('pair')), ended('five-of-a-kind', ['five-of-a-kind', 'four-of-a-kind', 'three-of-a-kind', 'pair'])];
    expect(callHistoryLine('royal-flush', weeks)).toBe('Made it in 1 of your last 8 weeks, with a higher hand.');
    expect(callHistoryLine('straight-flush', weeks)).toBe('Made it in 1 of your last 8 weeks, with a higher hand.');
    // One finished week, made only by a higher hand.
    expect(callHistoryLine('royal-flush', [ended('five-of-a-kind', ['five-of-a-kind'])])).toBe('Made it last week, with a higher hand.');
    expect(callHistoryLine('four-of-a-kind', weeks)).toBe('Made in 1 of your last 8 weeks.');
    expect(callHistoryLine('pair', weeks)).toBe('Made in 8 of your last 8 weeks.');
  });

  it('says this or better when some weeks made it with a higher hand that never held it', () => {
    const weeks = [ended('royal-flush', ['royal-flush', 'straight-flush', 'straight']), ended('five-of-a-kind', ['five-of-a-kind']), ended('pair')];
    expect(callHistoryLine('straight-flush', weeks)).toBe('Made this or better in 2 of your last 3 weeks.');
  });

  it('says plainly when a hand wasn’t made, and looks back only eight finished weeks', () => {
    expect(callHistoryLine('full-house', [ended('pair'), ended('two-pair', ['two-pair', 'pair'])])).toBe('Not made in your last 2 weeks.');
    expect(callHistoryLine('full-house', [ended('pair')])).toBe('Not made last week.');
    expect(callHistoryLine('pair', [ended('pair')])).toBe('Made last week.');
    expect(callHistoryLine('pair', [])).toBe('No finished weeks yet, so it’s priced for a deck your size.');
    const old = [ended('full-house'), ...Array.from({ length: 8 }, () => ended('pair'))];
    expect(callHistoryLine('full-house', old)).toBe('Not made in your last 8 weeks.');
    // The warm-up week and the live week never count.
    expect(callHistoryLine('pair', [ended('pair', ['pair'], { warmup: true }), ended('pair', ['pair'], { live: true })])).toMatch(/^No finished weeks/);
  });
});

describe('the Hall of Hands in words', () => {
  it('says what spotted and paid mean', () => {
    expect(hallLine({ count: 0, ended: 0 })).toBe('Not spotted yet');
    expect(hallLine({ count: 3, ended: 0 })).toBe('Spotted in 3 weeks');
    expect(hallLine({ count: 3, ended: 1 })).toBe('Spotted in 3 weeks · paid as your hand in 1');
    expect(hallLine({ count: 1, ended: 1 })).toBe('Spotted in 1 week · it paid as your hand');
    expect(hallLine({ count: 4, ended: 4 })).toBe('Spotted in 4 weeks · paid as your hand each time');
  });
});

describe('who the days were for', () => {
  it('frames any “I’m …” answer so it reads naturally', () => {
    expect(identityPhrase(['strong'])).toBe('I’m strong');
    expect(identityPhrase(['strong', 'calm'], 'you')).toBe('You’re strong and calm');
    expect(identityPhrase(['a reader', 'someone who shows up', 'kind'], 'me', 3)).toBe('I’m a reader, someone who shows up and kind');
    expect(identityPhrase(['a reader', 'someone who shows up', 'kind'])).toBe('I’m a reader and someone who shows up');
    // Typed with its "I’m", or with a full stop, it still reads once.
    expect(identityPhrase(["I'm strong."])).toBe('I’m strong');
    expect(identityPhrase(['I’m a reader'])).toBe('I’m a reader');
    expect(identityPhrase(['i am someone who moves'])).toBe('I’m someone who moves');
    expect(identityPhrase([])).toBeNull();
    expect(identityPhrase(['  '])).toBeNull();
  });
});

describe('the call line', () => {
  it('says what a made call paid, by its multiplier', () => {
    expect(callLine(week(twoPair, { call: 'two-pair', madeCall: true, callMultiplier: 1, bonus: 50 }))).toEqual({ kind: 'made', title: 'Called it: the Two pair call paid 50 more.', detail: null, chips: 50 });
    expect(callLine(week(twoPair, { call: 'pair', madeCall: true, callMultiplier: 2, bonus: 60 }))?.title).toBe('Called a Stretch: the Pair call paid 60 more, twice its chips.');
    expect(callLine(week(twoPair, { call: 'pair', madeCall: true, callMultiplier: 3, bonus: 90 }))?.title).toBe('Called a Long shot: the Pair call paid 90 more, three times its chips.');
    expect(callLine(week(twoPair, { call: 'four-of-a-kind', madeCall: true, callMultiplier: 3, bonus: 1500 }))?.title).toBe('Called a Long shot: the Four of a kind call paid 1,500 more, three times its chips.');
    // A call that was a sure thing still says it was made, in one line.
    expect(callLine(week(twoPair, { call: 'pair', madeCall: true, callMultiplier: 0 }))).toMatchObject({ title: 'Called it: the Pair call was a sure thing, so nothing extra.', detail: null, chips: 0 });
  });

  it('says a made call in one line, so the call fits on one row under the total', () => {
    for (const m of [0, 1, 2, 3] as const) expect(callLine(week(twoPair, { call: 'pair', madeCall: true, callMultiplier: m, bonus: 30 * m }))?.detail).toBeNull();
  });

  it('says a missed call costs nothing, and no call how to get one', () => {
    expect(callLine(week(twoPair, { call: 'full-house' }))).toMatchObject({ kind: 'missed', title: 'Not this time.', detail: 'You called Full house. A missed call costs nothing.', chips: 0 });
    expect(callLine(week(twoPair))).toMatchObject({ kind: 'none', title: 'No call this week.' });
  });

  it('has nothing to say for the warm-up week or a week with no cards', () => {
    expect(callLine(week(twoPair, { warmup: true }))).toBeNull();
    expect(callLine(week([]))).toBeNull();
  });

  it('never uses casino words', () => {
    const lines = [0, 1, 2, 3].map((m) => callLine(week(twoPair, { call: 'pair', madeCall: true, callMultiplier: m as Week['callMultiplier'] }))!);
    lines.push(callLine(week(twoPair, { call: 'pair' }))!, callLine(week(twoPair))!);
    for (const l of lines) expect(`${l.title} ${l.detail}`).not.toMatch(/\b(odds|bet|wager|jackpot|rake|high-roller)\b/i);
  });
});

describe('the call panel’s line', () => {
  // The room the panel's words have at 375 and 390 points wide.
  const at375 = 267;
  const at390 = 282;
  const made = (call: Week['call'], m: Week['callMultiplier'], bonus: number) => callLine(week(twoPair, { call, madeCall: true, callMultiplier: m, bonus }))!.title;

  it('keeps a made call on one line at 375 and 390, from a Pair to a Full house', () => {
    for (const room of [at375, at390])
      for (const [call, bonus] of [['pair', 20], ['two-pair', 50], ['straight', 100], ['full-house', 140]] as const) {
        const set = callPanelLines(made(call, 1, bonus), room);
        expect(set.lines).toHaveLength(1);
        expect(set.size).toBeGreaterThanOrEqual(12);
        expect(set.size).toBeLessThanOrEqual(14);
      }
  });

  it('sets a short line at full size', () => {
    expect(callPanelLines('No call this week.', at375)).toEqual({ lines: ['No call this week.'], size: 14 });
  });

  it('breaks a Stretch or a Long shot at its comma, never leaving one word alone', () => {
    const long = callPanelLines(made('four-of-a-kind', 3, 1500), at375);
    expect(long.lines).toEqual(['Called a Long shot: the Four of a kind call paid 1,500 more,', 'three times its chips.']);
    for (const m of [2, 3] as const)
      for (const call of ['pair', 'three-of-a-kind', 'full-house'] as const) {
        const set = callPanelLines(made(call, m, 999), at375);
        for (const line of set.lines) expect(line.split(' ').length).toBeGreaterThan(1);
        expect(set.size).toBeGreaterThanOrEqual(12);
      }
  });

  it('breaks a long one-line call before “paid” when it has no comma', () => {
    expect(callPanelLines(made('three-of-a-kind', 1, 1500), 200).lines).toEqual(['Called it: the Three of a kind call', 'paid 1,500 more.']);
  });
});

describe('the river line', () => {
  // The week of Monday 12 October 2026: Thursday is the 15th, Sunday the 18th.
  const live = (need: number, keptOn: string[] = []) =>
    week([], {
      start: '2026-10-12',
      live: true,
      river: { earned: need === 0, need, card: null },
      slots: keptOn.map((day) => ({ day, state: 'dealt', card: card(day, 9), isToday: false })) as Week['slots'],
    });

  it('says the river is earned once it is', () => {
    expect(riverLine(live(0), '2026-10-15').title).toBe('River card earned');
  });

  it('counts the days still needed while the week can reach them', () => {
    // Thursday with nothing kept yet: Thursday to Sunday is four days, and two are needed.
    expect(riverLine(live(2), '2026-10-15').detail).toBe('2 more days you keep something earn an eighth card, turned on Sunday.');
    // On Sunday itself the river turns tonight.
    expect(riverLine(live(1), '2026-10-18').detail).toBe('1 more day you keep something earns an eighth card, turned tonight.');
    // Four needed on Thursday, today still open: just reachable.
    expect(riverLine(live(4), '2026-10-15').detail).toMatch(/^4 more days/);
  });

  it('never asks for more days than the week has left', () => {
    // Thursday, four days left, five needed.
    expect(riverLine(live(5), '2026-10-15').detail).toBe('Five days you keep something earn an eighth card. Too few days are left this week, so it’s back in play on Monday.');
    // Sunday with today already kept: no days left to add, one still needed.
    expect(riverLine(live(1, ['2026-10-18']), '2026-10-18').detail).toMatch(/Too few days are left/);
    // Saturday, today kept: Sunday is the one day left, and two are needed.
    expect(riverLine(live(2, ['2026-10-17']), '2026-10-17').detail).toMatch(/Too few days are left/);
  });
});

describe('the share caption', () => {
  it('leaves habit names out by default', () => {
    const text = shareCaption({ kind: 'hand', week: week(twoPair) }, habits);
    expect(text).not.toContain('Read');
    expect(text).not.toContain('Walk');
    expect(text).toContain('Two pair, Aces and Eights. +50 chips.');
    expect(text.endsWith(FOOTER)).toBe(true);
  });

  it('includes habit names when asked', () => {
    expect(shareCaption({ kind: 'hand', week: week(twoPair), names: true }, habits)).toContain('Read 6/7 · Walk 5/7');
    // Asked, but with nothing to show, it says nothing about habits.
    expect(shareCaption({ kind: 'hand', week: week(twoPair), names: true })).not.toContain('/7');
  });

  it('adds the Suited line only for a Suited week', () => {
    expect(shareCaption({ kind: 'hand', week: week(twoPair) })).not.toContain('Suited');
    expect(shareCaption({ kind: 'hand', week: week(suited) })).toContain('Suited in Clubs: 5 Mind Ceiling days.');
  });

  it('adds what made the hand when there is something to say', () => {
    // A Pair of Aces from two Floor days; the rest reached their Ceilings.
    const floorDays = [card('2026-10-05', 14), card('2026-10-06', 14), card('2026-10-07', 8, ['clubs'], ['clubs']), card('2026-10-08', 4, ['clubs'], ['clubs'])];
    const slots = floorDays.map((c) => ({ day: c.day, state: 'dealt' as const, card: c, isToday: false }));
    const text = shareCaption({ kind: 'hand', week: week(floorDays, { slots }) });
    expect(text.split('\n')[1]).toBe('Floor days made this Pair. Without them: Eight high.');
    // Nothing to credit: no line.
    expect(shareCaption({ kind: 'hand', week: week(twoPair) })).not.toMatch(/made this|Floor day/);
  });

  it('adds the call line only for a call that was made', () => {
    expect(shareCaption({ kind: 'hand', week: week(twoPair) })).not.toContain('Called');
    expect(shareCaption({ kind: 'hand', week: week(twoPair, { call: 'full-house' }) })).not.toContain('Called');
    const made = shareCaption({ kind: 'hand', week: week(twoPair, { call: 'two-pair', madeCall: true, callMultiplier: 1, bonus: 50 }) });
    expect(made).toContain('Called Two pair and made it.');
    expect(made).toContain('+100 chips.');
  });

  it('names a face card, its title and who the days were for', () => {
    const face = { face: 'king', letter: 'K', name: 'King', title: 'This is who I am', votes: 100 } as const;
    const text = shareCaption({ kind: 'face', suit: 'spades', face, identities: ['someone who moves every day'], days: 100 });
    expect(text).toContain('King of Spades: This is who I am.');
    expect(text).toContain('100 Body days. I’m someone who moves every day.');
    // An adjective reads as naturally as a noun.
    const strong = shareCaption({ kind: 'face', suit: 'spades', face, identities: ['strong'], days: 1000 });
    expect(strong).toContain('1,000 Body days. I’m strong.');
    expect(strong).not.toMatch(/as strong|for strong/);
    expect(shareCaption({ kind: 'face', suit: 'spades', face, identities: [], days: 10 })).toContain('10 Body days.');
  });

  it('writes chips the way the screens do', () => {
    expect(chipText(1080)).toBe('1,080');
    expect(chipText(140)).toBe('140');
    expect(chipText(12500)).toBe('12,500');
    const big = shareCaption({ kind: 'hand', week: week(twoPair, { chips: 800, call: 'two-pair', madeCall: true, callMultiplier: 1, bonus: 280 }) });
    expect(big).toContain('+1,080 chips.');
    expect(big).not.toContain('+1080');
  });
});

describe('the felt', () => {
  const all: [string, Theme][] = [['light', themes.light], ['dark', themes.dark], ...Object.entries(tables)];
  it.each(all)('keeps every word readable on the %s table, whatever suit lights it', (_name, base) => {
    for (const lead of [null, ...SUITS]) {
      const { bg, glow, theme } = feltFor(base, lead);
      for (const surface of [bg, glow, theme.bgRaised, theme.raised]) {
        expect(contrast(theme.text, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(theme.textSecondary, glow)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.textFaint, glow)).toBeGreaterThanOrEqual(3);
      expect(contrast(theme.onRaisedSecondary, theme.raised)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is dark on the light kitchen table: the ink of a card back', () => {
    expect(feltFor(themes.light).bg).toBe(themes.light.raised);
    expect(feltFor(themes.light).theme.scheme).toBe('dark');
  });
});

describe('sharing', () => {
  const target = { kind: 'hand', week: week(twoPair) } as const;
  const view = { current: {} } as never;

  it('shares the caption as text in a browser, even with a card on screen', async () => {
    expect(await share(target, { view })).toBe('text');
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^text:Week of/);
  });

  it('copies the caption when the browser cannot share', async () => {
    shareFails = true;
    expect(await share(target)).toBe('copied');
    expect(clipboard).toContain('Two pair, Aces and Eights');
  });

  it('shares a 1080 by 1920 picture of the card on a phone', async () => {
    os = 'ios';
    expect(await share(target, { view })).toBe('image');
    // iOS sizes the picture in points; at 3x that is 360 by 640 points.
    expect(asked).toEqual(['capture:png:360x640', 'file:file:///tmp/hand.png:image/png']);
  });

  it('falls back to words on a phone with no card on screen', async () => {
    os = 'ios';
    expect(await share(target)).toBe('text');
  });

  it('keeps habit names out of shared words unless asked', async () => {
    await share(target, { habits });
    expect(asked[0]).not.toContain('Read');
    await share({ ...target, names: true }, { habits });
    expect(asked[1]).toContain('Read 6/7');
  });

  it('captures one card at the size it asks for, and says only its name in words', async () => {
    const card = { kind: 'card', habitId: 'read', name: 'Read', format: 'print' } as const;
    expect(shareCaption(card)).toBe(`Read\n${FOOTER}`);
    os = 'ios';
    expect(await share(card, { view, size: { w: 1500, h: 1050 } })).toBe('image');
    // At 3x, 1500 by 1050 pixels is 500 by 350 points.
    expect(asked).toEqual(['capture:png:500x350', 'file:file:///tmp/hand.png:image/png']);
  });
});
