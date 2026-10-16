/**
 * Instant start. Each player's rows (profile, cards, check-ins, Comeback prompts and calls) are kept on
 * the phone, so the app opens on the deck while the splash is still up and then refreshes it from the
 * server. Only rows the server holds are kept, never cards, hands or chips: those are always dealt fresh
 * from the rows. Signing out clears every player's rows.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';

import type { Loaded } from './backend';

const PREFIX = 'do-better:rows:v1:';
const WRITE_DELAY_MS = 400;

// Bumped on every clear, so a write queued before a sign-out can never bring the rows back.
let generation = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Rows as they were saved, or null for anything that doesn't look like them. */
function rowsOf(v: unknown): Loaded | null {
  if (!isRecord(v) || !isRecord(v.profile) || typeof v.profile.id !== 'string') return null;
  if (![v.habits, v.days, v.prompts, v.calls].every(Array.isArray)) return null;
  return v as unknown as Loaded;
}

/** This player's rows from the last time the app had them, or null. Never throws. */
export async function readCache(seed: string): Promise<Loaded | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + seed);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    return isRecord(saved) ? rowsOf(saved.rows) : null;
  } catch {
    return null;
  }
}

/** Saves this player's rows shortly, replacing any save still waiting. Only the raw rows are written. */
export function writeCache(seed: string, data: Loaded): void {
  if (pending) clearTimeout(pending);
  const at = generation;
  const rows: Loaded = { profile: data.profile, habits: data.habits, days: data.days, prompts: data.prompts, calls: data.calls };
  pending = setTimeout(() => {
    pending = null;
    if (at !== generation) return;
    AsyncStorage.setItem(PREFIX + seed, JSON.stringify({ savedAt: new Date().toISOString(), rows })).catch(() => {});
  }, WRITE_DELAY_MS);
}

/** Drops a save still waiting, for a deck that is closing. */
export function cancelCacheWrite(): void {
  if (pending) clearTimeout(pending);
  pending = null;
}

/** Forgets every player's rows on this phone. Called on sign-out. */
export async function clearCache(): Promise<void> {
  generation++;
  cancelCacheWrite();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Storage that can't be cleared now holds nothing the next player can open: rows are keyed by player.
  }
}

let splashHidden = false;

/**
 * Lifts the splash screen, once. The app calls this when there is something real to show: the deck, an
 * error, onboarding or sign-in. The root layout also calls it after a few seconds, so it can never stick.
 */
export function hideSplash(): void {
  if (splashHidden) return;
  splashHidden = true;
  SplashScreen.hideAsync().catch(() => {});
}
