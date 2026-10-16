import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = { OS: 'ios' as string };
let shareAnswer: () => Promise<{ action?: string }> = () => Promise.resolve({ action: 'sharedAction' });
const shared: unknown[] = [];

vi.mock('react-native', () => ({
  Platform: platform,
  Share: {
    share: (content: unknown) => {
      shared.push(content);
      return shareAnswer();
    },
    dismissedAction: 'dismissedAction',
  },
}));

const { inviteContent, PITCH, sendInvite } = await import('./invite');

function browser(nav: { share?: unknown; clipboard?: { writeText: (t: string) => Promise<void> } } | undefined) {
  vi.stubGlobal('navigator', nav);
}

afterEach(() => {
  vi.unstubAllGlobals();
  shared.length = 0;
  platform.OS = 'ios';
  shareAnswer = () => Promise.resolve({ action: 'sharedAction' });
});

describe('the invite', () => {
  it('puts the link where each platform wants it, and goes without one until there is one', () => {
    expect(inviteContent('', 'ios')).toEqual({ message: PITCH });
    expect(inviteContent('https://t.example/x', 'ios')).toEqual({ message: PITCH, url: 'https://t.example/x' });
    expect(inviteContent('https://t.example/x', 'android')).toEqual({ message: `${PITCH}\nhttps://t.example/x` });
  });

  it('never says streak except to promise there are none', () => {
    expect(PITCH.replace(/No streaks/g, '')).not.toMatch(/streak/i);
  });

  it('opens the share sheet on a phone and hears a cancel', async () => {
    expect(await sendInvite('')).toBe('shared');
    expect(shared).toEqual([{ message: PITCH }]);
    shareAnswer = () => Promise.resolve({ action: 'dismissedAction' });
    expect(await sendInvite('')).toBe('cancelled');
  });

  it('copies the pitch in a browser with no share sheet, and says so', async () => {
    platform.OS = 'web';
    const copied: string[] = [];
    browser({ clipboard: { writeText: async (t) => void copied.push(t) } });
    expect(await sendInvite('https://t.example/x')).toBe('copied');
    expect(shared).toEqual([]);
    expect(copied).toEqual([`${PITCH}\nhttps://t.example/x`]);
  });

  it('reports a failure when it can neither share nor copy', async () => {
    platform.OS = 'web';
    browser({});
    expect(await sendInvite('')).toBe('failed');
    platform.OS = 'android';
    browser(undefined);
    shareAnswer = () => Promise.reject(new Error('no'));
    expect(await sendInvite('')).toBe('failed');
  });

  it('treats closing a browser share sheet as a cancel, not a reason to copy', async () => {
    platform.OS = 'web';
    const copied: string[] = [];
    browser({ share: () => {}, clipboard: { writeText: async (t) => void copied.push(t) } });
    shareAnswer = () => Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' }));
    expect(await sendInvite('')).toBe('cancelled');
    expect(copied).toEqual([]);
    shareAnswer = () => Promise.resolve({});
    expect(await sendInvite('')).toBe('shared');
  });
});
