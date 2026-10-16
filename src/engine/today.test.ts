import { describe, expect, it } from 'vitest';

import { cardColors, on, tables, themes } from '@/theme/tokens';

import {
  aCard,
  allKeptCopy,
  allowFor,
  buildQueue,
  cardKey,
  cardOnFelt,
  comebackCopy,
  comebackGap,
  densityFor,
  eventStale,
  feltFor,
  handLineCopy,
  identityLine,
  ideaLabel,
  interruptionFor,
  JOKER_LINE,
  keptLine,
  keyMove,
  laterTag,
  momentOf,
  partOfDayAt,
  receiptCopy,
  timing,
  todayTips,
  whenLine,
  type TodayCard,
} from './today';

const card = (id: string, extra: Partial<TodayCard> = {}): TodayCard => ({ id, level: null, comeback: false, part: 'any', ...extra });
const ids = (q: { id: string }[]) => q.map((x) => x.id);

describe('time of day', () => {
  it('splits the day into morning, midday and evening, with the small hours in the evening', () => {
    expect([0, 3, 4, 10, 11, 16, 17, 23].map(partOfDayAt)).toEqual(['evening', 'evening', 'morning', 'morning', 'midday', 'midday', 'evening', 'evening']);
  });

  it('tags only the cards still to come', () => {
    expect(timing('any', 'morning')).toBe('now');
    expect(timing('evening', 'morning')).toBe('upcoming');
    expect(timing('morning', 'evening')).toBe('earlier');
    expect(laterTag('evening', 'morning')).toBe('Plays tonight');
    expect(laterTag('midday', 'morning')).toBe('Plays later today');
    expect(laterTag('morning', 'evening')).toBeNull();
    expect(laterTag('any', 'evening')).toBeNull();
  });

  it('carries on from a later tag instead of saying Plays twice', () => {
    expect(whenLine('After getting into bed', null, null)).toBe('Plays after getting into bed');
    expect(whenLine('After getting into bed', null, 'Plays tonight')).toBe('after getting into bed');
    expect(whenLine('7 pm', null, 'Plays tonight')).toBe('at 7 pm');
    expect(whenLine('After lunch', 'at my desk', 'Plays later today')).toBe('after lunch · at my desk');
    expect(whenLine('  ', 'at my desk', null)).toBeNull();
  });
});

