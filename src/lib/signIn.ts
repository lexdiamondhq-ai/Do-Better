import { createClient, type Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Getting into Do Better, and keeping what you made.
 *
 * "Deal me in" starts a guest deck with no account (Supabase anonymous sign-in), so the first card is a
 * minute away. A guest saves the deck later by linking Sign in with Apple or an email address to the same
 * user: the user id, and with it the deal seed and every row, stays the same. Returning players sign in
 * with Apple or a 6-digit email code.
 *
 * Every failure reaches the screen as a plain sentence (`SignInError`). The raw text from Supabase or
 * Apple is kept on the error, and shown only in development builds.
 */

/** What went wrong, in terms a screen can act on. */
export type Problem =
  /** Anonymous sign-ins are switched off in Supabase: offer Apple and email instead. */
  | 'guest-off'
  /** Linking an identity to a guest is switched off in Supabase. */
  | 'linking-off'
  /** The Apple ID or email already belongs to another deck. */
  | 'taken'
  | 'code'
  | 'apple'
  | 'email'
  | 'busy'
  | 'offline'
  | 'other';

export class SignInError extends Error {
  readonly problem: Problem;
  /** The message from Supabase or Apple, for development builds and logs. */
  readonly raw: string;
  constructor(problem: Problem, message: string, raw: string) {
    super(message);
    this.name = 'SignInError';
    this.problem = problem;
    this.raw = raw;
  }
}

/** Where the failure happened, which decides the words for a failure nobody planned for. */
export type Step = 'guest' | 'apple' | 'email-send' | 'email-code' | 'save-apple' | 'save-email' | 'save-code' | 'switch';

type Failure = { code?: unknown; status?: unknown; name?: unknown; message?: unknown };

const MESSAGES: Record<Problem, string> = {
  'guest-off': 'Starting without an account isn’t switched on yet. Sign in with Apple or your email and your first cards deal straight away.',
  'linking-off': 'Saving a guest deck isn’t switched on yet, so this deck stays on this phone for now. Try again later.',
  taken: 'That one already has a deck.',
  code: 'That code didn’t work. Check the newest email and try again.',
  apple: 'Sign in with Apple didn’t finish. Try again, or use your email.',
  email: 'That email address doesn’t look right. Check it and try again.',
  busy: 'Too many tries for now. Wait a minute, then try again.',
  offline: 'Check your connection and try again.',
  other: 'Something went wrong. Try again.',
};

/** Sorts a failure from Supabase, Apple or the network into a `Problem`. */
export function problemOf(e: unknown, step: Step): Problem {
  if (e instanceof SignInError) return e.problem;
  const f: Failure = typeof e === 'object' && e !== null ? (e as Failure) : { message: String(e) };
  const code = typeof f.code === 'string' ? f.code : '';
  const message = typeof f.message === 'string' ? f.message : '';
  const status = typeof f.status === 'number' ? f.status : 0;

  if (code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(message)) return 'guest-off';
  if (code === 'manual_linking_disabled' || /manual linking is disabled/i.test(message)) return 'linking-off';
  if (code === 'identity_already_exists' || code === 'email_exists' || code === 'user_already_exists' || /already (been )?(registered|linked|exists)|already in use/i.test(message)) return 'taken';
  if (code === 'otp_expired' || /token has expired|otp.*(invalid|expired)|invalid.*(otp|token)/i.test(message)) return 'code';
  if (code === 'email_address_invalid' || code === 'validation_failed' || /invalid email|email address .* invalid|unable to validate email/i.test(message)) return step.startsWith('email') || step === 'save-email' ? 'email' : 'other';
  if (code.startsWith('over_') || status === 429 || /rate limit|too many/i.test(message)) return 'busy';
  if (f.name === 'AuthRetryableFetchError' || /network request failed|failed to fetch|network ?error|load failed|timed? ?out/i.test(message)) return 'offline';
  if (step === 'apple' || step === 'save-apple' || /apple|identity token|ERR_REQUEST/i.test(`${code} ${message}`)) return 'apple';
  if (step === 'email-code' || step === 'save-code') return 'code';
  return 'other';
}

/** A failure as a sentence for the screen. In development builds the raw message follows it. */
export function friendlyAuthError(e: unknown, step: Step, dev: boolean = typeof __DEV__ !== 'undefined' && __DEV__): SignInError {
  if (e instanceof SignInError) return e;
  const problem = problemOf(e, step);
  const raw = typeof e === 'object' && e !== null && typeof (e as Failure).message === 'string' ? ((e as Failure).message as string) : String(e);
  const message = dev && problem !== 'taken' && raw ? `${MESSAGES[problem]} (${raw})` : MESSAGES[problem];
  return new SignInError(problem, message, raw);
}

/** Runs one Supabase auth call, turning its error (returned or thrown) into a `SignInError`. */
async function attempt(step: Step, run: () => Promise<{ error: unknown }>): Promise<void> {
  let result: { error: unknown };
  try {
    result = await run();
  } catch (e) {
    throw friendlyAuthError(e, step);
  }
  if (result.error) throw friendlyAuthError(result.error, step);
}

/**
 * "Deal me in": a deck with no account yet, saved to this phone's guest user. Needs "Allow anonymous
 * sign-ins" in Supabase; when it's off this throws a `guest-off` SignInError.
 */
export async function dealMeIn() {
  await attempt('guest', () => supabase.auth.signInAnonymously());
}

/** The same guest start, under the name the Expo Go development path has always used. */
export const signInAsGuest = dealMeIn;

/** Sign in with Apple needs a real build on an iPhone; Expo Go and the web can't show it. */
export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

type AppleResult = { cancelled: true } | { cancelled: false; token: string; name: string };

/** Asks Apple who this is. Cancelling the Apple sheet isn't an error. */
async function askApple(step: Step): Promise<AppleResult> {
  if (!(await appleAvailable())) throw new SignInError('apple', MESSAGES.apple, 'Sign in with Apple is not available on this device.');
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
    throw friendlyAuthError(e, step);
  }
  if (!credential.identityToken) throw new SignInError('apple', MESSAGES.apple, 'Apple did not return an identity token.');
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  return { cancelled: false, token: credential.identityToken, name };
}

