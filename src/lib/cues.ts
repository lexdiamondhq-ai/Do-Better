/**
 * Puts the reminders from `@/engine/cues` on the phone as one-off local notifications, never a repeating
 * one, and routes a tap to the right screen.
 *
 * - Nothing on web and nothing in the demo deck.
 * - Nothing until the player tapped "Remind me" and the phone allowed it.
 * - The whole plan is replaced whenever it changes and whenever the app comes back to the front.
 * - Signing out, switching account or leaving the demo cancels everything at once.
 * - Reminders are each player's own choice: after a sign-out or a switch of account they are off, and
 *   the next player on this phone is asked for themselves.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { SUIT_INFO } from '@/engine/cards';
import { planLine, type Plan } from '@/engine/comeback';
import { cuesFor, type Cue, type CueSettings, type CueSnapshot, type CueUrl } from '@/engine/cues';
import { lastShowdown } from '@/engine/game';

import { onSignOut, useAuth } from './auth';
import { useData } from './data';
import type { Deck } from './deck';
import { usePlans } from './plans';
import { usePrefs, type Prefs, type Reminders } from './prefs';

type Notifications = typeof import('expo-notifications');
type NotificationResponse = import('expo-notifications').NotificationResponse;

const CHANNEL = 'cues';
const native = Platform.OS === 'ios' || Platform.OS === 'android';

let loading: Promise<Notifications | null> | null = null;

/** The notifications module, loaded only on a phone, set up once. */
function notifications(): Promise<Notifications | null> {
  if (!native) return Promise.resolve(null);
  loading ??= import('expo-notifications')
    .then(async (N) => {
      // A reminder that lands while the app is open goes to the list quietly: the player is already here.
      N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
      if (Platform.OS === 'android') await N.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: N.AndroidImportance.DEFAULT });
      return N;
    })
    .catch(() => null);
  return loading;
}

/** Whether this phone can show reminders at all: a phone, not the web. */
export const remindersSupported = native;

