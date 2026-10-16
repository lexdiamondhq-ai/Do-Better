import { describe, expect, it, vi } from 'vitest';

// Only the rules are tested here: the hook's providers and the store sheet stay out of it.
vi.mock('expo-store-review', () => ({ isAvailableAsync: async () => true, hasAction: async () => true, requestReview: async () => {} }));
vi.mock('./auth', () => ({ useAuth: () => ({}) }));
vi.mock('./data', () => ({ useData: () => ({}) }));
vi.mock('./deck', () => ({ useDeck: () => null }));
vi.mock('./prefs', () => ({ usePrefs: () => ({}) }));

const { REVIEW_GAP_DAYS, shouldAskForReview } = await import('./review');
type Moment = Parameters<typeof shouldAskForReview>[0];

// Wednesday 14 October 2026, mid-afternoon on the phone's clock.
const WEDNESDAY = new Date(2026, 9, 14, 15, 0);
const base: Moment = {
  trigger: 'showdown',
  demo: false,
  playedWeeks: 3,
  newestFace: null,
  showdown: { madeCall: true, newBack: false },
  comeback: false,
  today: '2026-10-14',
  now: WEDNESDAY,
  lastAsked: null,
};
const ask = (patch: Partial<Moment>) => shouldAskForReview({ ...base, ...patch });

describe('asking for a review', () => {
  it('asks after a made call, a new card back, or a Queen or better', () => {
    expect(ask({})).toBe(true);
    expect(ask({ showdown: { madeCall: false, newBack: true } })).toBe(true);
    expect(ask({ trigger: 'call' })).toBe(true);
    expect(ask({ trigger: 'back', showdown: { madeCall: false, newBack: true } })).toBe(true);
    expect(ask({ trigger: 'face', newestFace: { face: 'queen', day: '2026-10-14' } })).toBe(true);
    expect(ask({ trigger: 'face', newestFace: { face: 'king', day: '2026-10-13' } })).toBe(true);
  });

  it('never asks at an ordinary moment', () => {
    expect(ask({ showdown: { madeCall: false, newBack: false } })).toBe(false);
    expect(ask({ showdown: null })).toBe(false);
    expect(ask({ trigger: 'call', showdown: { madeCall: false, newBack: true } })).toBe(false);
    expect(ask({ trigger: 'back', showdown: { madeCall: true, newBack: false } })).toBe(false);
    // A Jack is the first face card, too early to ask; an old Queen isn't this moment.
    expect(ask({ trigger: 'face', newestFace: { face: 'jack', day: '2026-10-14' } })).toBe(false);
    expect(ask({ trigger: 'face', newestFace: { face: 'queen', day: '2026-10-01' } })).toBe(false);
    expect(ask({ trigger: 'face', newestFace: null })).toBe(false);
  });

  it('never asks in the demo or before two weeks have been played', () => {
    expect(ask({ demo: true })).toBe(false);
    expect(ask({ playedWeeks: 1 })).toBe(false);
    expect(ask({ playedWeeks: 2 })).toBe(true);
  });

  it('never asks on a Comeback day or on Sunday night', () => {
    expect(ask({ comeback: true })).toBe(false);
    expect(ask({ now: new Date(2026, 9, 18, 20, 30) })).toBe(false);
    expect(ask({ now: new Date(2026, 9, 18, 11, 0) })).toBe(true);
  });

  it('waits 120 days between asks', () => {
    const day = 86_400_000;
    expect(REVIEW_GAP_DAYS).toBe(120);
    expect(ask({ lastAsked: new Date(WEDNESDAY.getTime() - 119 * day).toISOString() })).toBe(false);
    expect(ask({ lastAsked: new Date(WEDNESDAY.getTime() - 121 * day).toISOString() })).toBe(true);
    expect(ask({ lastAsked: 'not a date' })).toBe(true);
  });
});
