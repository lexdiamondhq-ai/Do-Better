import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUITS } from '@/engine/cards';
import type { DayCard } from '@/engine/deal';
import type { Week } from '@/engine/game';
import { bestHand } from '@/engine/poker';
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

const { callLine, feltFor, FOOTER, handLines, share, shareCaption, suitedLine, weekLine } = await import('./share');

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
});

describe('the call line', () => {
  it('says what a made call paid, by its multiplier', () => {
    expect(callLine(week(twoPair, { call: 'two-pair', madeCall: true, callMultiplier: 1, bonus: 50 }))).toMatchObject({ kind: 'made', title: 'Called it. The safe call, paid ×1.', chips: 50 });
    expect(callLine(week(twoPair, { call: 'pair', madeCall: true, callMultiplier: 0 }))).toMatchObject({ title: 'Called it.', detail: 'You called Pair. A sure thing, so nothing extra.', chips: 0 });
    expect(callLine(week(twoPair, { call: 'pair', madeCall: true, callMultiplier: 2, bonus: 60 }))?.title).toBe('Called it. A stretch, paid ×2.');
    expect(callLine(week(twoPair, { call: 'pair', madeCall: true, callMultiplier: 3, bonus: 90 }))?.title).toBe('Called it. A long shot, paid ×3.');
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
    expect(text).toContain('100 Body days as someone who moves every day.');
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
});