/** Apple only sends the name the very first time, so it's kept the moment it arrives. */
async function keepName(name: string) {
  if (name) await supabase.auth.updateUser({ data: { display_name: name } }).catch(() => {});
}

/** Native Sign in with Apple. The identity token goes straight to Supabase; no browser round trip. */
export async function signInWithApple(): Promise<{ cancelled: boolean }> {
  const apple = await askApple('apple');
  if (apple.cancelled) return { cancelled: true };
  await attempt('apple', () => supabase.auth.signInWithIdToken({ provider: 'apple', token: apple.token }));
  await keepName(apple.name);
  return { cancelled: false };
}

/** Passwordless email: Supabase sends a 6-digit code. A returning player only: a new deck starts with Deal me in. */
export async function sendEmailCode(email: string, options: { create?: boolean } = {}) {
  await attempt('email-send', () => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: options.create ?? true } }));
}

export async function verifyEmailCode(email: string, code: string) {
  await attempt('email-code', () => supabase.auth.verifyOtp({ email, token: code, type: 'email' }));
}

/** A guest who is about to leave their deck for another account: enough to tidy the guest deck up after. */
type Guest = { userId: string; accessToken: string };

function guestOf(session: Session | null): Guest | null {
  return session?.user?.is_anonymous ? { userId: session.user.id, accessToken: session.access_token } : null;
}

async function currentGuest(): Promise<Guest | null> {
  const { data } = await supabase.auth.getSession();
  return guestOf(data.session);
}

