import { describe, expect, it, vi } from 'vitest';

import { applyPatch, parse, type Prefs } from './prefs';

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
