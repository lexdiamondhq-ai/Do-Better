import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS, evaluateAchievements, newlyUnlocked, nextUp } from './achievements';
import { addDays } from './day';
import type { Level } from './kept';

function byId(states: ReturnType<typeof evaluateAchievements>['states'], id: string) {
  const s = states.find((x) => x.achievement.id === id);
  if (!s) throw new Error(`no achievement ${id}`);
  return s;
}

describe('ACHIEVEMENTS', () => {
  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('contains nothing that counts consecutive days', () => {
    for (const a of ACHIEVEMENTS) expect(`${a.title} ${a.description}`.toLowerCase()).not.toMatch(/streak|in a row|consecutive/);
    for (const a of ACHIEVEMENTS) expect(`${a.title} ${a.description}`.toLowerCase()).not.toMatch(/\bvot(e|es|ing)\b|never twice|full house|royal flush/);
  });
});

describe('evaluateAchievements', () => {
  const start = '2026-10-01';
  const read = new Map<string, Level>([
    ['2026-10-01', 'floor'],
    ['2026-10-02', 'ceiling'],
    // miss on the 3rd
    ['2026-10-04', 'floor'],
  ]);
  const walk = new Map<string, Level>([
    ['2026-10-02', 'floor'],
    ['2026-10-04', 'floor'],
  ]);
  const habits = [
    { id: 'read', identity: 'a reader', startedOn: start },
    { id: 'walk', identity: null, startedOn: start },
  ];
  const { states, metrics } = evaluateAchievements(habits, new Map([['read', read], ['walk', walk]]), '2026-10-04');

  it('adds up totals across habits', () => {
    expect(metrics).toMatchObject({ kept: 5, ceiling: 1, floorSaves: 4, topIdentity: 3, deck: 2 });
  });

  it('records the day each achievement was first earned', () => {
    expect(byId(states, 'first-card').unlockedOn).toBe('2026-10-01');
    expect(byId(states, 'ceiling-1').unlockedOn).toBe('2026-10-02');
    expect(byId(states, 'kept-7').unlockedOn).toBeNull();
  });

  it('counts a day kept after a miss as a bounce-back', () => {
    // read: missed the 3rd, kept the 4th. walk: missed the 1st and kept the 2nd, missed the 3rd and kept the 4th.
    expect(metrics.bounceBacks).toBe(3);
    expect(byId(states, 'bounce-1').unlockedOn).toBe('2026-10-02');
  });

  it('counts a whole-deck day only when every habit was kept', () => {
    expect(metrics.fullHouse).toBe(2); // the 2nd and the 4th
  });

  it('caps progress at the target', () => {
    expect(byId(states, 'first-card').progress).toBe(1);
    expect(byId(states, 'kept-7').progress).toBe(5);
  });

  it('finds a perfect month on one habit', () => {
    const month = new Map<string, Level>();
    for (let i = 0; i < 30; i++) month.set(addDays('2026-09-01', i), 'floor');
    const result = evaluateAchievements([{ id: 'x', identity: null, startedOn: '2026-09-01' }], new Map([['x', month]]), '2026-09-30');
    expect(byId(result.states, 'steady-30').unlockedOn).toBe('2026-09-30');
  });

  it('handles an empty deck', () => {
    const result = evaluateAchievements([], new Map(), '2026-10-04');
    expect(result.states.every((s) => s.unlockedOn === null)).toBe(true);
  });
});

describe('newlyUnlocked and nextUp', () => {
  it('reports only what changed, and the closest locked cards', () => {
    const habits = [{ id: 'a', identity: null, startedOn: '2026-10-01' }];
    const before = evaluateAchievements(habits, new Map([['a', new Map()]]), '2026-10-01').states;
    const after = evaluateAchievements(habits, new Map([['a', new Map<string, Level>([['2026-10-01', 'floor']])]]), '2026-10-01').states;
    expect(newlyUnlocked(before, after).map((a) => a.id).sort()).toEqual(['first-card', 'floor-1']);
    expect(nextUp(after, 1)[0].achievement.id).toBe('deck-3'); // 1 of 3 is closer than 1 of 7
  });
});