export type SaveResult =
  /** The deck now belongs to that Apple ID or email. Nothing else changes. */
  | { kind: 'saved' }
  /** The Apple sheet was closed. */
  | { kind: 'cancelled' }
  /** An email with a code is on its way. Finish with `confirmSavedEmail`. */
  | { kind: 'code-sent'; email: string }
  /** That Apple ID or email already has its own deck. `switchTo*` moves to it and deletes this guest deck. */
  | { kind: 'taken'; via: 'apple'; token: string }
  | { kind: 'taken'; via: 'email'; email: string };

/**
 * Saves a guest deck to Sign in with Apple, by linking the Apple ID to the guest user. Needs "Enable
 * manual linking" in Supabase.
 */
export async function saveDeckWithApple(): Promise<SaveResult> {
  const apple = await askApple('save-apple');
  if (apple.cancelled) return { kind: 'cancelled' };
  try {
    await attempt('save-apple', () => supabase.auth.linkIdentity({ provider: 'apple', token: apple.token }));
  } catch (e) {
    if (e instanceof SignInError && e.problem === 'taken') return { kind: 'taken', via: 'apple', token: apple.token };
    throw e;
  }
  await keepName(apple.name);
  return { kind: 'saved' };
}

/** Saves a guest deck to an email address: Supabase sends a 6-digit code to prove it's theirs. */
export async function saveDeckWithEmail(email: string): Promise<SaveResult> {
  try {
    await attempt('save-email', () => supabase.auth.updateUser({ email }));
  } catch (e) {
    if (e instanceof SignInError && e.problem === 'taken') return { kind: 'taken', via: 'email', email };
    throw e;
  }
  return { kind: 'code-sent', email };
}

/** The code from the email `saveDeckWithEmail` sent. Once it checks out, the deck belongs to that address. */
export async function confirmSavedEmail(email: string, code: string): Promise<void> {
  await attempt('save-code', () => supabase.auth.verifyOtp({ email, token: code, type: 'email_change' }));
  // The session now carries the email; read the user again so the app stops treating it as a guest.
  await supabase.auth.refreshSession().catch(() => {});
}

/**
 * Leaves this guest deck for the deck that Apple ID already has. The guest deck is deleted once the
 * switch has worked, so a failed switch never costs anything.
 */
export async function switchToApple(token: string): Promise<{ cancelled: boolean }> {
  const guest = await currentGuest();
  const first = await supabase.auth.signInWithIdToken({ provider: 'apple', token }).catch((e: unknown) => ({ error: e }));
  if (first.error) {
    // The token from a moment ago can be refused the second time; ask Apple again.
    const again = await signInWithApple();
    if (again.cancelled) return { cancelled: true };
  }
  if (guest) await forgetGuest(guest);
  return { cancelled: false };
}

/** Step one of leaving this guest deck for the deck an email already has: send that address a code. */
export async function switchToEmail(email: string): Promise<void> {
  await sendEmailCode(email, { create: false });
}

/** Step two: the code checks out, the phone moves to that deck, and the guest deck is deleted. */
export async function confirmSwitchEmail(email: string, code: string): Promise<void> {
  const guest = await currentGuest();
  await verifyEmailCode(email, code);
  if (guest) await forgetGuest(guest);
}

/**
 * Deletes a guest deck the phone has just moved away from, using the guest's own sign-in, which still
 * works for a while after the switch. Row level security lets an owner delete their habits (which takes
 * their check-ins and Comeback answers with them) and their calls. If it can't, the rows stay with a
 * guest user nobody can open again; a server clean-up of abandoned guests is the backstop.
 */
async function forgetGuest(guest: Guest): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  try {
    const client = createClient(new URL(url.trim()).origin, key, {
      global: { headers: { Authorization: `Bearer ${guest.accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'do-better-guest-tidy' },
    });
    await client.from('habits').delete().eq('owner_id', guest.userId);
    await client.from('hand_calls').delete().eq('owner_id', guest.userId);
    await client.from('profiles').update({ north_star: null, onboarded_at: null }).eq('id', guest.userId);
  } catch {
    // Best effort: the player has already moved to their own deck.
  }
}
