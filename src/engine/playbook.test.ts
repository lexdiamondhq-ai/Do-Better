import { describe, expect, it } from 'vitest';

import { SUITS } from './cards';
import { ideaOfTheDay, inferSuit, PRINCIPLES, RECIPES, recommend, suggestRecipes, type RecommendationContext } from './playbook';

const calm: RecommendationContext = {
  today: '2026-10-08', // a Thursday
  habitCount: 3,
  habitsWithoutTwoMinute: 0,
  habitsWithoutAnchor: 0,
  habitsWithoutWhenWhere: 0,
  habitsWithoutIdentity: 0,
  neverTwiceCount: 0,
  keptRate30: 0.8,
  ceilingShare30: 0.4,
};

describe('recipes', () => {
  it('have unique keys and point at real principles', () => {
    expect(new Set(RECIPES.map((r) => r.key)).size).toBe(RECIPES.length);
    for (const r of RECIPES) expect(PRINCIPLES[r.principle]).toBeDefined();
  });

  it('cover every suit, so each part of you has habits to start from', () => {
    for (const suit of SUITS) expect(RECIPES.filter((r) => r.suit === suit).length).toBeGreaterThanOrEqual(5);
  });

  it('every principle credits a source', () => {
    for (const p of Object.values(PRINCIPLES)) expect(p.source.length).toBeGreaterThan(3);
  });
});

describe('recommend', () => {
  it('puts Never Twice first when a card slipped yesterday', () => {
    const recs = recommend({ ...calm, neverTwiceCount: 2, habitsWithoutAnchor: 1 });
    expect(recs[0].principle.key).toBe('never-miss-twice');
    expect(recs[0].reason).toBe('2 cards slipped yesterday.');
    expect(recs.map((r) => r.principle.key)).toContain('habit-stacking');
  });

  it('suggests shrinking the Floor when most days are missed', () => {
    expect(recommend({ ...calm, keptRate30: 0.3 })[0].principle.key).toBe('two-minute');
  });

  it('suggests raising the Ceiling when it is hit most days', () => {
    expect(recommend({ ...calm, ceilingShare30: 0.8 }).map((r) => r.principle.key)).toContain('goldilocks');
  });

  it('notices Mondays and new months', () => {
    expect(recommend({ ...calm, today: '2026-10-12' })[0].reason).toBe('It is Monday.');
    expect(recommend({ ...calm, today: '2026-11-01' })[0].reason).toBe('A new month just started.');
  });

  it('starts a new deck with identity and a keystone', () => {
    expect(recommend({ ...calm, habitCount: 0, keptRate30: null, ceilingShare30: null }).map((r) => r.principle.key).slice(0, 2)).toEqual(['identity', 'keystone']);
  });
});

describe('ideaOfTheDay', () => {
  it('rotates a classic idea when nothing needs fixing, the same all day', () => {
    const a = ideaOfTheDay(calm);
    expect(a.reason).toBe("Today's idea.");
    expect(ideaOfTheDay(calm).principle.key).toBe(a.principle.key);
    expect(ideaOfTheDay({ ...calm, today: '2026-10-09' }).principle.key).not.toBe(a.principle.key);
  });
});

describe('suggestRecipes', () => {
  it('matches wanted identities first and skips cards already in the deck', () => {
    const picks = suggestRecipes(['reader', 'runner'], ['Run'], 3);
    expect(picks[0].key).toBe('read');
    expect(picks.map((p) => p.key)).not.toContain('run');
    expect(picks).toHaveLength(3);
  });
});

describe('inferSuit', () => {
  it('guesses the part of you a habit builds', () => {
    expect(inferSuit('Morning run')).toBe('spades');
    expect(inferSuit('Call Mum')).toBe('hearts');
    expect(inferSuit('Read before bed')).toBe('clubs');
    expect(inferSuit('Read', 'a reader')).toBe('clubs');
    expect(inferSuit('Deep work')).toBe('diamonds');
    expect(inferSuit('Ship one thing', 'a maker')).toBe('diamonds');
    expect(inferSuit('Something new')).toBe('clubs');
    expect(inferSuit('Write a song')).toBe('diamonds');
    expect(inferSuit('Get ready for work')).toBe('diamonds');
  });

  it('agrees with the suit of every ready-made habit', () => {
    const misses = RECIPES.filter((r) => inferSuit(r.name, r.identity) !== r.suit).map((r) => r.key);
    expect(misses).toEqual([]);
  });
});

describe('commitment', () => {
  it('reminds you to call your hand on Monday', () => {
    expect(recommend({ ...calm, today: '2026-10-12', callPending: true })[0].principle.key).toBe('commitment');
  });
});