describe('the queue', () => {
  const now = 'midday' as const;

  it('leaves kept cards out and keeps deck order otherwise', () => {
    const q = buildQueue({ cards: [card('a'), card('b', { level: 'floor' }), card('c')], deferred: [], now });
    expect(ids(q)).toEqual(['a', 'c']);
    expect(q.map((x) => x.kind)).toEqual(['card', 'card']);
  });

  it('keeps the only card at the front when it is deferred, under a new key', () => {
    const before = buildQueue({ cards: [card('a')], deferred: [], now });
    const after = buildQueue({ cards: [card('a')], deferred: ['a'], now });
    expect(ids(after)).toEqual(['a']);
    expect(cardKey(after[0], 1)).not.toBe(cardKey(before[0], 0));
  });

  it('moves a deferred Comeback card behind cards nobody pushed back, and it keeps its Comeback side', () => {
    const cards = [card('a', { comeback: true }), card('b'), card('c')];
    expect(ids(buildQueue({ cards, deferred: [], now }))).toEqual(['a', 'b', 'c']);
    const q = buildQueue({ cards, deferred: ['a'], now });
    expect(ids(q)).toEqual(['b', 'c', 'a']);
    expect(q[2].kind).toBe('comeback');
  });

  it('puts deferred cards last in the order they were pushed back', () => {
    const q = buildQueue({ cards: [card('a'), card('b'), card('c'), card('d')], deferred: ['b', 'a'], now });
    expect(ids(q)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('brings a focused card to the front, even one that was pushed back', () => {
    const cards = [card('a', { comeback: true }), card('b'), card('c')];
    expect(ids(buildQueue({ cards, deferred: ['c'], focused: 'c', now }))).toEqual(['c', 'a', 'b']);
    expect(ids(buildQueue({ cards, deferred: [], focused: 'gone', now }))).toEqual(['a', 'b', 'c']);
  });

  it('plays cards for now first, then later today (soonest first), then earlier, keeping deck order within each', () => {
    const cards = [card('m1', { part: 'morning' }), card('e1', { part: 'evening' }), card('a1'), card('d1', { part: 'midday' }), card('e2', { part: 'evening' }), card('m2', { part: 'morning' })];
    expect(ids(buildQueue({ cards, deferred: [], now: 'midday' }))).toEqual(['a1', 'd1', 'e1', 'e2', 'm1', 'm2']);
    expect(ids(buildQueue({ cards, deferred: [], now: 'morning' }))).toEqual(['m1', 'a1', 'm2', 'd1', 'e1', 'e2']);
  });

  it('deals a card for later today before one for tonight, even when tonight comes first in the deck', () => {
    const cards = [card('read', { part: 'evening' }), card('walk', { part: 'midday' }), card('focus', { part: 'morning', level: 'floor' })];
    expect(ids(buildQueue({ cards, deferred: [], now: 'morning' }))).toEqual(['walk', 'read']);
  });

  it('shows the Welcome back header only when asked, and only in front of cards to play', () => {
    const cards = [card('a'), card('b')];
    expect(buildQueue({ cards, deferred: [], now }).some((x) => x.kind === 'welcome')).toBe(false);
    const q = buildQueue({ cards, deferred: [], now, welcome: true });
    expect(q.map((x) => x.kind)).toEqual(['welcome', 'card', 'card']);
    expect(buildQueue({ cards: [card('a', { level: 'floor' })], deferred: [], now, welcome: true })).toEqual([]);
  });

  it('offers Floor-kept cards again in the Ceiling pass, minus any passed over', () => {
    const cards = [card('a', { level: 'floor' }), card('b', { level: 'ceiling' }), card('c', { level: 'floor' }), card('d', { level: 'floor' })];
    const q = buildQueue({ cards, deferred: [], now, reach: { skipped: ['c'] } });
    expect(ids(q)).toEqual(['a', 'd']);
    expect(q.every((x) => x.kind === 'reach')).toBe(true);
  });
});

describe('which ways the front card goes', () => {
  const now = 'midday' as const;

  it('only offers sideways when another card waits behind', () => {
    expect(allowFor(buildQueue({ cards: [card('a')], deferred: [], now }))).toEqual({ up: true, down: true, left: false, right: false });
    expect(allowFor(buildQueue({ cards: [card('a', { comeback: true })], deferred: [], now }))).toEqual({ up: true, down: true, left: false, right: false });
    expect(allowFor(buildQueue({ cards: [card('a'), card('b')], deferred: [], now }))).toEqual({ up: true, down: true, left: true, right: true });
  });

  it('never offers the Floor again in the Ceiling pass', () => {
    const q = buildQueue({ cards: [card('a', { level: 'floor' })], deferred: [], now, reach: { skipped: [] } });
    expect(allowFor(q)).toEqual({ up: true, down: false, left: true, right: true });
  });

  it('lets any swipe open the deck from the Welcome back header', () => {
    expect(allowFor(buildQueue({ cards: [card('a')], deferred: [], now, welcome: true }))).toEqual({ up: true, down: true, left: true, right: true });
    expect(allowFor([])).toEqual({ up: false, down: false, left: false, right: false });
  });
});

describe('room on screen', () => {
  const base = { cardHeight: 520, windowHeight: 932, fontScale: 1, screenReader: false };

  it('shows the full card when it has room', () => {
    expect(densityFor(base)).toEqual({ mode: 'regular', mergeTip: false, foldComeback: false, logOnComeback: true, leanComeback: false, tightComeback: false, tinyComeback: false, roomyComeback: true });
  });

  it('folds the card when its body is shorter than 360 points', () => {
    expect(densityFor({ ...base, cardHeight: 359 }).mode).toBe('compact');
    expect(densityFor({ ...base, cardHeight: 360 }).mode).toBe('regular');
  });

  it('folds the Comeback card sooner, below 470 points', () => {
    expect(densityFor({ ...base, cardHeight: 469 })).toMatchObject({ mode: 'regular', foldComeback: true });
    expect(densityFor({ ...base, cardHeight: 470 }).foldComeback).toBe(false);
  });

  it('keeps "Did it, forgot to log" on a folded Comeback card from 400 points', () => {
    expect(densityFor({ ...base, cardHeight: 416 })).toMatchObject({ foldComeback: true, logOnComeback: true });
    expect(densityFor({ ...base, cardHeight: 399 }).logOnComeback).toBe(false);
  });

  it('drops the Comeback why below 340 points and its evidence line only below 305', () => {
    expect(densityFor({ ...base, cardHeight: 353 })).toMatchObject({ mode: 'compact', foldComeback: true, leanComeback: false, tightComeback: false });
    expect(densityFor({ ...base, cardHeight: 339 })).toMatchObject({ leanComeback: true, tightComeback: false });
    expect(densityFor({ ...base, cardHeight: 305 }).tightComeback).toBe(false);
    expect(densityFor({ ...base, cardHeight: 304 })).toMatchObject({ leanComeback: true, tightComeback: true });
  });

  it('drops the label over the Comeback first move only below 250 points', () => {
    expect(densityFor({ ...base, cardHeight: 250 })).toMatchObject({ tightComeback: true, tinyComeback: false });
    expect(densityFor({ ...base, cardHeight: 249 })).toMatchObject({ tightComeback: true, tinyComeback: true });
  });

  it('gives a folded Comeback with room to spare more words from 430 points', () => {
    expect(densityFor({ ...base, cardHeight: 440 })).toMatchObject({ foldComeback: true, roomyComeback: true });
    expect(densityFor({ ...base, cardHeight: 429 })).toMatchObject({ foldComeback: true, roomyComeback: false });
  });

  it('gives the tip its own band only on screens 900 points tall or more', () => {
    expect(densityFor({ ...base, windowHeight: 844 }).mergeTip).toBe(true);
    expect(densityFor({ ...base, windowHeight: 667 }).mergeTip).toBe(true);
    expect(densityFor({ ...base, windowHeight: 900 }).mergeTip).toBe(false);
  });

  it('turns the cards into a list at large text sizes or with a screen reader', () => {
    expect(densityFor({ ...base, fontScale: 1.35 }).mode).toBe('list');
    expect(densityFor({ ...base, fontScale: 1.3 }).mode).toBe('regular');
    expect(densityFor({ ...base, screenReader: true }).mode).toBe('list');
  });
});

describe('the keyboard', () => {
  const all = { up: true, down: true, left: true, right: true };
  const press = (key: string, extra: Partial<{ repeat: boolean; onPage: boolean }> = {}) => ({ key, repeat: false, onPage: true, ...extra });
  const front = (kind: 'card' | 'comeback' | 'welcome' | 'reach', allow = all, firstMove = true) => ({ kind, allow, firstMove });

  it('swipes the front card with the arrows, only the ways it allows', () => {
    expect(keyMove(press('ArrowDown'), front('card'))).toEqual({ dir: 'down', first: false });
    expect(keyMove(press('ArrowUp'), front('card'))).toEqual({ dir: 'up', first: false });
    expect(keyMove(press('ArrowLeft'), front('card', { ...all, left: false, right: false }))).toBeNull();
    expect(keyMove(press('ArrowDown'), front('reach', { up: true, down: false, left: true, right: true }))).toBeNull();
  });

  it('never keeps a card from a key held down', () => {
    expect(keyMove(press('ArrowDown', { repeat: true }), front('card'))).toBeNull();
    expect(keyMove(press('Enter', { repeat: true }), front('comeback'))).toBeNull();
  });

  it('presses Done it with Enter or Space only when no control has the focus', () => {
    expect(keyMove(press('Enter'), front('comeback'))).toEqual({ dir: 'down', first: true });
    expect(keyMove(press(' '), front('comeback'))).toEqual({ dir: 'down', first: true });
    expect(keyMove(press('Enter', { onPage: false }), front('comeback'))).toBeNull();
    expect(keyMove(press('Enter'), front('comeback', all, false))).toBeNull();
    expect(keyMove(press('Enter'), front('card'))).toBeNull();
    expect(keyMove(press('Enter'), front('welcome'))).toEqual({ dir: 'up', first: false });
  });
});

describe('the Comeback card', () => {
  it('speaks the identity back to the player', () => {
    expect(identityLine('a reader')).toBe('You’re a reader.');
    expect(identityLine('strong')).toBe('You’re strong.');
    expect(identityLine("I'm someone who looks after my body.")).toBe('You’re someone who looks after your body.');
    expect(identityLine('I am in charge of myself')).toBe('You’re in charge of yourself.');
    expect(identityLine('  ')).toBeNull();
    expect(identityLine(null)).toBeNull();
  });

  it('leads with kept days and never counts the days missed', () => {
    const c = comebackCopy({ name: 'Read', identity: 'a reader', kept: 1860, gap: 'yesterday' });
    expect(c).toEqual({ eyebrow: 'Yesterday got away', headline: 'You’re a reader.', evidence: '1,860 kept days say so. One day off doesn’t undo them.' });
    expect(comebackCopy({ name: 'Read', identity: null, kept: 12, gap: 'few' })).toEqual({
      eyebrow: 'A few days got away',
      headline: 'Read.',
      evidence: '12 kept days so far. A few days off don’t undo them.',
    });
    expect(comebackCopy({ name: 'Read', identity: 'a reader', kept: 2, gap: 'yesterday' }).evidence).toBe('You’ve started. One day off doesn’t undo that.');
    expect(comebackCopy({ name: 'Read', identity: 'a reader', kept: 0, gap: 'yesterday' }).evidence).toBe('Start small today. Small still counts.');
    for (const kept of [0, 1, 5, 400]) {
      for (const gap of ['yesterday', 'few'] as const) {
        const words = Object.values(comebackCopy({ name: 'Run', identity: 'a runner', kept, gap })).join(' ');
        expect(words).not.toMatch(/streak|missed|failed|\b\d+ days? (missed|off)\b/i);
      }
    }
  });

  it('says a few days got away only when the day before yesterday was missed too', () => {
    const today = '2026-10-16';
    expect(comebackGap('2026-10-01', today, new Map([['2026-10-14', 'floor']]))).toBe('yesterday');
    expect(comebackGap('2026-10-01', today, new Map())).toBe('few');
    expect(comebackGap('2026-10-15', today, new Map())).toBe('yesterday');
  });
});

describe('the chrome', () => {
  it('counts kept days, with a kind start', () => {
    expect(keptLine(0)).toBe('Day one');
    expect(keptLine(1)).toBe('1 kept day');
    expect(keptLine(1860)).toBe('1,860 kept days');
  });

  it('keeps only the tips that matter today, Sunday’s Showdown and a near river card among them', () => {
    const tips = (['climb', 'joker', 'draw', 'rescue', 'showdown', 'call', 'face', 'deal', 'done'] as const).map((tone) => ({ tone, text: tone }));
    expect(todayTips(tips).map((t) => t.tone)).toEqual(['joker', 'rescue', 'showdown', 'call', 'face']);
  });

  it('leads the warm-up week with the line that explains it', () => {
    const tips = [
      { tone: 'face' as const, text: 'Keep a People habit today to earn the Queen of Hearts and a Joker.' },
      { tone: 'showdown' as const, text: 'Warm-up week. Your first full hand deals Monday.' },
    ];
    expect(todayTips(tips, { warmup: true }).map((t) => t.tone)).toEqual(['showdown', 'face']);
  });

  it('shows at most one line on a very first look: the warm-up explanation, never the call', () => {
    const call = { tone: 'call' as const, text: 'Call the hand you’ll make this week.' };
    const warm = { tone: 'showdown' as const, text: 'Warm-up week. Your first full hand deals Monday.' };
    expect(todayTips([call], { firstLook: true })).toEqual([]);
    expect(todayTips([warm, { tone: 'face' as const, text: 'face' }], { warmup: true, firstLook: true })).toEqual([warm]);
  });

  it('always says what the hand pays, and names the stake on Sunday', () => {
    const hand = { title: 'Pair of Eights' };
    expect(handLineCopy({ warmup: false, hand, chips: 30, sunday: false })).toEqual({ label: 'Your hand', title: 'Pair of Eights', pays: 30, spoken: 'Your hand: Pair of Eights. Pays 30 chips if the week ended now' });
    expect(handLineCopy({ warmup: false, hand, chips: 1200, sunday: true })).toMatchObject({ label: 'Showdown tonight', pays: 1200, spoken: 'Showdown tonight: Pair of Eights. Pays 1,200 chips at midnight' });
    expect(handLineCopy({ warmup: false, hand: null, chips: 0, sunday: false })).toMatchObject({ label: 'Your hand', title: 'No cards yet', pays: null });
    expect(handLineCopy({ warmup: true, hand, chips: 0, sunday: true })).toMatchObject({ label: 'Warm-up hand', pays: null });
  });

  it('labels today’s idea once, with its reason only when it has a real one', () => {
    expect(ideaLabel('Today’s idea')).toBe('Today’s idea');
    expect(ideaLabel("Today's idea.")).toBe('Today’s idea');
    expect(ideaLabel('Reach out is ready for a comeback')).toBe('Today’s idea · Reach out is ready for a comeback');
    expect(ideaLabel('It’s Monday.')).toBe('Today’s idea · It’s Monday');
  });

  it('sums up a kept day with the hand in words', () => {
    const hand = { kind: 'pair' as const, title: 'Pair of Jacks' };
    expect(allKeptCopy({ count: 4, hand, warmup: false, chips: 30 })).toEqual({ title: 'All 4 kept.', hand: 'Your hand: a Pair of Jacks, worth 30 chips if the week ended now.' });
    expect(allKeptCopy({ count: 1, hand, warmup: true, chips: 0 }).title).toBe('Kept.');
    expect(allKeptCopy({ count: 1, hand, warmup: true, chips: 0 }).hand).not.toMatch(/chips/);
    expect(allKeptCopy({ count: 2, hand: null, warmup: false, chips: 0 }).hand).toBe('Today’s card is in your hand.');
  });
});

describe('the table colour', () => {
  const light = { scheme: 'light' as const, bg: themes.light.bg };
  const dark = { scheme: 'dark' as const, bg: themes.dark.bg };
  const unlocked = Object.values(tables).map((t) => ({ scheme: t.scheme, bg: t.bg }));

  it('calls for the same text colour on every felt of a table, so the chrome stays readable mid-crossfade', () => {
    for (const table of [light, dark, ...unlocked]) {
      const schemes = new Set(Object.values(cardColors).map((c) => on(feltFor(c, table)).scheme));
      expect(schemes.size).toBe(1);
      for (const c of Object.values(cardColors)) {
        const felt = feltFor(c, table);
        for (const other of Object.values(cardColors)) {
          // Halfway between two felts, the chrome's text still reads.
          const blend = feltFor(other, table);
          const mid = mixHex(felt, blend);
          const text = on(mid).text;
          expect(contrastOf(text, mid)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('keeps a deep card clearly apart from its own felt', () => {
    for (const name of ['tomato', 'pine', 'sky'] as const) expect(cardOnFelt(cardColors[name], light)).toBeGreaterThanOrEqual(3);
    for (const c of Object.values(cardColors)) expect(cardOnFelt(c, dark)).toBeGreaterThan(1.4);
  });
});

describe('moments', () => {
  const ev = (id: number, kind: string) => ({ id, kind });

  it('shows one moment for everything waiting, face card first', () => {
    const m = momentOf([ev(1, 'deal'), ev(2, 'milestone'), ev(3, 'face')]);
    expect(m?.kind).toBe('face');
    expect(m?.main.id).toBe(3);
    expect(m?.ids).toEqual([1, 2, 3]);
    expect(m?.also.map((e) => e.kind)).toEqual(['deal', 'milestone']);
  });

  it('puts the first card before a milestone, and a milestone before a receipt', () => {
    expect(momentOf([ev(1, 'milestone'), ev(2, 'first')])?.kind).toBe('first');
    expect(momentOf([ev(1, 'deal'), ev(2, 'milestone')])?.kind).toBe('milestone');
  });

  it('shows a receipt for the latest check-in when nothing bigger happened', () => {
    const m = momentOf([ev(1, 'deal'), ev(2, 'backfill'), ev(3, 'deal')]);
    expect(m?.kind).toBe('receipt');
    expect(m?.main.id).toBe(3);
    expect(momentOf([])).toBeNull();
  });

  it('keeps a rung reached on the same keep as a deal, on the deal’s receipt', () => {
    // The data layer emits the rung before the deal.
    const m = momentOf([ev(1, 'rung'), ev(2, 'deal')]);
    expect(m).toMatchObject({ kind: 'receipt', main: { id: 2, kind: 'deal' }, ids: [1, 2] });
    expect(m?.also.map((e) => e.kind)).toEqual(['rung']);
    expect(momentOf([ev(1, 'rung'), ev(2, 'backfill')])?.main.kind).toBe('backfill');
    expect(momentOf([ev(1, 'rung')])?.main.kind).toBe('rung');
  });
});

describe('events that no longer match the deck', () => {
  const today = '2026-10-16';
  const levels = new Map<string, string | null>([
    ['walk:2026-10-16', 'floor'],
    ['read:2026-10-15', 'ceiling'],
  ]);
  const live = { level: (id: string, day: string) => (levels.get(`${id}:${day}`) ?? null) as 'floor' | 'ceiling' | null, suitDays: (suit: string) => (suit === 'clubs' ? 149 : 200) };

  it('drops a receipt whose check-in was undone or changed level', () => {
    expect(eventStale({ kind: 'deal', habitId: 'walk', level: 'floor' }, today, live)).toBe(false);
    expect(eventStale({ kind: 'deal', habitId: 'walk', level: 'ceiling' }, today, live)).toBe(true);
    expect(eventStale({ kind: 'deal', habitId: 'focus', level: 'floor' }, today, live)).toBe(true);
    expect(eventStale({ kind: 'backfill', habitId: 'read', level: 'ceiling', day: '2026-10-15' }, today, live)).toBe(false);
    expect(eventStale({ kind: 'backfill', habitId: 'read', level: 'floor', day: '2026-10-15' }, today, live)).toBe(true);
  });

  it('drops a rung the suit fell back below, and never touches the big moments', () => {
    expect(eventStale({ kind: 'rung', suit: 'clubs', days: 150 }, today, live)).toBe(true);
    expect(eventStale({ kind: 'rung', suit: 'spades', days: 200 }, today, live)).toBe(false);
    expect(eventStale({ kind: 'face' }, today, live)).toBe(false);
    expect(eventStale({ kind: 'milestone' }, today, live)).toBe(false);
  });
});

describe('receipts', () => {
  const pair = { kind: 'pair' as const, title: 'Pair of Eights', score: 200 };
  const pairBetter = { kind: 'pair' as const, title: 'Pair of Eights', score: 210 };
  const high = { kind: 'high-card' as const, title: 'King high', score: 100 };
  const trips = { kind: 'three-of-a-kind' as const, title: 'Three Eights', score: 400 };
  const deal = { kind: 'deal' as const, level: 'floor' as const, card: 'Eight of Spades', joker: false, wentUp: true, first: false, dropped: false, hand: pair, handWas: high, saved: false };

  it('names the card, the level and what the hand became', () => {
    expect(receiptCopy(deal)).toEqual({ eyebrow: 'Floor kept', title: 'Today’s card went up', lead: null, line: 'Eight of Spades. Your hand is now a Pair of Eights.', notes: [] });
    expect(receiptCopy({ ...deal, level: 'ceiling', first: true }).title).toBe('Today’s card');
  });

  it('says a better side card is just that, not a stronger hand of the same name', () => {
    expect(receiptCopy({ ...deal, card: 'Ten of Hearts', hand: pairBetter, handWas: pair }).line).toBe('Ten of Hearts. Still a Pair of Eights, now with a higher side card.');
    expect(receiptCopy({ ...deal, card: 'Ten of Hearts', hand: { ...trips, score: 410 }, handWas: trips }).line).toBe('Ten of Hearts. Still Three Eights, now with a higher side card.');
  });

  it('says plainly when a higher card broke a match', () => {
    const r = receiptCopy({ ...deal, dropped: true, hand: high, handWas: pair });
    expect(r.title).toBe('Today’s card changed');
    expect(r.line).toBe('Eight of Spades. A higher card broke your Pair of Eights. Your hand is now King high.');
  });

  it('leads with a saved yesterday, so it is never the line that gets cut', () => {
    const r = receiptCopy({ ...deal, card: 'Ten of Diamonds', hand: pairBetter, handWas: pair, saved: true });
    expect(r.lead).toBe('Yesterday’s card was saved too.');
    expect(r.line).toBe('Ten of Diamonds. Still a Pair of Eights, now with a higher side card.');
  });

  it('celebrates a Joker with the one rule every screen uses', () => {
    const r = receiptCopy({ ...deal, card: 'Joker', joker: true, handWas: pair });
    expect(r.title).toBe('A Joker!');
    expect(r.line).toBe('Your hand: a Pair of Eights.');
    expect(r.notes).toEqual([JOKER_LINE]);
    expect(JOKER_LINE).toBe('It has no suit and plays as any rank.');
  });

  it('tells a rung reached on the same keep', () => {
    expect(receiptCopy({ ...deal, rung: { part: 'Mind', days: 150 } }).notes).toEqual(['And 150 days of Mind in the Court.']);
    expect(receiptCopy({ kind: 'rung', suit: 'Clubs', part: 'Mind', days: 150 })).toMatchObject({ title: '150 days of Mind', line: 'Still climbing toward the Ace.' });
  });

  describe('a day logged late', () => {
    const late = { kind: 'backfill' as const, level: 'ceiling' as const, card: 'Seven of Spades', joker: false, blank: true, hand: pair, handWas: high };

    it('says yesterday counts when it had no card, and never calls it saved', () => {
      const r = receiptCopy(late);
      expect(r).toEqual({ eyebrow: 'Ceiling reached', title: 'Yesterday counts', lead: null, line: 'Seven of Spades. Your hand is now a Pair of Eights.', notes: [] });
      expect(Object.values(receiptCopy({ ...late, blank: false })).join(' ')).not.toMatch(/saved/i);
    });

    it('says yesterday was logged when it already had a card', () => {
      expect(receiptCopy({ ...late, blank: false, handWas: pair }).title).toBe('Yesterday logged');
    });

    it('says plainly when the late log lowered the hand', () => {
      // A day now fully kept deals higher, which can break the pair its old card made.
      const r = receiptCopy({ ...late, blank: false, card: 'Nine of Spades', hand: high, handWas: pair, dropped: true, wentUp: true });
      expect(r.line).toBe('Nine of Spades. A higher card broke your Pair of Eights. Your hand is now King high.');
      expect(receiptCopy({ ...late, blank: false, hand: high, handWas: pair, dropped: true }).line).toBe('Seven of Spades. Your hand is now King high. It was a Pair of Eights.');
    });

    it('says so plainly when the late log moved the Joker off today', () => {
      const r = receiptCopy({ ...late, card: 'Joker', joker: true, blank: false, hand: trips, handWas: trips, moved: { day: 'Thursday', face: 'Queen of Hearts', today: 'Ten of Hearts' } });
      expect(r.title).toBe('Yesterday logged');
      expect(r.lead).toBe('The Queen of Hearts now lands on Thursday, so its Joker moved there. Today is a Ten of Hearts.');
      expect(r.line).toBe('Your hand: Three Eights.');
      expect(receiptCopy({ ...late, joker: true, moved: { day: 'Monday', face: null, today: 'Eight of Clubs' } }).lead).toBe('The week’s Joker moved to Monday, your first kept day. Today is an Eight of Clubs.');
      expect(receiptCopy({ ...late, joker: true, moved: { day: 'Monday', face: null, today: null } }).lead).toBe('Your waiting Joker landed on Monday.');
    });
  });

  it('puts the right article before a card', () => {
    expect(aCard('Eight of Clubs')).toBe('an Eight of Clubs');
    expect(aCard('Ace of Spades')).toBe('an Ace of Spades');
    expect(aCard('Ten of Hearts')).toBe('a Ten of Hearts');
  });
});

describe('one interruption at a time', () => {
  const quiet = { moment: false, coachDue: false, reminderDue: false, visitAfterKeeping: false, faceToday: false, comebackToday: false };

  it('lets a moment beat the coach mark and the reminder question', () => {
    expect(interruptionFor({ ...quiet, moment: true, coachDue: true, reminderDue: true, visitAfterKeeping: true })).toBe('moment');
    expect(interruptionFor({ ...quiet, coachDue: true, reminderDue: true, visitAfterKeeping: true })).toBe('coach');
  });

  it('asks about reminders on a later visit, never on a face card day or a Comeback day', () => {
    expect(interruptionFor({ ...quiet, reminderDue: true })).toBeNull();
    expect(interruptionFor({ ...quiet, reminderDue: true, visitAfterKeeping: true })).toBe('reminder');
    expect(interruptionFor({ ...quiet, reminderDue: true, visitAfterKeeping: true, faceToday: true })).toBeNull();
    expect(interruptionFor({ ...quiet, reminderDue: true, visitAfterKeeping: true, comebackToday: true })).toBeNull();
  });

  it('holds the reminder question while a Showdown waits to open or Today is out of sight', () => {
    const due = { ...quiet, reminderDue: true, visitAfterKeeping: true };
    expect(interruptionFor({ ...due, inFront: true, showdownPending: false })).toBe('reminder');
    expect(interruptionFor({ ...due, inFront: true, showdownPending: true })).toBeNull();
    expect(interruptionFor({ ...due, inFront: false })).toBeNull();
    expect(interruptionFor({ ...due, moment: true, showdownPending: true })).toBe('moment');
  });
});

function mixHex(a: string, b: string): string {
  const pa = hex(a);
  const pb = hex(b);
  return `#${pa.map((v, i) => Math.round((v + pb[i]) / 2).toString(16).padStart(2, '0')).join('')}`;
}

function hex(c: string): number[] {
  const m = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
}

function contrastOf(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = hex(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
