import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in Supabase: each auth call answers with whatever the test queued, and every call is recorded.
type Answer = { error: unknown; data?: unknown };
const queued: Record<string, Answer[]> = {};
const calls: string[] = [];
const answer = (name: string, ...args: unknown[]) => {
  calls.push(`${name} ${JSON.stringify(args[0] ?? '')}`);
  return Promise.resolve(queued[name]?.shift() ?? { error: null, data: {} });
};
let session: unknown = null;

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      signInAnonymously: (...a: unknown[]) => answer('signInAnonymously', ...a),
      signInWithIdToken: (...a: unknown[]) => answer('signInWithIdToken', ...a),
      signInWithOtp: (...a: unknown[]) => answer('signInWithOtp', ...a),
      verifyOtp: (...a: unknown[]) => answer('verifyOtp', ...a),
      linkIdentity: (...a: unknown[]) => answer('linkIdentity', ...a),
      updateUser: (...a: unknown[]) => answer('updateUser', ...a),
      refreshSession: () => answer('refreshSession'),
      getSession: () => Promise.resolve({ data: { session } }),
    },
  },
}));

// The throwaway client that tidies up a guest deck after a switch.
const tidied: string[] = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, options: { global: { headers: { Authorization: string } } }) => ({
    from: (table: string) => {
      const run = (verb: string) => ({ eq: (column: string, value: string) => (tidied.push(`${verb} ${table} ${column}=${value} as ${options.global.headers.Authorization}`), Promise.resolve({ error: null })) });
      return { delete: () => run('delete'), update: () => run('update') };
    },
  }),
}));

let appleAnswer: () => Promise<unknown> = () => Promise.resolve({ identityToken: 'apple-token', fullName: null });
vi.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: () => Promise.resolve(true),
  signInAsync: () => appleAnswer(),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const signIn = await import('./signIn');
const { problemOf, friendlyAuthError, SignInError } = signIn;

