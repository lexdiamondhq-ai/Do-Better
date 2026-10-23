import { describe, expect, it } from 'vitest';

import { SUITS } from './cards';
import { clockIn, exampleRecipe, IDEA_GROUPS, ideaOfTheDay, inferSuit, keptLeast, ownWhy, partOfDay, playsLine, PRINCIPLES, recipePlaces, RECIPES, recommend, suggestRecipes, type HabitFacts, type PrincipleKey, type RecommendationContext } from './playbook';

const calm: RecommendationContext = {
  today: '2026-10-08', // a Thursday
  habitCount: 3,
  habitsWithoutTwoMinute: 0,
  habitsWithoutAnchor: 0,
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

  it('nothing in the Playbook names a book, an author, or their labels', () => {
    const borrowed = /atomic habits|tiny habits|power of habit|james clear|two-minute|2-minute|never (miss )?twice|\bvot(e|es|ing)\b|habit stack|keystone|deep work|temptation bundl|goldilocks|four laws|cue, routine/i;
    for (const p of Object.values(PRINCIPLES)) expect(`${p.title} ${p.idea} ${p.tryThis}`).not.toMatch(borrowed);
    for (const r of RECIPES) expect(`${r.name} ${r.identity} ${r.floor} ${r.ceiling} ${r.twoMinute} ${r.anchor} ${r.why}`).not.toMatch(borrowed);
    expect(Object.values(PRINCIPLES).every((p) => !('source' in p))).toBe(true);
  });

  it('use curly quotes and apostrophes on screen, like the rest of the app', () => {
    for (const p of Object.values(PRINCIPLES)) expect(`${p.title} ${p.idea} ${p.tryThis}`, p.key).not.toMatch(/['"]/);
    for (const r of RECIPES) expect(`${r.name} ${r.identity} ${r.floor} ${r.ceiling} ${r.twoMinute} ${r.anchor} ${r.why} ${r.prompt}`, r.key).not.toMatch(/['"]/);
  });

  it('still know a card made with the earlier straight-apostrophe line as the app’s own', () => {
    expect(ownWhy({ why: "A clear room makes tomorrow's good habits easier to start.", recipeKey: 'tidy' })).toBeNull();
    expect(ownWhy({ why: 'A clear room makes tomorrow’s good habits easier to start.', recipeKey: 'tidy' })).toBeNull();
  });

  it('hold every day of the week: no anchor or Floor waits for a payday, a commute, the kids, a desk or work', () => {
    const weekdayOnly = /paid|commute|kids|desk|\bwork\b|laptop|office|school/i;
    for (const r of RECIPES) {
      expect(r.anchor, r.key).not.toMatch(weekdayOnly);
      expect(r.floor, r.key).not.toMatch(weekdayOnly);
    }
  });

  it('offer a first-person why as a placeholder, never the app talking', () => {
    for (const r of RECIPES) {
      expect(r.prompt, r.key).toMatch(/^(I|I’m|My|A clear|Playing|Writing|The things)\b/);
      expect(r.prompt).not.toBe(r.why);
    }
  });
});

describe('ownWhy', () => {
  const read = RECIPES.find((r) => r.key === 'read')!;
  it('treats the ready-made line or its placeholder as empty, so the player is asked for their own', () => {
    expect(ownWhy({ why: read.why, recipeKey: 'read' })).toBeNull();
    expect(ownWhy({ why: ` ${read.prompt} `, recipeKey: 'read' })).toBeNull();
    expect(ownWhy({ why: 'A full bottle on the desk is a reminder you cannot miss.', recipeKey: 'water' })).toBeNull();
    expect(ownWhy({ why: '', recipeKey: 'read' })).toBeNull();
  });

  it('keeps anything the player wrote', () => {
    expect(ownWhy({ why: 'For my daughter.', recipeKey: 'read' })).toBe('For my daughter.');
    expect(ownWhy({ why: read.why, recipeKey: null })).toBe(read.why);
  });
});

describe('partOfDay', () => {
  it('knows when every ready-made card plays, from its anchor alone as well as its key', () => {
    for (const r of RECIPES) {
      expect(partOfDay({ anchor: r.anchor, recipeKey: r.key }), r.key).toBe(r.part);
      expect(partOfDay({ anchor: r.anchor, recipeKey: null }), `${r.key}: ${r.anchor}`).toBe(r.part);
    }
  });

  it('reads a clock time first, then the reminder the player set over everything', () => {
    expect(partOfDay({ anchor: 'at 7 am, kitchen table', recipeKey: 'read' })).toBe('morning');
    expect(partOfDay({ anchor: 'after lunch', whenWhere: '9:30pm', recipeKey: null })).toBe('evening');
    expect(partOfDay({ anchor: 'after getting into bed', recipeKey: 'read' }, '06:45')).toBe('morning');
  });

  it('follows an anchor the player rewrote, not the recipe it came from', () => {
    expect(partOfDay({ anchor: 'before breakfast', recipeKey: 'read' })).toBe('morning');
    expect(partOfDay({ anchor: 'after finishing work', recipeKey: null })).toBe('evening');
    expect(partOfDay({ anchor: 'on getting to work', recipeKey: null })).toBe('morning');
    // An old ready-made anchor still counts as the recipe's own.
    expect(partOfDay({ anchor: 'after dropping the kids off', recipeKey: 'run' })).toBe('morning');
  });

  it('says any when nothing tells', () => {
    expect(partOfDay({ anchor: null, recipeKey: null })).toBe('any');
    expect(partOfDay({ anchor: 'whenever I can', recipeKey: null })).toBe('any');
  });
});

describe('clockIn', () => {
  it('reads times the way people write them', () => {
    expect(clockIn('7 am')).toBe(7 * 60);
    expect(clockIn('at 7:30pm, on the sofa')).toBe(19 * 60 + 30);
    expect(clockIn('12 am')).toBe(0);
    expect(clockIn('12pm')).toBe(12 * 60);
    expect(clockIn('19:00')).toBe(19 * 60);
    expect(clockIn('noon')).toBe(12 * 60);
    expect(clockIn('after 2 pages')).toBeNull();
    expect(clockIn('5 push-ups')).toBeNull();
  });
});

describe('playsLine', () => {
  it('reads as a sentence that starts with Plays', () => {
    expect(playsLine('after lunch')).toBe('Plays after lunch');
    expect(playsLine(' After I get into bed ')).toBe('Plays after I get into bed');
    expect(playsLine('I wake up')).toBe('Plays I wake up');
    expect(playsLine('7 am, kitchen table')).toBe('Plays at 7 am, kitchen table');
  });
});

const facts = (over: Partial<HabitFacts> & { id: string; name: string }): HabitFacts => ({
  kept30: 24,
  ceilings30: 8,
  days30: 29,
  hasFirstMove: true,
  hasAnchor: true,
  hasIdentity: true,
  comeback: false,
  mastered: false,
  ...over,
});

describe('recommend', () => {
  it('puts the comeback first, naming the card, and never counts missed days', () => {
    const habits = [facts({ id: 'r', name: 'Read' }), facts({ id: 'w', name: 'Walk', comeback: true })];
    const recs = recommend({ ...calm, neverTwiceCount: 1, habits });
    expect(recs[0]).toMatchObject({ reason: 'Walk is ready for a comeback', cta: 'Go to today’s cards', href: '/' });
    expect(recommend({ ...calm, neverTwiceCount: 2 })[0].reason).toBe('Comebacks are waiting');
  });

  it('welcomes a player back after days away with one card, before anything else', () => {
    const recs = recommend({ ...calm, away: true, neverTwiceCount: 2 });
    expect(recs[0]).toMatchObject({ reason: 'Welcome back', href: '/' });
    expect(recs[0].principle.tryThis).toBe('Start with one card. The rest can wait.');
  });

  it('shrinks the Floor of the card kept least, and opens its Floor', () => {
    const habits = [facts({ id: 'r', name: 'Read', kept30: 12, days30: 30 }), facts({ id: 'w', name: 'Walk', kept30: 9, days30: 30 }), facts({ id: 'f', name: 'Focus', kept30: 2, days30: 5 })];
    const rec = recommend({ ...calm, keptRate30: 0.4, habits })[0];
    expect(rec).toMatchObject({ reason: 'Walk was kept 9 of 30 days', cta: 'Try a smaller Floor', habitId: 'w', field: 'floorLabel' });
    expect(rec.principle.key).toBe('first-move');
  });

  it('still suggests a smaller Floor across the deck when it can’t name a card', () => {
    expect(recommend({ ...calm, keptRate30: 0.3 })[0].principle.key).toBe('first-move');
  });

  it('points every missing field at the first card missing it', () => {
    const habits = [facts({ id: 'r', name: 'Read' }), facts({ id: 'w', name: 'Walk', hasFirstMove: false, hasIdentity: false, hasAnchor: false })];
    const recs = recommend({ ...calm, habitsWithoutTwoMinute: 1, habitsWithoutIdentity: 1, habitsWithoutAnchor: 1, habits });
    expect(recs.find((r) => r.principle.key === 'first-move')).toMatchObject({ reason: 'Walk has no first move yet', habitId: 'w', field: 'twoMinuteLabel', cta: 'Add a first move to Walk' });
    expect(recs.find((r) => r.principle.key === 'identity')).toMatchObject({ habitId: 'w', field: 'identity' });
    expect(recs.find((r) => r.principle.key === 'when-it-plays')).toMatchObject({ habitId: 'w', field: 'anchor', cta: 'Say when Walk plays' });
  });

  it('every recommendation with a call to action says where it goes', () => {
    const habits = [facts({ id: 'w', name: 'Walk', hasFirstMove: false, comeback: true, mastered: true })];
    const recs = recommend({ ...calm, today: '2026-10-12', habitCount: 1, away: true, neverTwiceCount: 1, habitsWithoutTwoMinute: 1, callPending: true, habits });
    expect(recs.length).toBeGreaterThan(4);
    for (const r of recs) if (r.cta) expect(r.href ?? (r.habitId && r.field), r.principle.key).toBeTruthy();
    for (const r of recs) expect(r.reason, r.principle.key).not.toMatch(/\.$|missed|\bmiss/);
  });

  it('a card that has become part of you gets a higher Ceiling, never a higher Floor', () => {
    const habits = [facts({ id: 'w', name: 'Walk', kept30: 28, ceilings30: 17, mastered: true })];
    const rec = recommend({ ...calm, habits }).find((r) => r.principle.key === 'stretch');
    expect(rec).toMatchObject({ reason: 'Walk is part of you now', cta: 'Raise the Ceiling', field: 'ceilingLabel', habitId: 'w' });
  });

  it('works the Ceiling out card by card', () => {
    const habits = [facts({ id: 'r', name: 'Read', kept30: 25, ceilings30: 20 }), facts({ id: 'w', name: 'Walk', kept30: 25, ceilings30: 1 })];
    const recs = recommend({ ...calm, habits });
    expect(recs.find((r) => r.principle.key === 'stretch')).toMatchObject({ habitId: 'r', reason: 'Read’s Ceiling is reached most days' });
    const deckWide = recommend({ ...calm, ceilingShare30: 0.8 });
    expect(deckWide.map((r) => r.principle.key)).toContain('stretch');
  });

  it('suggests a clean page only to a small deck that is going well', () => {
    const monday = '2026-10-12';
    expect(recommend({ ...calm, today: monday, habitCount: 2 })[0]).toMatchObject({ reason: 'It’s Monday', href: '/habit/edit' });
    expect(recommend({ ...calm, today: '2026-11-01', habitCount: 1, keptRate30: null })[0].reason).toBe('A new month just started');
    expect(recommend({ ...calm, today: monday, habitCount: 3 }).map((r) => r.principle.key)).not.toContain('clean-page');
    expect(recommend({ ...calm, today: monday, habitCount: 2, keptRate30: 0.6 }).map((r) => r.principle.key)).not.toContain('clean-page');
  });

  it('suggests resting a card only above four cards and when the deck isn’t being kept', () => {
    expect(recommend({ ...calm, habitCount: 5, keptRate30: 0.6 }).find((r) => r.principle.key === 'focus')).toMatchObject({ reason: '5 cards in your deck', cta: 'Put your best cards first', href: '/you?sheet=arrange' });
    expect(recommend({ ...calm, habitCount: 5, keptRate30: 0.75 }).map((r) => r.principle.key)).not.toContain('focus');
    expect(recommend({ ...calm, habitCount: 4, keptRate30: 0.6 }).map((r) => r.principle.key)).not.toContain('focus');
  });

  it('names the card to rest and opens its Archive button, never a screen that can only reorder', () => {
    const habits = [
      facts({ id: 'r', name: 'Read', kept30: 20, days30: 30 }),
      facts({ id: 'w', name: 'Walk', kept30: 16, days30: 30 }),
      facts({ id: 'm', name: 'Meditate', kept30: 18, days30: 30 }),
      facts({ id: 'j', name: 'Journal', kept30: 16, days30: 30 }),
      facts({ id: 'f', name: 'Focus', kept30: 1, days30: 3 }),
    ];
    const rec = recommend({ ...calm, habitCount: 5, keptRate30: 0.6, habits }).find((r) => r.principle.key === 'focus');
    expect(rec).toMatchObject({ reason: '5 cards in your deck', cta: 'Archive Journal for now', habitId: 'j', field: 'archive' });
    expect(rec?.href).toBeUndefined();
    expect(rec?.text).toBe('Journal was kept 16 of 30 days. Archive it for now: its kept days still count in your Court, and it can come back any time.');
  });

  it('never suggests resting a card on the morning its Comeback is offered', () => {
    const habits = [facts({ id: 'r', name: 'Read', kept30: 20, days30: 30 }), facts({ id: 'w', name: 'Walk', kept30: 12, days30: 30, comeback: true }), facts({ id: 'j', name: 'Journal', kept30: 16, days30: 30 })];
    const ctx = { ...calm, habitCount: 5, keptRate30: 0.6, neverTwiceCount: 1, habits };
    expect(recommend(ctx).find((r) => r.principle.key === 'focus')).toMatchObject({ habitId: 'j', field: 'archive' });
    const onlyComebacks = habits.map((h) => ({ ...h, comeback: true }));
    expect(recommend({ ...ctx, habits: onlyComebacks }).find((r) => r.principle.key === 'focus')).toMatchObject({ href: '/you?sheet=arrange', cta: 'Put your best cards first' });
  });

  it('never asks to rest a card the player just brought back', () => {
    const habits = [facts({ id: 'r', name: 'Read', kept30: 20, days30: 30 }), facts({ id: 'w', name: 'Walk', kept30: 12, days30: 30, justBack: true }), facts({ id: 'j', name: 'Journal', kept30: 16, days30: 30 })];
    const rec = recommend({ ...calm, habitCount: 5, keptRate30: 0.6, habits }).find((r) => r.principle.key === 'focus');
    expect(rec).toMatchObject({ habitId: 'j', cta: 'Archive Journal for now' });
  });

  it('asks for a plan for a card that came back twice this month and has none, opening the plan sheet', () => {
    const habits = [facts({ id: 'r', name: 'Read', comebacks30: 1, hasPlan: false }), facts({ id: 'w', name: 'Walk', comebacks30: 2, hasPlan: false })];
    const rec = recommend({ ...calm, habits }).find((r) => r.principle.key === 'obstacle');
    expect(rec).toMatchObject({
      reason: 'Walk’s next Comeback',
      text: 'Walk came back twice this month. A plan for next time makes the next Comeback easier.',
      cta: 'Make a plan for Walk',
      habitId: 'w',
      href: '/plan?habit=w',
    });
    expect(rec?.principle.title).toBe('Plan for the thing that stops you');
    expect(rec?.field).toBeUndefined();
    expect(recommend({ ...calm, habits: [facts({ id: 'w', name: 'Walk', comebacks30: 3, hasPlan: false })] }).find((r) => r.principle.key === 'obstacle')?.text).toMatch(/^Walk came back 3 times this month\./);
  });

  it('never asks for a plan a card already has, one Comeback, or when it can’t tell', () => {
    const none = (over: Partial<HabitFacts>) => recommend({ ...calm, habits: [facts({ id: 'w', name: 'Walk', ...over })] }).some((r) => r.principle.key === 'obstacle');
    expect(none({ comebacks30: 4, hasPlan: true })).toBe(false);
    expect(none({ comebacks30: 1, hasPlan: false })).toBe(false);
    expect(none({ comebacks30: 2 })).toBe(false);
    expect(none({})).toBe(false);
  });

  it('starts a new deck with identity and a lead card', () => {
    expect(recommend({ ...calm, habitCount: 0, keptRate30: null, ceilingShare30: null }).map((r) => r.principle.key).slice(0, 2)).toEqual(['identity', 'lead-card']);
  });
});

describe('ideaOfTheDay', () => {
  it('rotates a favourite idea when nothing needs fixing, the same all day', () => {
    const a = ideaOfTheDay(calm);
    expect(a.reason).toBe('Today’s idea');
    expect(ideaOfTheDay(calm).principle.key).toBe(a.principle.key);
    expect(ideaOfTheDay({ ...calm, today: '2026-10-09' }).principle.key).not.toBe(a.principle.key);
  });

  it('never suggests a focus card to a deck with Focus block, or a lights-out card to a deck with one', () => {
    const days = Array.from({ length: 22 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const shown = (habits: HabitFacts[]) => days.map((today) => ideaOfTheDay({ ...calm, today, habits }).principle.key);
    // Without those cards, both ideas come round.
    const plain = shown([facts({ id: 'r', name: 'Read' })]);
    expect(plain).toContain('focus-block');
    expect(plain).toContain('sleep');
    const focus = shown([facts({ id: 'f', name: 'Focus block', recipeKey: 'deep-work' }), facts({ id: 'r', name: 'Read' })]);
    expect(focus).not.toContain('focus-block');
    expect(focus).toContain('sleep');
    // Known by name too, for a card made by hand.
    expect(shown([facts({ id: 'f', name: 'Morning focus' })])).not.toContain('focus-block');
    expect(shown([facts({ id: 'l', name: 'Lights out', recipeKey: 'lights-out' })])).not.toContain('sleep');
    expect(shown([facts({ id: 'l', name: 'Bedtime by 11' })])).not.toContain('sleep');
    // Still one idea a day, and still the same idea all day.
    expect(new Set(focus).size).toBeGreaterThan(5);
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

  it('goes by the word that comes first in the name', () => {
    expect(inferSuit('Stretch before bed and breathe slowly')).toBe('spades');
    expect(inferSuit('Walk and listen to a podcast')).toBe('spades');
    expect(inferSuit('Breathe, then stretch')).toBe('clubs');
  });

  it('agrees with the suit of every ready-made habit', () => {
    const misses = RECIPES.filter((r) => inferSuit(r.name, r.identity) !== r.suit).map((r) => r.key);
    expect(misses).toEqual([]);
  });
});

describe('commitment', () => {
  it('reminds you to call your hand while calls are open', () => {
    expect(recommend({ ...calm, today: '2026-10-12', callPending: true })[0]).toMatchObject({ reason: 'Calls are open', href: '/call', cta: 'Call your hand' });
    expect(recommend({ ...calm, callPending: true, callClosesTonight: true })[0].reason).toBe('Calls close at midnight');
  });
});

describe('keptLeast', () => {
  it('picks the lowest kept rate, the card lower in the deck on a tie, and skips cards too new to say', () => {
    const habits = [facts({ id: 'a', name: 'A', kept30: 10, days30: 20 }), facts({ id: 'b', name: 'B', kept30: 15, days30: 30 }), facts({ id: 'c', name: 'C', kept30: 0, days30: 4 })];
    expect(keptLeast(habits)?.id).toBe('b');
    expect(keptLeast([facts({ id: 'c', name: 'C', kept30: 0, days30: 4 })])).toBeNull();
    expect(keptLeast([])).toBeNull();
  });
});

describe('IDEA_GROUPS', () => {
  it('puts every idea in exactly one group', () => {
    const grouped: PrincipleKey[] = IDEA_GROUPS.flatMap((g) => [...g.principles]);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.keys(PRINCIPLES).sort());
  });

  it('keeps each group short enough to read at a glance', () => {
    for (const g of IDEA_GROUPS) expect(g.principles.length, g.key).toBeLessThanOrEqual(6);
  });
});

describe('exampleRecipe', () => {
  it('uses the card’s own ready-made card for its examples', () => {
    expect(exampleRecipe('walk', 'clubs').identity).toBe('someone who moves every day');
    expect(exampleRecipe('reach-out', 'spades').twoMinute).toBe('Open your last chat');
  });

  it('falls back to a ready-made card of the same suit, so a walking card never suggests “a reader”', () => {
    expect(exampleRecipe(null, 'spades').identity).toBe('someone who moves every day');
    expect(exampleRecipe('gone-recipe', 'hearts').identity).toBe('a good friend');
    expect(exampleRecipe(null, 'diamonds').identity).toBe('a writer');
    expect(exampleRecipe(undefined, 'clubs').identity).toBe('a reader');
    for (const suit of SUITS) expect(exampleRecipe(null, suit).suit).toBe(suit);
  });
});

describe('recipePlaces', () => {
  const card = (id: string, recipeKey: string | null, archivedAt: string | null = null) => ({ id, recipeKey, archivedAt });

  it('knows a ready-made card that is only archived, so the Playbook brings it back instead of making a second', () => {
    const places = recipePlaces([card('w1', 'walk', '2026-09-01T00:00:00.000Z'), card('r1', 'read')]);
    expect(places.get('walk')).toEqual({ kind: 'out', habitId: 'w1' });
    expect(places.get('read')).toEqual({ kind: 'in', habitId: 'r1' });
    expect(places.has('run')).toBe(false);
  });

  it('prefers the copy in the deck, whatever the order', () => {
    expect(recipePlaces([card('w2', 'walk'), card('w1', 'walk', '2026-09-01T00:00:00.000Z')]).get('walk')).toEqual({ kind: 'in', habitId: 'w2' });
    expect(recipePlaces([card('w1', 'walk', '2026-09-01T00:00:00.000Z'), card('w2', 'walk')]).get('walk')).toEqual({ kind: 'in', habitId: 'w2' });
  });

  it('points at the archived copy that left last, and ignores cards made by hand', () => {
    const places = recipePlaces([card('w1', 'walk', '2026-08-01T00:00:00.000Z'), card('w2', 'walk', '2026-10-01T00:00:00.000Z'), card('w3', 'walk', '2026-09-01T00:00:00.000Z'), card('x', null, '2026-10-02T00:00:00.000Z')]);
    expect(places.get('walk')).toEqual({ kind: 'out', habitId: 'w2' });
    expect(places.size).toBe(1);
  });
});
