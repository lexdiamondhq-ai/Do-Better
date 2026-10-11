import { describe, expect, it } from 'vitest';

import { ideaOfTheDay, playsLine, PRINCIPLES, RECIPES, recommend, suggestRecipes, type RecommendationContext } from './playbook';

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

  it('nothing in the Playbook names a book, an author, or their labels', () => {
    const borrowed = /atomic habits|tiny habits|power of habit|james clear|two-minute|2-minute|never (miss )?twice|\bvot(e|es|ing)\b|habit stack|keystone|deep work|temptation bundl|goldilocks|four laws|cue, routine/i;
    for (const p of Object.values(PRINCIPLES)) expect(`${p.title} ${p.idea} ${p.tryThis}`).not.toMatch(borrowed);
    for (const r of RECIPES) expect(`${r.name} ${r.identity} ${r.floor} ${r.ceiling} ${r.twoMinute} ${r.anchor} ${r.why}`).not.toMatch(borrowed);
    expect(Object.values(PRINCIPLES).every((p) => !('source' in p))).toBe(true);
  });
});

describe('playsLine', () => {
  it('reads as a sentence that starts with Plays', () => {
    expect(playsLine('after lunch')).toBe('Plays after lunch');
    expect(playsLine(' After I get into bed ')).toBe('Plays after I get into bed');
    expect(playsLine('I wake up')).toBe('Plays I wake up');
  });
});

describe('recommend', () => {
  it('puts the comeback first when a card slipped yesterday', () => {
    const recs = recommend({ ...calm, neverTwiceCount: 2, habitsWithoutAnchor: 1 });
    expect(recs[0].principle.key).toBe('comeback');
    expect(recs[0].reason).toBe('2 cards slipped yesterday.');
    expect(recs.map((r) => r.principle.key)).toContain('when-it-plays');
  });

  it('suggests shrinking the Floor when most days are missed', () => {
    expect(recommend({ ...calm, keptRate30: 0.3 })[0].principle.key).toBe('first-move');
  });

  it('suggests raising the Ceiling when it is hit most days', () => {
    expect(recommend({ ...calm, ceilingShare30: 0.8 }).map((r) => r.principle.key)).toContain('stretch');
  });

  it('notices Mondays and new months', () => {
    expect(recommend({ ...calm, today: '2026-10-12' })[0].reason).toBe('It is Monday.');
    expect(recommend({ ...calm, today: '2026-11-01' })[0].reason).toBe('A new month just started.');
  });

  it('starts a new deck with identity and a lead card', () => {
    expect(recommend({ ...calm, habitCount: 0, keptRate30: null, ceilingShare30: null }).map((r) => r.principle.key).slice(0, 2)).toEqual(['identity', 'lead-card']);
  });
});

describe('ideaOfTheDay', () => {
  it('rotates a favourite idea when nothing needs fixing, the same all day', () => {
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