beforeEach(() => {
  for (const k of Object.keys(queued)) delete queued[k];
  calls.length = 0;
  tidied.length = 0;
  session = null;
  appleAnswer = () => Promise.resolve({ identityToken: 'apple-token', fullName: null });
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://tests.invalid');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const guestSession = { access_token: 'guest-token', user: { id: 'guest-1', is_anonymous: true } };

describe('sign-in problems', () => {
  it('know when starting without an account is switched off, by code or by message', () => {
    expect(problemOf({ code: 'anonymous_provider_disabled', message: 'x' }, 'guest')).toBe('guest-off');
    expect(problemOf({ message: 'Anonymous sign-ins are disabled' }, 'guest')).toBe('guest-off');
  });

  it('know an Apple ID or email that already has a deck', () => {
    expect(problemOf({ code: 'identity_already_exists' }, 'save-apple')).toBe('taken');
    expect(problemOf({ code: 'email_exists' }, 'save-email')).toBe('taken');
    expect(problemOf({ message: 'A user with this email address has already been registered' }, 'save-email')).toBe('taken');
  });

  it('tell a bad code, a busy server, a lost connection and switched-off linking apart', () => {
    expect(problemOf({ code: 'otp_expired', message: 'Token has expired or is invalid' }, 'email-code')).toBe('code');
    expect(problemOf({ code: 'over_email_send_rate_limit' }, 'email-send')).toBe('busy');
    expect(problemOf({ status: 429, message: '' }, 'guest')).toBe('busy');
    expect(problemOf({ name: 'AuthRetryableFetchError', message: '{}' }, 'guest')).toBe('offline');
    expect(problemOf(new TypeError('Failed to fetch'), 'email-send')).toBe('offline');
    expect(problemOf({ code: 'manual_linking_disabled' }, 'save-apple')).toBe('linking-off');
  });

  it('call a mistyped address an email problem only where an email was typed', () => {
    expect(problemOf({ code: 'email_address_invalid' }, 'email-send')).toBe('email');
    expect(problemOf({ code: 'email_address_invalid' }, 'save-email')).toBe('email');
    expect(problemOf({ code: 'email_address_invalid' }, 'guest')).toBe('other');
  });

  it('fall back on the step for anything unplanned', () => {
    expect(problemOf({ message: 'weird' }, 'email-code')).toBe('code');
    expect(problemOf({ message: 'weird' }, 'apple')).toBe('apple');
    expect(problemOf({ message: 'weird' }, 'guest')).toBe('other');
    expect(problemOf('a bare string', 'guest')).toBe('other');
  });

  it('read as plain sentences, with the raw text only in development builds', () => {
    const e = { code: 'anonymous_provider_disabled', message: 'Anonymous sign-ins are disabled' };
    const release = friendlyAuthError(e, 'guest', false);
    expect(release).toBeInstanceOf(SignInError);
    expect(release.problem).toBe('guest-off');
    expect(release.message).not.toMatch(/Anonymous sign-ins are disabled/);
    // It can show where there is no Apple button, so it names no way in, and never a setting being "switched on".
    expect(release.message).toMatch(/first cards deal straight away/);
    expect(release.message).not.toMatch(/Apple|switched|enabled|anonymous/i);
    expect(release.raw).toBe('Anonymous sign-ins are disabled');
    expect(friendlyAuthError(e, 'guest', true).message).toMatch(/\(Anonymous sign-ins are disabled\)$/);
    // "Already has a deck" is answered by the screen, so it never carries the raw text.
    expect(friendlyAuthError({ code: 'email_exists', message: 'Email exists' }, 'save-email', true).message).toBe('That one already has a deck.');
  });
});

describe('a typed email address', () => {
  it('asks for one when the field is empty', () => {
    expect(signIn.checkEmail('')).toBe('Type your email address first.');
    expect(signIn.checkEmail('   ')).toBe('Type your email address first.');
  });

  it('calls a half-typed address incomplete, not missing', () => {
    for (const typo of ['alex@gmail', 'alex.gmail.com', 'alex@', '@gmail.com', 'alex@gmail.', 'alex@gmail.c', 'alex@@gmail.com']) {
      expect(signIn.checkEmail(typo), typo).toBe('That email looks incomplete. Check it and try again.');
    }
  });

  it('points at a stray space', () => {
    expect(signIn.checkEmail('alex @gmail.com')).toMatch(/space/);
  });

  it('lets a real address through, spaces around it trimmed', () => {
    for (const ok of ['alex@gmail.com', ' alex@gmail.com ', 'a.b+tag@mail.example.co.uk', 'x@y.io']) expect(signIn.checkEmail(ok), ok).toBeNull();
  });
});

describe('a guest deck that didn’t start from the demo', () => {
  const failure = (problem: 'guest-off' | 'offline' | 'busy' | 'other') => signIn.deckDidntStart(new SignInError(problem, `message for ${problem}`, ''));

  it('offers to try again only when that could work', () => {
    expect(failure('offline').retry).toBe(true);
    expect(failure('other').retry).toBe(true);
    expect(failure('busy').retry).toBe(false);
    expect(failure('guest-off').retry).toBe(false);
  });

  it('sends someone with no way to start a guest deck to the new-deck form, never “welcome back”', () => {
    expect(failure('guest-off')).toMatchObject({ title: 'Start with an account', next: { opening: 'new' } });
  });

  it('opens the sign-in form itself for “Sign in instead”', () => {
    expect(failure('offline')).toMatchObject({ title: 'Your deck didn’t start', message: 'message for offline', next: { label: 'Sign in instead', opening: 'sign-in' } });
  });
});

describe('dealing in', () => {
  it('starts a guest deck with an anonymous sign-in', async () => {
    await signIn.dealMeIn();
    expect(calls).toEqual(['signInAnonymously ""']);
  });

  it('says plainly when guests are switched off', async () => {
    queued.signInAnonymously = [{ error: { code: 'anonymous_provider_disabled', message: 'Anonymous sign-ins are disabled' } }];
    await expect(signIn.dealMeIn()).rejects.toMatchObject({ problem: 'guest-off' });
  });

  it('keeps the old guest name for the development path', () => {
    expect(signIn.signInAsGuest).toBe(signIn.dealMeIn);
  });
});

describe('saving a guest deck', () => {
  it('links the Apple ID to the same user, so every card stays', async () => {
    expect(await signIn.saveDeckWithApple()).toEqual({ kind: 'saved' });
    expect(calls).toEqual(['linkIdentity {"provider":"apple","token":"apple-token"}']);
  });

  it('treats closing the Apple sheet as nothing happening', async () => {
    appleAnswer = () => Promise.reject(Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }));
    expect(await signIn.saveDeckWithApple()).toEqual({ kind: 'cancelled' });
    expect(calls).toEqual([]);
  });

  it('owns up when that Apple ID already has a deck, keeping the token to switch with', async () => {
    queued.linkIdentity = [{ error: { code: 'identity_already_exists', message: 'Identity is already linked to another user' } }];
    expect(await signIn.saveDeckWithApple()).toEqual({ kind: 'taken', via: 'apple', token: 'apple-token' });
  });

  it('sends a code to a new email, and confirms it as an email change', async () => {
    expect(await signIn.saveDeckWithEmail('me@example.com')).toEqual({ kind: 'code-sent', email: 'me@example.com' });
    await signIn.confirmSavedEmail('me@example.com', '123456');
    expect(calls).toEqual(['updateUser {"email":"me@example.com"}', 'verifyOtp {"email":"me@example.com","token":"123456","type":"email_change"}', 'refreshSession ""']);
  });

  it('owns up when that email already has a deck', async () => {
    queued.updateUser = [{ error: { code: 'email_exists', message: 'A user with this email address has already been registered' } }];
    expect(await signIn.saveDeckWithEmail('me@example.com')).toEqual({ kind: 'taken', via: 'email', email: 'me@example.com' });
  });

  it('passes on any other failure', async () => {
    queued.linkIdentity = [{ error: { code: 'manual_linking_disabled', message: 'Manual linking is disabled' } }];
    await expect(signIn.saveDeckWithApple()).rejects.toMatchObject({ problem: 'linking-off' });
  });
});

