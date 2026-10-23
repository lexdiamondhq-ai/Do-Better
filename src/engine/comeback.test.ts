import { describe, expect, it } from 'vitest';

import { cleanPlanWords, comebackExit, comebackKeptToday, PLAN_WHENS, planLine, planOffered, planThens, type Plan } from './comeback';

const walk = { floorLabel: 'Walk to the corner', twoMinuteLabel: 'Put on your shoes' };
const noFirst = { floorLabel: 'Walk to the corner', twoMinuteLabel: null };
const today = '2026-10-23';

describe('the turnover', () => {
  it('turns back over within 1200 ms, and crossfades in 200 ms with no turn under Reduce Motion', () => {
    const full = comebackExit({ firstMove: true, reduced: false });
    expect(full).toMatchObject({ lightMs: 320, flipMs: 380, holdMs: 250, totalMs: 950 });
    expect(full.totalMs).toBeLessThanOrEqual(1200);
    expect(comebackExit({ firstMove: false, reduced: true })).toEqual({ lightMs: 0, flipMs: 0, holdMs: 0, crossfadeMs: 200, totalMs: 200 });
  });
});

describe('Your plan', () => {
  it('offers the five reasons, each once', () => {
    expect(PLAN_WHENS.map((w) => w.chip)).toEqual(['Late night', 'No time', 'Too tired', 'Away from home', 'Forgot']);
    expect(new Set(PLAN_WHENS.map((w) => w.key)).size).toBe(PLAN_WHENS.length);
  });

  it('only ever offers keeps: the First move when the card has one, then the Floor', () => {
    expect(planThens(walk)).toEqual([
      { key: 'first', label: 'Do the first move: Put on your shoes' },
      { key: 'floor', label: 'Keep the Floor: Walk to the corner' },
    ]);
    expect(planThens(noFirst).map((t) => t.key)).toEqual(['floor']);
  });

  it('says a plan as one line, in the player’s own words when they typed them', () => {
    expect(planLine({ when: 'tired', then: 'first', made: today }, walk)).toBe('Too tired? Put on your shoes.');
    expect(planLine({ when: 'late', then: 'floor', made: today }, walk)).toBe('Late night? Walk to the corner.');
    expect(planLine({ when: 'Kids up early', then: 'first', made: today }, walk)).toBe('Kids up early? Put on your shoes.');
    // A First move plan on a card that no longer has one falls back to the Floor.
    expect(planLine({ when: 'time', then: 'first', made: today }, noFirst)).toBe('No time? Walk to the corner.');
    expect(planLine({ when: 'Raining?', then: 'floor', made: today }, { floorLabel: 'One lap.', twoMinuteLabel: null })).toBe('Raining? One lap.');
  });

  it('knows a Comeback kept today, and not one dismissed, waiting or kept another day', () => {
    const prompts = [
      { habitId: 'walk', recoveryDay: today, response: 'floor_only' },
      { habitId: 'read', recoveryDay: today, response: 'dismissed' },
      { habitId: 'call', recoveryDay: today, response: null },
      { habitId: 'cook', recoveryDay: '2026-10-22', response: 'two_minute' },
      { habitId: 'yoga', recoveryDay: today, response: 'two_minute' },
    ];
    expect(comebackKeptToday(prompts, 'walk', today)).toBe(true);
    expect(comebackKeptToday(prompts, 'yoga', today)).toBe(true);
    expect(comebackKeptToday(prompts, 'read', today)).toBe(false);
    expect(comebackKeptToday(prompts, 'call', today)).toBe(false);
    expect(comebackKeptToday(prompts, 'cook', today)).toBe(false);
    expect(comebackKeptToday(prompts, 'nope', today)).toBe(false);
  });

  it('offers a plan only after a kept Comeback, and never within 14 days of the card’s last plan', () => {
    const plan = (made: string): Plan => ({ when: 'tired', then: 'first', made });
    expect(planOffered({ keptComebackToday: false, plan: null, today })).toBe(false);
    expect(planOffered({ keptComebackToday: true, plan: null, today })).toBe(true);
    expect(planOffered({ keptComebackToday: true, plan: plan('2026-10-10'), today })).toBe(false);
    expect(planOffered({ keptComebackToday: true, plan: plan('2026-10-09'), today })).toBe(true);
    expect(planOffered({ keptComebackToday: false, plan: plan('2026-09-01'), today })).toBe(false);
  });

  it('keeps the player’s words as typed, only tidied and capped at 40 characters', () => {
    expect(cleanPlanWords('  Kids   up\tearly  ')).toBe('Kids up early');
    expect(cleanPlanWords('Late\u0000 shift\u0007\n')).toBe('Late shift');
    expect(cleanPlanWords('a'.repeat(60))).toBe('a'.repeat(40));
    expect(cleanPlanWords(`${'b'.repeat(39)} tail`)).toBe('b'.repeat(39));
    expect(Array.from(cleanPlanWords('🙂'.repeat(50)))).toHaveLength(40);
    // Never rewritten: the player's own words, whatever they are.
    expect(cleanPlanWords('Too much wine, honestly')).toBe('Too much wine, honestly');
  });

  it('never counts days in a line it writes', () => {
    const lines = [...PLAN_WHENS.map((w) => planLine({ when: w.key, then: 'first', made: today }, walk)), ...planThens(walk).map((t) => t.label)];
    for (const line of lines) expect(line).not.toMatch(/\d+\s*days?/i);
  });
});
