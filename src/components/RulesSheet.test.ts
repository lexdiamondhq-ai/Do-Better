import { describe, expect, it, vi } from 'vitest';

import { FACES, RUNGS } from '@/engine/court';
import { KEPT_LO, RIVER_DAYS, TOP_LO } from '@/engine/deal';
import { CALL_HISTORY } from '@/engine/game';
import { HANDS, SUITED_BONUS } from '@/engine/poker';

// The sheet's words are plain data; nothing on screen is drawn here.
vi.mock('react-native', () => ({ Modal: () => null, Platform: { OS: 'ios' }, Pressable: () => null, ScrollView: () => null, Text: () => null, View: () => null, useWindowDimensions: () => ({ width: 375, height: 667 }) }));
vi.mock('react-native-reanimated', () => ({ default: { View: () => null }, Easing: { linear: (x: number) => x }, ReduceMotion: { System: 'system' }, useAnimatedStyle: () => ({}), useSharedValue: () => ({ get: () => 0, set: () => {} }), withSequence: () => 0, withSpring: () => 0, withTiming: () => 0 }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('@/theme/ThemeProvider', () => ({ useTheme: () => ({}) }));
vi.mock('@/lib/feel', () => ({ tick: () => {} }));
vi.mock('@/lib/sound', () => ({ playSound: () => {}, playTones: () => {} }));
vi.mock('./ui', () => ({ Body: () => null, Display: () => null, Label: () => null }));
vi.mock('./HandFan', () => ({ EXAMPLES: {}, HandRow: () => null }));
vi.mock('./Suit', () => ({ SuitGlyph: () => null }));
vi.mock('./Chips', () => ({ ChipIcon: () => null, formatChips: (n: number) => String(n) }));
vi.mock('./CardBack', () => ({ CardBack: () => null }));
vi.mock('./PlayingCard', () => ({
  CARD_SIZES: { xs: { w: 40, h: 56, radius: 7 } },
  PlayingCard: () => null,
  faceLabel: () => 'card',
  faceOfDay: (card: { kind: string; rank?: number; suits: string[]; rescued?: boolean }) => (card.kind === 'joker' ? { kind: 'joker' } : { kind: 'card', rank: card.rank, suit: card.suits[0] ?? null, rescued: card.rescued }),
  faceOfPlayed: (card: { rank: number; suit: string | null; joker: boolean }) => (card.joker ? { kind: 'joker', as: { rank: card.rank, suit: card.suit } } : { kind: 'card', rank: card.rank, suit: card.suit }),
}));
vi.mock('@/lib/deck', () => ({ useDeck: () => null, useLook: () => ({ back: 'classic' }) }));
// The Showdown's marks come from showdown.ts; each test sets what it returns.
const stamps = vi.hoisted(() => ({ now: {} as Record<string, 'floor' | 'ceiling'> }));
vi.mock('@/engine/showdown', () => ({ stampsFor: () => stamps.now }));

const { RULES, HAND_PRICES, handPrices, ladder, miniCaption, miniCaptionSaid, miniLabel, miniSlots, cardTone, openingScroll, ringLift, ringTimes, sectionAt, slotWhat } = await import('./RulesSheet');
const { STRUM_MS } = await import('@/engine/chord');
const { space } = await import('@/theme/tokens');
const { WEAR_AT } = await import('@/engine/wear');

type Week = import('@/engine/game').Week;
type Game = import('@/engine/game').Game;
type DayCard = import('@/engine/deal').DayCard;
type Slot = import('@/engine/deal').Slot;

const MON = '2026-10-19';
const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
const dealt = (day: string, rank: number, suits: string[], o: Partial<Extract<DayCard, { kind: 'card' }>> = {}): DayCard =>
  ({ kind: 'card', day, rank, suits, ceilingSuits: [], tier: 'kept-all', lo: 5, rescued: false, ...o }) as DayCard;
/**
 * Friday of a week: Monday a King of Hearts kept at the Ceiling, Tuesday saved, Wednesday a King of
 * Clubs, Thursday a Joker, today still open, the weekend to come. Kings and the Joker make the hand.
 */
function friday(o: Partial<Week> = {}): Week {
  const cards: (DayCard | null)[] = [
    dealt(days[0], 13, ['hearts'], { ceilingSuits: ['hearts'], lo: 6 }),
    dealt(days[1], 4, [], { rescued: true, lo: 2 }),
    dealt(days[2], 13, ['clubs', 'spades']),
    { kind: 'joker', day: days[3], suits: ['diamonds'], ceilingSuits: [], tier: 'kept-all', lo: 5 },
    null,
    null,
    null,
  ];
  const slots: Slot[] = days.map((day, i) => ({ day, card: cards[i], isToday: i === 4, state: cards[i] ? 'dealt' : i === 4 ? 'open' : 'future' }));
  return {
    start: MON,
    slots,
    hand: {
      kind: 'three-of-a-kind',
      cards: [
        { rank: 13, suit: 'hearts', day: days[0], joker: false },
        { rank: 13, suit: 'clubs', day: days[2], joker: false },
        { rank: 13, suit: null, day: days[3], joker: true },
        { rank: 4, suit: null, day: days[1], joker: false },
      ],
      ranks: [13, 4],
      suit: null,
      suited: null,
      score: 0,
      title: 'Three Kings',
    },
    call: 'two-pair',
    madeCall: true,
    chips: 70,
    suitedBonus: 0,
    bonus: 100,
    callMultiplier: 2,
    live: true,
    warmup: false,
    river: { earned: false, need: 2, card: null },
    contains: new Set(['pair', 'three-of-a-kind']),
    keptDays: 4,
    ...o,
  } as Week;
}
const game = (week: Week, hall: { kind: string; count: number }[] = []) => ({ current: week, hall }) as unknown as Pick<Game, 'hall' | 'current'>;

const all = RULES.flatMap((s) => [s.title, s.chip, ...s.rules.flatMap((r) => [r.term, r.line])]);
const line = (term: string) => RULES.flatMap((s) => s.rules).find((r) => r.term === term)?.line ?? '';

describe('the rules sheet', () => {
  it('has a section for every topic a screen can open it at', () => {
    expect(RULES.map((s) => s.key).sort()).toEqual(['call', 'comeback', 'court', 'deal', 'fair', 'leave', 'river', 'showdown', 'suits', 'week']);
  });

  it('opens at the section it was asked for, with that section’s chip lit', () => {
    const tops = Object.fromEntries(RULES.map((s, i) => [s.key, i * 700 + (i ? 40 : 0)]));
    const list = RULES.map((s) => ({ key: s.key, y: tops[s.key] }));
    for (const s of RULES) {
      const y = openingScroll(s.key, tops);
      expect(y).toBe(Math.max(0, tops[s.key] - space.md));
      expect(sectionAt(list, y! + space.md + 1, false)).toBe(s.key);
    }
    expect(openingScroll(undefined, tops)).toBeNull();
    expect(openingScroll('river', {})).toBeNull();
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

  it('marks the hand you hold with the gold bar and outlines your call, strongest hand first', () => {
    const rows = ladder(game(friday()));
    expect(rows[0].kind).toBe('five-of-a-kind');
    expect(rows.at(-1)!.kind).toBe('high-card');
    expect(rows.filter((r) => r.mine).map((r) => r.kind)).toEqual(['three-of-a-kind']);
    expect(rows.filter((r) => r.called)).toEqual([expect.objectContaining({ kind: 'two-pair', multiplier: 2, made: true, mine: false })]);
    const notYet = ladder(game(friday({ madeCall: false, call: 'full-house', callMultiplier: 3 })));
    expect(notYet.find((r) => r.called)).toMatchObject({ kind: 'full-house', multiplier: 3, made: false });
    const same = ladder(game(friday({ call: 'three-of-a-kind' })));
    expect(same.find((r) => r.kind === 'three-of-a-kind')).toMatchObject({ mine: true, called: true });
    const quiet = ladder(game(friday({ hand: null, call: null, callMultiplier: 0 })));
    expect(quiet.some((r) => r.mine || r.called)).toBe(false);
    expect(ladder(null).some((r) => r.mine || r.called)).toBe(false);
  });

  it('keeps the secret hand face down until a week has held it, or it’s the hand you hold', () => {
    expect(ladder(null).find((r) => r.kind === 'five-of-a-kind')!.hidden).toBe(true);
    expect(ladder(game(friday())).find((r) => r.kind === 'five-of-a-kind')!.hidden).toBe(true);
    expect(ladder(game(friday(), [{ kind: 'five-of-a-kind', count: 0 }])).find((r) => r.kind === 'five-of-a-kind')!.hidden).toBe(true);
    expect(ladder(game(friday(), [{ kind: 'five-of-a-kind', count: 1 }])).find((r) => r.kind === 'five-of-a-kind')!.hidden).toBe(false);
    const held = friday({ hand: { ...friday().hand!, kind: 'five-of-a-kind' } });
    expect(ladder(game(held)).find((r) => r.kind === 'five-of-a-kind')).toMatchObject({ hidden: false, mine: true });
    expect(ladder(game(friday())).filter((r) => r.hidden).every((r) => r.chips === 800)).toBe(true);
  });

  it('keeps a secret hand secret until it has been spotted, as the Hands tab does', () => {
    const hidden = handPrices(new Set()).filter((h) => h.hidden);
    expect(hidden.map((h) => h.kind)).toEqual(['five-of-a-kind']);
    expect(hidden[0].chips).toBe(HANDS['five-of-a-kind'].chips);
    expect(handPrices(new Set(['five-of-a-kind'])).some((h) => h.hidden)).toBe(false);
    for (const h of handPrices(new Set())) expect(h.hidden).toBe(HANDS[h.kind].secret);
  });

  it('highlights the section being read, and the last one at the end of the page', () => {
    const tops = [
      { key: 'deal' as const, y: 0 },
      { key: 'week' as const, y: 600 },
      { key: 'river' as const, y: 1500 },
      { key: 'comeback' as const, y: 2400 },
    ];
    expect(sectionAt(tops, 0, false)).toBe('deal');
    expect(sectionAt(tops, 599, false)).toBe('deal');
    expect(sectionAt(tops, 600, false)).toBe('week');
    expect(sectionAt(tops, 1800, false)).toBe('river');
    expect(sectionAt(tops, 1800, true)).toBe('comeback');
    expect(sectionAt([], 100, false)).toBeUndefined();
  });

  it('carries this round’s rules, in the words the rest of the app uses', () => {
    expect(line('Outs')).toMatch(/ranks a fully kept day can deal \(5 and up\), and never which day/);
    expect(line('River outs')).toMatch(/From Saturday, or once the river is earned/);
    expect(line('River outs')).toMatch(/face down until midnight on Sunday/);
    expect(line('↓ and ↑')).toBe('Under each played card, ↓ marks a Floor day and ↑ a Ceiling day.');
    expect(line('What made this hand')).toMatch(/Without them: Queen high/);
    expect(line('One total')).toMatch(/Straight 100 \+ Call 100 = 200/);
    expect(line('Hand names')).toMatch(/Straight, Six to Ten/);
    expect(line('The river decides')).toMatch(/pauses before the river/);
    expect(line('Safe ×1, Stretch ×2, Long shot ×3')).toMatch(/Safe pays the called hand’s chips again, Stretch twice, Long shot three times/);
    expect(line('Turn it back over')).toMatch(/turns back over/);
    expect(line('Yesterday’s card')).toMatch(/whole of yesterday got away.*face up.*it’s yours/);
    expect(line('Floor held')).toMatch(/Done it/);
    expect(line('Your plan')).toMatch(/First move or your Floor.*Last call reminder.*saved on this phone/);
    expect(line('Never lost')).toBe('Once the day ends, face cards are never lost.');
    expect(line('Worn in')).toBe(
      `Cards wear in with their own kept days: Worn in at ${WEAR_AT.worn}, Well played at ${WEAR_AT.played} (a crease and your thumb mark), a gilt edge at ${WEAR_AT.gilt}, an Heirloom at a year. Nothing can buy wear.`,
    );
    expect(WEAR_AT.heirloom).toBe(365);
    expect(line('Its own note')).toMatch(/Body F, People A, Craft C, Mind D/);
    expect(line('The day’s chord')).toBe('Keep every card and the day plays as a chord.');
    expect(line('When it plays first')).toMatch(/needs a When it plays.*No chips or hands/);
    expect(line('Print')).toMatch(/size of a playing card.*card back on the reverse/);
    expect(line('Outs stay fair')).toBe('Outs never name a day, and never count ranks below 5.');
    expect(line('The river waits')).toBe('The live river is never worked out early.');
    expect(line('Credit only')).toMatch(/Floor credit is credit only/);
    expect(line('On this phone')).toMatch(/Wear, plans and seen moments.*Delete my deck/);
    expect(line('Chips stay')).toBe('Still no streaks, and chips never leave the stack.');
    expect(line('Days to come')).toMatch(/face down in your card back.*New week/);
    expect(line('Into your week')).toMatch(/dealt into its place in your week/);
    for (const r of RULES.flatMap((s) => s.rules)) expect(`${r.term} ${r.line}`).not.toMatch(/'/);
  });

  it('shows each section’s part of your own week', () => {
    const week = friday();
    const hand = miniSlots(week, 'hand');
    expect(hand.map((s) => s.letter)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(hand.map((s) => s.held)).toEqual([true, true, true, true, false, false, false]);
    expect(hand[4]).toMatchObject({ open: true, face: null });
    expect(hand.slice(5).every((s) => s.back && !s.focus)).toBe(true);
    expect(miniCaption(week, 'hand')).toBe('Three Kings');

    expect(miniSlots(week, 'deal').slice(0, 4).map((s) => s.under)).toEqual(['6+', '↺', '5+', '★']);

    const river = miniSlots(week, 'river');
    expect(river).toHaveLength(8);
    expect(river[7]).toMatchObject({ letter: 'River', back: false, dashed: true, center: '+2' });
    expect(miniCaption(week, 'river')).toBe('2 more kept days earn it.');
    expect(miniCaption(friday({ river: { earned: false, need: 1, card: null } }), 'river')).toBe('1 more kept day earns it.');
    const earned = friday({ river: { earned: true, need: 0, card: null } });
    expect(miniSlots(earned, 'river')[7]).toMatchObject({ back: true, focus: true });
    expect(miniCaption(earned, 'river')).toBe('Earned. It turns at the Showdown.');

    const saved = miniSlots(week, 'saved');
    expect(saved.map((s) => s.focus).slice(0, 4)).toEqual([false, true, false, false]);
    expect(saved[1].under).toBe('↺');
    expect(miniCaption(week, 'saved')).toBe('A saved day shows ↺.');
    // With nothing saved, nothing dims.
    const none = friday();
    none.slots[1] = { ...none.slots[1], card: dealt(days[1], 4, ['spades']) };
    expect(miniSlots(none, 'saved').slice(0, 4).map((s) => s.focus)).toEqual([true, true, true, true]);

    const court = miniSlots(week, 'court').slice(0, 4);
    expect(court.map((s) => s.under)).toEqual(['♥', null, '♣♠', '♦']);
    expect(court.map((s) => s.underSuits)).toEqual([['hearts'], [], ['clubs', 'spades'], ['diamonds']]);
    expect(miniCaption(week, 'court')).toBe('♠ 1  ♥ 1  ♦ 1  ♣ 1 days this week');
  });

  it('shows the hand’s own cards for the Showdown and the call, with the call in words', () => {
    const week = friday();
    stamps.now = { [days[0]]: 'ceiling', [days[2]]: 'floor' };
    const row = miniSlots(week, 'stamps');
    expect(row).toHaveLength(4);
    expect(row.map((s) => s.letter)).toEqual(['M', 'W', 'T', 'T']);
    expect(row.map((s) => s.under)).toEqual(['↑', '↓', null, null]);
    expect(miniCaption(week, 'stamps')).toBe('↓ Floor day  ·  ↑ Ceiling day');
    // No marks yet: the row is just the hand, so the line names it rather than a legend for nothing.
    stamps.now = {};
    expect(miniSlots(week, 'stamps').every((s) => s.under === null)).toBe(true);
    expect(miniCaption(week, 'stamps')).toBe('Three Kings');
    expect(miniCaption(week, 'call')).toBe('Your call: Two pair ×2, made');
    expect(miniCaption(friday({ madeCall: false }), 'call')).toBe('Your call: Two pair ×2');
    expect(miniCaption(friday({ call: null }), 'call', { callOpen: true })).toBe('No call yet this week.');
    expect(miniCaption(friday({ call: null }), 'call')).toBe('No call this week.');
    expect(miniCaption(friday({ warmup: true, call: null }), 'call')).toBe('A warm-up week has no call.');
    expect(miniSlots(friday({ hand: null }), 'call')).toHaveLength(7);
  });

  it('shows yesterday’s card dashed while it can still be saved', () => {
    const week = friday();
    week.slots[3] = { ...week.slots[3], card: null, state: 'blank' };
    const card = dealt(days[3], 9, [], { rescued: true, lo: 2 });
    const slots = miniSlots(week, 'saved', { day: days[3], card });
    expect(slots[3]).toMatchObject({ dashed: true, under: '↺', focus: true });
    expect(slots[3].face).toMatchObject({ rank: 9 });
    expect(miniCaption(week, 'saved', { rescue: true })).toBe('Yesterday’s card can still be saved.');
    expect(miniSlots(week, 'deal')[3]).toMatchObject({ face: null, focus: false, center: '·' });
  });

  it('gives each card the note its leading suit plays, an octave up for a Ceiling, the low F for none', () => {
    const notes = miniSlots(friday(), 'notes');
    expect(notes.slice(0, 4).map((s) => s.tone)).toEqual(['ring-a5', 'ring-low', 'ring-d5', 'ring-low']);
    expect(notes.slice(0, 4).map((s) => s.under)).toEqual(['A', 'low F', 'D', 'low F']);
    expect(notes.slice(4).every((s) => s.tone === null)).toBe(true);
    expect(cardTone(dealt(days[0], 7, ['spades']))).toBe('ring-f4');
    expect(cardTone(dealt(days[0], 7, ['spades', 'clubs'], { ceilingSuits: ['clubs'] }))).toBe('ring-f4');
    expect(cardTone(dealt(days[0], 7, ['diamonds'], { ceilingSuits: ['diamonds'] }))).toBe('ring-c6');
    expect(miniCaption(friday(), 'notes')).toBe('Tap a card to hear its note.');
  });

  it('says there are no cards yet on a Monday morning, rather than pointing at cards that aren’t there', () => {
    const monday = friday({ hand: null, call: null, callMultiplier: 0, madeCall: false, river: { earned: false, need: 5, card: null } });
    monday.slots = monday.slots.map((s, i) => ({ ...s, card: null, isToday: i === 0, state: i === 0 ? 'open' : 'future' }));
    for (const mode of ['deal', 'hand', 'stamps', 'court', 'notes'] as const) expect(miniCaption(monday, mode)).toBe('No cards yet this week.');
    expect(miniSlots(monday, 'notes').some((s) => s.tone)).toBe(false);
    // A count of zeros is never shown: nothing here starts again from nothing.
    expect(miniCaption(monday, 'court')).not.toMatch(/0/);
  });

  it('gives a warm-up week no river and no Showdown, as the rules say', () => {
    const warm = friday({ warmup: true, call: null, callMultiplier: 0, madeCall: false, river: { earned: false, need: 1, card: null } });
    const river = miniSlots(warm, 'river');
    expect(river).toHaveLength(7);
    expect(river.some((s) => s.key === 'river')).toBe(false);
    expect(miniCaption(warm, 'river')).toBe('A warm-up week has no river.');
    expect(miniCaption(warm, 'stamps')).toBe('A warm-up week has no Showdown.');
    expect(miniCaption(warm, 'call')).toBe('A warm-up week has no call.');
    expect(ladder(game(warm)).find((r) => r.mine)?.kind).toBe('three-of-a-kind');
  });

  it('reads each row to VoiceOver with whole day names and words, never a mark’s symbol', () => {
    const week = friday();
    stamps.now = { [days[0]]: 'ceiling', [days[2]]: 'floor' };
    const stampsLabel = miniLabel(miniSlots(week, 'stamps'), miniCaptionSaid(week, 'stamps'));
    expect(stampsLabel).toMatch(/^Your week\. Three Kings\. Monday, card, Ceiling day\. Wednesday, card, Floor day\. Thursday, card\. Tuesday, card\.$/);
    stamps.now = {};
    const labels = (['deal', 'hand', 'river', 'saved', 'court', 'call'] as const).map((mode) => miniLabel(miniSlots(week, mode), miniCaptionSaid(week, mode)));
    for (const label of [stampsLabel, ...labels]) {
      expect(label).not.toMatch(/[↓↑↺★♠♥♦♣]/);
      expect(label).not.toMatch(/(^|\. )[MTWFS],/);
    }
    expect(labels[0]).toMatch(/Monday, card, 6 or better\. Tuesday, card\. Wednesday, card, 5 or better\. Thursday, card\. Friday, not dealt yet\. Saturday, face down/);
    expect(labels[4]).toMatch(/Days this week: Spades 1, Hearts 1, Diamonds 1, Clubs 1\. Monday, card, counts for Hearts\. Tuesday, card\. Wednesday, card, counts for Clubs and Spades/);
    expect(miniLabel(miniSlots(friday({ river: { earned: false, need: 1, card: null } }), 'river'), null)).toMatch(/River, 1 more kept day to go\.$/);
    expect(labels[2]).toMatch(/River, 2 more kept days to go\.$/);
    const rescue = { day: days[3], card: dealt(days[3], 9, [], { rescued: true, lo: 2 }) };
    const blank = friday();
    blank.slots[3] = { ...blank.slots[3], card: null, state: 'blank' };
    expect(miniLabel(miniSlots(blank, 'saved', rescue), miniCaptionSaid(blank, 'saved', { rescue: true }))).toMatch(
      /^Your week\. Yesterday’s card can still be saved\..*Thursday, card, yours if you keep anything today\./,
    );
    expect(slotWhat({ ...miniSlots(week, 'river')[7], center: '+3' })).toBe('3 more kept days to go');
  });

  it('lifts each card of a played week on its own note, low to high, and lets it settle', () => {
    const slots = miniSlots(friday(), 'notes');
    const at = ringTimes(slots);
    // Monday rings A5, Wednesday D5, and the saved Tuesday and the Joker share the low F.
    expect(at).toEqual({ [days[1]]: 0, [days[3]]: 0, [days[2]]: STRUM_MS, [days[0]]: 2 * STRUM_MS });
    expect(Object.keys(at)).not.toContain(days[4]);
    expect(ringLift(-1)).toBe(0);
    expect(ringLift(0)).toBe(0);
    expect(ringLift(90)).toBe(1);
    expect(ringLift(200)).toBeGreaterThan(0);
    expect(ringLift(200)).toBeLessThan(1);
    expect(ringLift(90 + 320)).toBe(0);
    expect(ringLift(1e9)).toBe(0);
  });

  it('speaks in Do Better’s own words', () => {
    const text = all.join('\n');
    expect(text).not.toMatch(/\bodds\b|wager|jackpot|\bbets?\b|\brake\b|high-roller|best value/i);
    expect(text.replace(/\bno streaks\b/gi, '')).not.toMatch(/streak/i);
    expect(text).not.toMatch(/\bvot(e|es|ing)\b|two-minute|2-minute|never (miss )?twice|rescued|habit-days|crowned/i);
  });
});