describe('switching to a deck that already exists', () => {
  it('deletes the guest deck with the guest’s own sign-in, once the switch has worked', async () => {
    session = guestSession;
    // It names the deck it deleted, so the phone can drop what it kept for it.
    expect(await signIn.confirmSwitchEmail('me@example.com', '123456')).toEqual({ left: 'guest-1' });
    expect(calls).toEqual(['verifyOtp {"email":"me@example.com","token":"123456","type":"email"}']);
    expect(tidied).toEqual([
      'delete habits owner_id=guest-1 as Bearer guest-token',
      'delete hand_calls owner_id=guest-1 as Bearer guest-token',
      'update profiles id=guest-1 as Bearer guest-token',
    ]);
  });

  it('keeps the guest deck when the code is wrong', async () => {
    session = guestSession;
    queued.verifyOtp = [{ error: { code: 'otp_expired', message: 'Token has expired or is invalid' } }];
    await expect(signIn.confirmSwitchEmail('me@example.com', '000000')).rejects.toMatchObject({ problem: 'code' });
    expect(tidied).toEqual([]);
  });

  it('names the guest deck it deleted after an Apple switch, so the phone drops its notes', async () => {
    session = guestSession;
    expect(await signIn.switchToApple('apple-token')).toEqual({ cancelled: false, left: 'guest-1' });
    expect(tidied[0]).toBe('delete habits owner_id=guest-1 as Bearer guest-token');
  });

  it('only sends a switch code to an address that already has a deck', async () => {
    await signIn.switchToEmail('me@example.com');
    expect(calls).toEqual(['signInWithOtp {"email":"me@example.com","options":{"shouldCreateUser":false}}']);
  });

  it('asks Apple again if the first token is refused, and keeps the guest deck if that is cancelled', async () => {
    session = guestSession;
    queued.signInWithIdToken = [{ error: { message: 'Token already used' } }];
    appleAnswer = () => Promise.reject(Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }));
    expect(await signIn.switchToApple('apple-token')).toEqual({ cancelled: true, left: null });
    expect(tidied).toEqual([]);
  });

  it('never deletes anything for a player who isn’t a guest', async () => {
    session = { access_token: 'real', user: { id: 'u1', is_anonymous: false } };
    expect(await signIn.switchToApple('apple-token')).toEqual({ cancelled: false, left: null });
    expect(tidied).toEqual([]);
  });
});
