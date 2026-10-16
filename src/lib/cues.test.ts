import { describe, expect, it, vi } from 'vitest';

import type { SignedOut } from './auth';

// Only the sign-out rules are tested here: the phone's notifications and the screens stay out of it.
const { leaving } = vi.hoisted(() => ({ leaving: [] as ((who: SignedOut) => void)[] }));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) }, Platform: { OS: 'ios' } }));
vi.mock('expo-router', () => ({ router: { push: () => {}, navigate: () => {} } }));
vi.mock('expo-notifications', () => ({ setNotificationHandler: () => {}, cancelAllScheduledNotificationsAsync: async () => {} }));
vi.mock('./auth', () => ({
  onSignOut: (cb: (who: SignedOut) => void) => {
    leaving.push(cb);
    return () => {};
  },
  useAuth: () => ({}),
}));
vi.mock('./data', () => ({ useData: () => ({}) }));
vi.mock('./prefs', () => ({ usePrefs: () => ({}) }));

const { bindReminderReset, signedOutReminders } = await import('./cues');
const signOut = (who: SignedOut) => leaving.forEach((cb) => cb(who));

describe('reminders after a sign-out', () => {
  it('are off and not yet asked for the next player, with the times kept', () => {
    const before = { asked: true, on: true, lastCall: '19:30', morning: false, perHabit: { a: '07:30' } };
    expect(signedOutReminders(before)).toEqual({ asked: false, on: false, lastCall: '19:30', morning: false, perHabit: { a: '07:30' } });
  });

  it('are switched off when an account signs out or switches, but not when the demo ends', () => {
    const reset = vi.fn();
    const release = bindReminderReset(reset);
    signOut({ userId: 'player-a', demo: false });
    expect(reset).toHaveBeenCalledTimes(1);
    signOut({ userId: null, demo: true });
    expect(reset).toHaveBeenCalledTimes(1);
    release();
    signOut({ userId: 'player-b', demo: false });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('a scheduler letting go never unbinds a newer one', () => {
    const older = vi.fn();
    const newer = vi.fn();
    const releaseOlder = bindReminderReset(older);
    const releaseNewer = bindReminderReset(newer);
    releaseOlder();
    signOut({ userId: 'player-a', demo: false });
    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
    releaseNewer();
  });
});
