import { describe, expect, it, vi } from 'vitest';

import { applyPatch, deckNotesForgotten, demoNotesForgotten, gripNoted, parse, planCleared, planSet, type Prefs } from './prefs';

// The phone's storage isn't needed: these rules are about what gets saved, not how.
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));

const saved = parse(
  JSON.stringify({
    looks: { alex: { back: 'classic' } },
    showdownSeen: { alex: '2026-10-05' },
    music: false,
    haptics: false,
    reminders: { asked: true, on: true, lastCall: '21:15', morning: false, perHabit: { read: '07:00' } },
    seen: { alex: { coach: true } },
  }),
);

describe('prefs', () => {
  it('read back what was saved, dropping anything malformed', () => {
    expect(saved.music).toBe(false);
    expect(saved.reminders).toEqual({ asked: true, on: true, lastCall: '21:15', morning: false, perHabit: { read: '07:00' } });
    expect(parse(JSON.stringify({ reminders: { lastCall: '25:00', perHabit: { read: 'soon' } } })).reminders).toMatchObject({ lastCall: '20:30', perHabit: {} });
  });

  it('apply a change made before the saved prefs arrived on top of them, keeping everything else', () => {
    // A coach mark seen and haptics turned on while the phone was still reading storage.
    const early = [(p: Prefs) => ({ seen: { ...p.seen, alex: { ...p.seen.alex, swipe: true as const } } }), { haptics: true }];
    const next = early.reduce(applyPatch, saved);
    expect(next.seen.alex).toEqual({ coach: true, swipe: true });
    expect(next.haptics).toBe(true);
    expect(next.looks).toEqual(saved.looks);
    expect(next.showdownSeen).toEqual({ alex: '2026-10-05' });
    expect(next.reminders).toEqual(saved.reminders);
  });

  it('never move the Showdown watched back to an earlier week', () => {
    expect(applyPatch(saved, { showdownSeen: { alex: '2026-09-28' } }).showdownSeen.alex).toBe('2026-10-05');
    expect(applyPatch(saved, { showdownSeen: { alex: '2026-10-12' } }).showdownSeen.alex).toBe('2026-10-12');
    expect(applyPatch(saved, { showdownSeen: {} }).showdownSeen).toEqual({ alex: '2026-10-05' });
  });
});

describe('prefs from before thumb marks and plans', () => {
  // Every field a phone saved before this release, each with a real value.
  const old = {
    looks: { alex: { back: 'velvet', table: 'midnight' } },
    showdownSeen: { alex: '2026-10-12', 'demo-3': '2026-10-05' },
    music: false,
    sounds: false,
    haptics: true,
    reminders: { asked: true, on: true, lastCall: '21:15', morning: false, perHabit: { read: '07:00' } },
    seen: { alex: { 'coach:first-swipe': true }, 'demo-3': { 'save-deck': true } },
    reviewAskedAt: { alex: '2026-10-01T09:00:00.000Z' },
  };

  it('load unchanged, with no thumb marks and no plans', () => {
    expect(parse(JSON.stringify(old))).toEqual({ ...old, grips: {}, plans: {} });
  });
});

