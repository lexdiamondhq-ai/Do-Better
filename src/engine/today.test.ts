import { describe, expect, it } from 'vitest';

import { cardColors, on, tables, themes } from '@/theme/tokens';

import {
  allKeptCopy,
  allowFor,
  buildQueue,
  cardKey,
  cardOnFelt,
  comebackCopy,
  comebackGap,
  densityFor,
  feltFor,
  identityLine,
  interruptionFor,
  keptLine,
  laterTag,
  momentOf,
  partOfDayAt,
  receiptCopy,
  timing,
  todayTips,
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

  it('plays cards for now first, then later today, then earlier, keeping deck order within each', () => {
    const cards = [card('m1', { part: 'morning' }), card('e1', { part: 'evening' }), card('a1'), card('d1', { part: 'midday' }), card('e2', { part: 'evening' }), card('m2', { part: 'morning' })];
    expect(ids(buildQueue({ cards, deferred: [], now: 'midday' }))).toEqual(['a1', 'd1', 'e1', 'e2', 'm1', 'm2']);
    expect(ids(buildQueue({ cards, deferred: [], now: 'morning' }))).toEqual(['m1', 'a1', 'm2', 'e1', 'd1', 'e2']);
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
    expect(densityFor(base)).toEqual({ mode: 'regular', mergeTip: false, foldComeback: false, tightComeback: false });
  });

  it('folds the card when its body is shorter than 360 points', () => {
    expect(densityFor({ ...base, cardHeight: 359 }).mode).toBe('compact');
    expect(densityFor({ ...base, cardHeight: 360 }).mode).toBe('regular');
  });

  it('folds the Comeback card sooner, below 470 points', () => {
    expect(densityFor({ ...base, cardHeight: 469 })).toMatchObject({ mode: 'regular', foldComeback: true });
    expect(densityFor({ ...base, cardHeight: 470 }).foldComeback).toBe(false);
  });

  it('keeps the Comeback evidence line until the card is shorter than 340 points', () => {
    expect(densityFor({ ...base, cardHeight: 353 })).toMatchObject({ mode: 'compact', foldComeback: true, tightComeback: false });
    expect(densityFor({ ...base, cardHeight: 339 }).tightComeback).toBe(true);
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

  it('keeps only the tips that matter today', () => {
    const tips = (['climb', 'joker', 'draw', 'rescue', 'showdown', 'call', 'face', 'deal', 'done'] as const).map((tone) => ({ tone, text: tone }));
    expect(todayTips(tips).map((t) => t.tone)).toEqual(['joker', 'rescue', 'call', 'face']);
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
});

describe('receipts', () => {
  const pair = { kind: 'pair' as const, title: 'Pair of Eights', score: 200 };
  const high = { kind: 'high-card' as const, title: 'King high', score: 100 };
  const deal = { kind: 'deal' as const, level: 'floor' as const, joker: false, wentUp: true, first: false, dropped: false, hand: pair, handWas: high, saved: false };

  it('names the level and what the hand became', () => {
    expect(receiptCopy(deal)).toEqual({ eyebrow: 'Floor kept', title: 'Today’s card went up', line: 'Your hand is now a Pair of Eights.' });
    expect(receiptCopy({ ...deal, level: 'ceiling', first: true }).title).toBe('Today’s card');
  });

  it('says plainly when a higher card broke a match', () => {
    const r = receiptCopy({ ...deal, dropped: true, hand: high, handWas: pair });
    expect(r.title).toBe('Today’s card changed');
    expect(r.line).toBe('A higher card broke your Pair of Eights. Your hand is now King high.');
  });

  it('celebrates a Joker and a saved yesterday', () => {
    const r = receiptCopy({ ...deal, joker: true, saved: true, handWas: pair });
    expect(r.title).toBe('A Joker!');
    expect(r.line).toBe('It plays as any card. Your hand: a Pair of Eights. Yesterday’s card was saved too.');
  });

  it('covers a late log and a Court rung', () => {
    expect(receiptCopy({ kind: 'backfill', level: 'ceiling', hand: pair })).toEqual({ eyebrow: 'Logged late · Ceiling reached', title: 'Yesterday saved', line: 'Your hand: a Pair of Eights.' });
    expect(receiptCopy({ kind: 'rung', suit: 'Clubs', part: 'Mind', days: 150 }).title).toBe('150 days of Mind');
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
