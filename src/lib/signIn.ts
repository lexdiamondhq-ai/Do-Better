import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** Native Sign in with Apple. The identity token goes straight to Supabase; no browser round trip. */
export async function signInWithApple() {
  if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) throw new Error('Sign in with Apple is not available on this device.');
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { cancelled: true as const };
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  if (error) throw error;
  // Apple only sends the name on the very first sign-in, so persist it now or lose it.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  if (name) await supabase.auth.updateUser({ data: { display_name: name } });
  return { cancelled: false as const };
}

/** Passwordless email: Supabase sends a 6-digit code; the account is created on first use. */
export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
}

/**
 * A throwaway account with no email or Apple ID, for trying the app in Expo Go, where Sign in with
 * Apple isn't available. Needs "Allow anonymous sign-ins" turned on in Supabase. Dev builds only.
 */
export async function signInAsGuest() {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}
