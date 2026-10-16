import { describe, expect, it } from 'vitest';

import { SUITS } from '@/engine/cards';
import { RECIPES } from '@/engine/playbook';

import { armedWay, chosenRecipes, deckGroups, NO_PICKS, practiceRelease, PRACTICE_DISTANCE, seedPicks, togglePick } from './firstRun';

describe('the practice swipe', () => {
  it('arms exactly where letting go counts, so a full-strength stamp always means kept', () => {
    for (let dy = -120; dy <= 120; dy += 2) {
      for (const dx of [0, 10, 30, 60]) {
        const armed = armedWay(dx, dy);
        const release = practiceRelease(dx, dy, 0);
        if (armed) expect(release, `dx ${dx} dy ${dy}`).toBe(armed);
        else expect(release === 'floor' || release === 'ceiling', `dx ${dx} dy ${dy}`).toBe(false);
      }
    }
  });

  it('keeps the Floor down and the Ceiling up from the distance on', () => {
    expect(armedWay(0, PRACTICE_DISTANCE)).toBe('floor');
    expect(armedWay(0, -PRACTICE_DISTANCE)).toBe('ceiling');
    expect(armedWay(0, PRACTICE_DISTANCE - 1)).toBeNull();
    expect(armedWay(PRACTICE_DISTANCE + 10, PRACTICE_DISTANCE)).toBeNull();
  });

  it('counts a quick flick the way the card is going, never a jiggle or a flick back', () => {
    expect(practiceRelease(0, 20, 1200)).toBe('floor');
    expect(practiceRelease(0, -20, -1200)).toBe('ceiling');
    expect(practiceRelease(0, 6, 1200)).toBe('none');
    expect(practiceRelease(0, 30, -1200)).toBe('short');
  });

  it('calls an attempt that fell short short, so the screen can ask for a bit more', () => {
    expect(practiceRelease(0, 30, 100)).toBe('short');
    expect(practiceRelease(4, -30, -100)).toBe('short');
    expect(practiceRelease(0, 8, 0)).toBe('none');
    expect(practiceRelease(50, 10, 0)).toBe('sideways');
  });
});

describe('the deck step', () => {
  it('shows every card, by suit, when no identity is picked', () => {
    const { groups, more } = deckGroups([], [], false);
    expect(more).toBe(0);
    expect(groups.flatMap((g) => g.recipes).length).toBe(RECIPES.length);
    expect(groups.map((g) => g.suit)).toEqual([...SUITS]);
    expect(groups.find((g) => g.suit === 'hearts')?.recipes.length).toBeGreaterThan(0);
    for (const g of groups) expect(g.recipes.every((r) => r.suit === g.suit)).toBe(true);
  });

  it('leads with the cards for who you’re becoming, with every other card one tap away', () => {
    const { groups, more } = deckGroups(['a reader'], [], false);
    expect(groups).toHaveLength(1);
    expect(groups[0].recipes.map((r) => r.key)).toEqual(['read']);
    expect(more).toBe(RECIPES.length - 1);
    const all = deckGroups(['a reader'], [], true);
    expect(all.more).toBe(0);
    const keys = all.groups.flatMap((g) => g.recipes.map((r) => r.key));
    expect(keys[0]).toBe('read');
    expect(new Set(keys).size).toBe(RECIPES.length);
  });

  it('never hides a card that is picked', () => {
    const { groups, more } = deckGroups(['a reader'], ['read', 'walk'], false);
    expect(more).toBe(0);
    expect(groups.flatMap((g) => g.recipes.map((r) => r.key))).toContain('walk');
  });

  it('deals the picked cards in the order the deck shows them', () => {
    expect(chosenRecipes(['walk', 'read', 'gone']).map((r) => r.key)).toEqual(['read', 'walk']);
  });
});

describe('picks across going back', () => {
  it('picks up to three cards for new identities', () => {
    const picks = seedPicks(NO_PICKS, ['a reader', 'a runner']);
    expect(picks.picked.sort()).toEqual(['read', 'run']);
    expect(picks.auto.sort()).toEqual(['read', 'run']);
  });

  it('keeps every pick exactly as it was when the identities didn’t change', () => {
    let picks = seedPicks(NO_PICKS, ['a reader']);
    for (const k of ['walk', 'journal', 'water', 'save']) picks = togglePick(picks, k);
    picks = togglePick(picks, 'read');
    const back = seedPicks(picks, ['a reader']);
    expect(back).toBe(picks);
    expect(back.picked.sort()).toEqual(['journal', 'save', 'walk', 'water']);
  });

  it('keeps hand-picked cards and swaps only its own picks when the identities change', () => {
    let picks = seedPicks(NO_PICKS, ['a reader']);
    picks = togglePick(picks, 'walk');
    const changed = seedPicks(picks, ['a runner']);
    expect(changed.picked.sort()).toEqual(['run', 'walk']);
    expect(changed.auto).toEqual(['run']);
  });

  it('treats the same identities in another order as the same', () => {
    const picks = togglePick(seedPicks(NO_PICKS, ['a reader', 'a runner']), 'walk');
    expect(seedPicks(picks, ['a runner', 'a reader'])).toBe(picks);
  });
});
