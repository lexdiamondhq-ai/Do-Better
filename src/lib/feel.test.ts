import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: async (style: string) => void calls.push(`impact:${style}`),
  notificationAsync: async (type: string) => void calls.push(`notify:${type}`),
  selectionAsync: async () => void calls.push('selection'),
}));

let os = 'ios';
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return os;
    },
  },
}));

async function load() {
  vi.resetModules();
  return import('./feel');
}

beforeEach(() => {
  calls.length = 0;
  os = 'ios';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('feel', () => {
  it('gives a Floor a thud, never the warning buzz', async () => {
    const feel = await load();
    feel.floor();
    expect(calls).toEqual(['impact:heavy']);
  });

  it('plays the second tap of a Joker and of chips a moment later', async () => {
    const feel = await load();
    feel.joker();
    feel.chips();
    expect(calls).toEqual(['notify:success', 'impact:medium']);
    vi.advanceTimersByTime(200);
    expect(calls).toEqual(['notify:success', 'impact:medium', 'impact:light', 'impact:rigid']);
  });

  it('names every moment the screens use', async () => {
    const feel = await load();
    feel.arm();
    feel.disarm();
    feel.ceiling();
    feel.flip();
    expect(calls).toEqual(['impact:light', 'selection', 'notify:success', 'impact:soft']);
  });

  it('does nothing when the player turns haptics off, including taps already queued', async () => {
    const feel = await load();
    feel.joker();
    feel.setFeelSettings({ haptics: false });
    vi.advanceTimersByTime(200);
    feel.floor();
    feel.tick();
    expect(calls).toEqual(['notify:success']);
    feel.setFeelSettings({ haptics: true });
    feel.floor();
    expect(calls).toEqual(['notify:success', 'impact:heavy']);
  });

  it('turns a Comeback card over in three growing knocks and a success as the bright side shows', async () => {
    const feel = await load();
    const { comebackExit } = await import('@/engine/comeback');
    const { lightMs, flipMs } = comebackExit({ firstMove: false, reduced: false });
    feel.turnover();
    expect(calls).toEqual(['impact:light']);
    vi.advanceTimersByTime(lightMs / 2);
    expect(calls).toEqual(['impact:light', 'impact:medium']);
    vi.advanceTimersByTime(lightMs / 2);
    expect(calls).toEqual(['impact:light', 'impact:medium', 'impact:heavy']);
    // The success lands at the turn's midpoint, never before the bright side can be seen.
    vi.advanceTimersByTime(flipMs / 2 - 1);
    expect(calls).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['impact:light', 'impact:medium', 'impact:heavy', 'notify:success']);
  });

  it('taps out a hand’s rhythm one beat at a time, each at its own moment', async () => {
    const feel = await load();
    const { handRhythm } = await import('@/engine/rhythm');
    feel.rhythm(handRhythm('full-house'));
    expect(calls).toEqual(['impact:heavy']);
    vi.advanceTimersByTime(180);
    expect(calls).toEqual(['impact:heavy', 'impact:heavy', 'impact:heavy']);
    vi.advanceTimersByTime(260);
    expect(calls).toEqual(['impact:heavy', 'impact:heavy', 'impact:heavy', 'impact:medium']);
    vi.advanceTimersByTime(90);
    expect(calls).toHaveLength(5);
    calls.length = 0;
    feel.rhythm(handRhythm('royal-flush'));
    vi.advanceTimersByTime(1300);
    expect(calls).toEqual(['impact:soft', 'impact:medium', 'impact:medium', 'impact:heavy', 'impact:rigid', 'notify:success', 'impact:rigid']);
  });

  it('turns over and taps rhythms in silence with haptics off, even halfway through', async () => {
    const feel = await load();
    const { handRhythm } = await import('@/engine/rhythm');
    feel.setFeelSettings({ haptics: false });
    feel.turnover();
    feel.rhythm(handRhythm('five-of-a-kind'));
    vi.advanceTimersByTime(1500);
    expect(calls).toEqual([]);
    feel.setFeelSettings({ haptics: true });
    feel.turnover();
    feel.rhythm(handRhythm('two-pair'));
    expect(calls).toEqual(['impact:light', 'impact:medium']);
    feel.setFeelSettings({ haptics: false });
    vi.advanceTimersByTime(1500);
    expect(calls).toEqual(['impact:light', 'impact:medium']);
  });

  it('turns over and taps rhythms in silence in a browser', async () => {
    os = 'web';
    const feel = await load();
    feel.turnover();
    feel.rhythm([{ at: 0, weight: 'success', card: -1 }]);
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
  });

  it('thins out a fast run of ticks', async () => {
    const feel = await load();
    for (let i = 0; i < 10; i++) {
      feel.tick();
      vi.advanceTimersByTime(10);
    }
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.length).toBeLessThanOrEqual(3);
  });

  it('does nothing in a browser', async () => {
    os = 'web';
    const feel = await load();
    feel.floor();
    feel.ceiling();
    feel.tick();
    expect(calls).toEqual([]);
  });
});