describe('thumb marks and plans', () => {
  const plan = { when: 'tired', then: 'first', made: '2026-10-20' } as const;

  it('read back the good ones and drop the rest', () => {
    const read = parse(
      JSON.stringify({
        grips: {
          alex: {
            read: { x: 0.3, y: 0.7, n: 12 },
            outside: { x: 1.2, y: 0.5, n: 3 },
            negative: { x: 0.5, y: -0.1, n: 3 },
            none: { x: 0.5, y: 0.5, n: 0 },
            many: { x: 0.5, y: 0.5, n: 51 },
            half: { x: 0.5, y: 0.5, n: 2.5 },
            words: { x: '0.5', y: 0.5, n: 2 },
          },
          broken: 'nope',
        },
        plans: {
          alex: {
            walk: plan,
            own: { when: 'Kids up early', then: 'floor', made: '2026-10-01' },
            unknown: { when: 'tired', then: 'skip', made: '2026-10-20' },
            badDay: { when: 'tired', then: 'first', made: '2026-02-30' },
            notDay: { when: 'tired', then: 'first', made: 'yesterday' },
            long: { when: 'x'.repeat(41), then: 'floor', made: '2026-10-20' },
            blank: { when: '  ', then: 'floor', made: '2026-10-20' },
          },
        },
      }),
    );
    expect(read.grips).toEqual({ alex: { read: { x: 0.3, y: 0.7, n: 12 } } });
    expect(read.plans).toEqual({ alex: { walk: plan, own: { when: 'Kids up early', then: 'floor', made: '2026-10-01' } } });
  });

  it('fold each swipe into the card’s thumb mark, for that player only', () => {
    let p = applyPatch(saved, gripNoted(saved, 'alex', 'read', { x: 0.2, y: 0.6 }));
    p = applyPatch(p, gripNoted(p, 'alex', 'read', { x: 0.4, y: 0.8 }));
    expect(p.grips.alex.read.n).toBe(2);
    expect(p.grips.alex.read.x).toBeCloseTo(0.3);
    expect(p.grips.sam).toBeUndefined();
    expect(gripNoted(p, 'alex', 'read', { x: Number.NaN, y: 0.5 })).toEqual({});
  });

  it('keep one plan per card, in the player’s own words, tidied', () => {
    let p = applyPatch(saved, planSet(saved, 'alex', 'walk', plan));
    p = applyPatch(p, planSet(p, 'alex', 'walk', { when: '  Kids   up early ', then: 'floor', made: '2026-10-23' }));
    expect(p.plans.alex).toEqual({ walk: { when: 'Kids up early', then: 'floor', made: '2026-10-23' } });
    expect(parse(JSON.stringify(p)).plans).toEqual(p.plans);
    // A plan that wouldn't load again is never saved, and leaves the one before in place.
    expect(planSet(p, 'alex', 'walk', { when: ' \u0007 ', then: 'floor', made: '2026-10-23' })).toEqual({});
    expect(planSet(p, 'alex', 'walk', { when: 'tired', then: 'floor', made: '2026-02-30' })).toEqual({});
    p = applyPatch(p, planCleared(p, 'alex', 'walk'));
    expect(p.plans.alex).toEqual({});
  });

  it('forget one player’s thumb marks, plans and moments seen (as the Rules sheet says), and nobody else’s', () => {
    const notes = {
      ...saved,
      grips: { alex: { read: { x: 0.3, y: 0.7, n: 4 } }, sam: { walk: { x: 0.6, y: 0.6, n: 1 } } },
      plans: { alex: { walk: plan }, sam: { walk: plan } },
      seen: { alex: { coach: true as const, 'hold-hint': true as const }, sam: { coach: true as const } },
    };
    const after = applyPatch(notes, deckNotesForgotten(notes, 'alex'));
    expect(after.grips).toEqual({ sam: notes.grips.sam });
    expect(after.plans).toEqual({ sam: notes.plans.sam });
    // The deck starts again from the first deal, so its one-time hints show again.
    expect(after.seen).toEqual({ sam: { coach: true } });
    expect(after.looks).toEqual(notes.looks);
    expect(after.showdownSeen).toEqual(notes.showdownSeen);
    expect(after.reminders).toEqual(notes.reminders);
    // A player with nothing noted leaves everyone else's notes as they were.
    const none = applyPatch(notes, deckNotesForgotten(notes, 'nobody'));
    expect(none.grips).toEqual(notes.grips);
    expect(none.plans).toEqual(notes.plans);
  });

  it('forget everything the demo deck noted once the demo ends, so the next demo starts clean, and keep every player’s own', () => {
    const notes = {
      ...saved,
      grips: { 'demo-0': { 'demo-read': { x: 0.3, y: 0.7, n: 4 } }, 'demo-7': { 'demo-walk': { x: 0.5, y: 0.5, n: 1 } }, alex: { read: { x: 0.6, y: 0.6, n: 2 } } },
      plans: { 'demo-0': { 'demo-walk': plan }, alex: { walk: plan }, 'demolition-crew': { walk: plan } },
      seen: { 'demo-0': { 'joker-rule': true as const }, alex: { coach: true as const } },
      showdownSeen: { alex: '2026-10-12', 'demo-3': '2026-10-19' },
    };
    const after = applyPatch(notes, demoNotesForgotten(notes));
    expect(after.grips).toEqual({ alex: notes.grips.alex });
    expect(after.plans).toEqual({ alex: notes.plans.alex, 'demolition-crew': notes.plans['demolition-crew'] });
    // Its moments seen and its Showdown watched go too, so a demo played again shows the Showdown and every hint.
    expect(after.seen).toEqual({ alex: { coach: true } });
    expect(after.showdownSeen).toEqual({ alex: '2026-10-12' });
    expect(after.reminders).toEqual(notes.reminders);
    // A plain change still never moves a watched Showdown back or forgets one.
    expect(applyPatch(after, { showdownSeen: {} }).showdownSeen).toEqual({ alex: '2026-10-12' });
    expect(parse(JSON.stringify(after)).plans).toEqual(after.plans);
    // With no demo notes there is nothing to change.
    expect(demoNotesForgotten(after)).toEqual({});
  });
});