/** Whether the phone already allows notifications, without asking. */
export async function hasPermission(): Promise<boolean> {
  const N = await notifications();
  if (!N) return false;
  try {
    const p = await N.getPermissionsAsync();
    return p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

/** Asks the phone for permission. Only ever called after the player tapped "Remind me". */
export async function requestPermission(): Promise<boolean> {
  const N = await notifications();
  if (!N) return false;
  try {
    if (await hasPermission()) return true;
    const p = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

// Every change to the phone's schedule runs one after another, and a sign-out makes any plan still being
// written stop and be cancelled.
let generation = 0;
let applied: string | null = null;
let queue: Promise<void> = Promise.resolve();

function enqueue(job: () => Promise<void>) {
  queue = queue.then(job).catch(() => {});
}

async function cancelAll() {
  const N = await notifications();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing scheduled, or the module isn't there: nothing to cancel.
  }
}

// Set while the scheduler is on screen: switches reminders off in this phone's settings.
let resetReminders: (() => void) | null = null;

/** Reminders as the next player on this phone finds them: off, and not yet asked. Times stay as they were. */
export function signedOutReminders(r: Reminders): Reminders {
  return { ...r, on: false, asked: false };
}

/** Lets the scheduler switch reminders off when a player leaves. Returns the way to let go. */
export function bindReminderReset(reset: () => void): () => void {
  resetReminders = reset;
  return () => {
    if (resetReminders === reset) resetReminders = null;
  };
}

onSignOut((who) => {
  generation++;
  applied = null;
  enqueue(cancelAll);
  // The phone's permission stays, but the choice was this player's. The demo never turns reminders on.
  if (!who.demo) resetReminders?.();
});

function signature(cues: readonly Cue[] | null): string {
  return cues ? cues.map((c) => `${c.id}@${c.fireAt}:${c.title}|${c.body}`).join('\n') : 'off';
}

/**
 * Replaces everything scheduled with `cues`, or clears it all when null. Skips work when nothing changed.
 * `gen` is the sign-in the plan was made for: a plan made before a sign-out is dropped, never written.
 */
function apply(cues: readonly Cue[] | null, gen = generation) {
  const sig = signature(cues);
  enqueue(async () => {
    if (gen !== generation || sig === applied) return;
    const N = await notifications();
    if (!N) return;
    await cancelAll();
    applied = sig;
    if (!cues) return;
    for (const c of cues) {
      if (gen !== generation) return;
      await N.scheduleNotificationAsync({
        identifier: c.id,
        content: { title: c.title, body: c.body, sound: 'default', data: { url: c.url } },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: c.fireAt, channelId: CHANNEL },
      });
    }
  });
}

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * What the cue plan needs from the deck and this phone's settings. `plans` are the player's plans by card
 * (`usePlans`), the saved ones on this phone when left out: a card's plan is what its last call says.
 */
export function cueSnapshot(deck: Deck, prefs: Prefs, seed: string, plans: Readonly<Record<string, Plan>> = prefs.plans[seed] ?? {}): CueSnapshot {
  const keptToday = new Set(deck.cards.filter((c) => c.today).map((c) => c.habit.id));
  const last = lastShowdown(deck.game);
  const seen = prefs.showdownSeen[seed];
  const soon = deck.court.find((s) => s.next?.needed === 1 && s.habitIds.length > 0 && !s.habitIds.some((id) => keptToday.has(id)));
  return {
    today: deck.today,
    habits: deck.cards.map((c) => ({
      id: c.habit.id,
      name: c.habit.name,
      floor: c.habit.floorLabel,
      firstMove: c.habit.twoMinuteLabel,
      startedOn: c.habit.startedOn,
      part: c.partOfDay,
      keptToday: !!c.today,
      remindAt: prefs.reminders.perHabit[c.habit.id] ?? null,
      plan: plans[c.habit.id] ? planLine(plans[c.habit.id], c.habit) : null,
    })),
    rescue: !!deck.game.rescue,
    callWaiting: deck.game.callOpen && !deck.game.current.call,
    warmup: deck.game.current.warmup,
    handThisWeek: !!deck.game.current.hand,
    showdownWaiting: last && (!seen || last.start > seen) ? last.start : null,
    faceSoon: soon?.next ? { name: `The ${soon.next.face.name} of ${SUIT_INFO[soon.suit].name}`, habitIds: soon.habitIds } : null,
  };
}

export function cueSettings(prefs: Prefs): CueSettings {
  return { lastCall: prefs.reminders.lastCall, morning: prefs.reminders.morning };
}

/** The clock, ticking once a minute and again whenever the app comes back to the front. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return now;
}

/** The reminders the deck would send from now, for showing what's coming. Works in the demo and on web too. */
export function usePlannedCues(deck: Deck | null): Cue[] {
  const { prefs } = usePrefs();
  const { seed } = useData();
  const plans = usePlans();
  const now = useNow();
  if (!deck) return [];
  return cuesFor(cueSnapshot(deck, prefs, seed, plans), cueSettings(prefs), new Date(now), deviceTimeZone());
}

let handled: string | null = null;

/** Opens the screen a reminder points at. */
function openUrl(url: unknown, coldStart: boolean) {
  if (typeof url !== 'string') return;
  const target = url as CueUrl;
  if (target === '/call') router.push('/call');
  else if (target.startsWith('/showdown?week=')) {
    // On a cold start the tabs open a waiting Showdown by themselves.
    if (coldStart) router.navigate('/');
    else router.navigate({ pathname: '/showdown', params: { week: target.slice('/showdown?week='.length) } });
  } else router.navigate('/');
}

function respond(response: NotificationResponse | null, coldStart: boolean, N: Notifications) {
  if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
  const key = `${response.notification.request.identifier}@${response.notification.date}`;
  if (key === handled) return;
  handled = key;
  // Handled once: a later remount (another account, the demo) must not open it again.
  N.clearLastNotificationResponseAsync().catch(() => {});
  openUrl(response.notification.request.content.data?.url, coldStart);
}

/**
 * Keeps the phone's reminders in step with the deck. Rendered once, inside DeckProvider. Renders nothing.
 */
export function CueScheduler({ deck }: { deck: Deck | null }) {
  const { prefs, ready, setPrefs } = usePrefs();
  const { demo } = useAuth();
  const { seed } = useData();
  const plans = usePlans();
  const now = useNow();
  const on = prefs.reminders.on && !demo && native;

  useEffect(() => bindReminderReset(() => setPrefs((p) => ({ reminders: signedOutReminders(p.reminders) }))), [setPrefs]);

  // The plan, rebuilt on every change. A short pause lets a burst of check-ins settle first.
  useEffect(() => {
    if (!native || !ready || !deck) return;
    if (!on) {
      if (!demo) apply(null);
      return;
    }
    const plan = cuesFor(cueSnapshot(deck, prefs, seed, plans), cueSettings(prefs), new Date(now), deviceTimeZone());
    // The plan belongs to this sign-in and this render. If the deck changes, or the player signs out, while
    // the phone is still answering about permission, the stale plan is dropped instead of written.
    const gen = generation;
    let live = true;
    const timer = setTimeout(() => {
      hasPermission().then((allowed) => {
        if (live) apply(allowed ? plan : null, gen);
      });
    }, 800);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [deck, prefs, seed, plans, now, on, ready, demo]);

  // Taps, while running and from a cold start.
  useEffect(() => {
    if (!native) return;
    let live = true;
    let remove: (() => void) | null = null;
    notifications().then((N) => {
      if (!N || !live) return;
      const sub = N.addNotificationResponseReceivedListener((r) => respond(r, false, N));
      remove = () => sub.remove();
      N.getLastNotificationResponseAsync()
        .then((r) => {
          if (live) respond(r, true, N);
        })
        .catch(() => {});
    });
    return () => {
      live = false;
      remove?.();
    };
  }, []);

  return null;
}
