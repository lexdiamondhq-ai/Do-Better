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
