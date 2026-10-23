import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AskHost } from '@/components/Ask';
import { AuthProvider, onSignOut, useAuth } from '@/lib/auth';
import { clearCache, hideSplash } from '@/lib/cache';
import { PrefsProvider, usePrefs } from '@/lib/prefs';
import { setSoundSettings } from '@/lib/sound';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();
// The splash lifts with a short fade once the deck, sign-in or an error is ready to show.
SplashScreen.setOptions({ fade: true, duration: 250 });

/** However long loading takes, the splash never stays up longer than this. */
const SPLASH_LIMIT_MS = 3000;

export default function RootLayout() {
  useEffect(() => {
    const limit = setTimeout(hideSplash, SPLASH_LIMIT_MS);
    // A player's rows kept on this phone leave with them.
    const off = onSignOut(() => {
      clearCache();
    });
    return () => {
      clearTimeout(limit);
      off();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <PrefsProvider>
            <AuthProvider>
              <Gate />
            </AuthProvider>
          </PrefsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Sends signed-out users to sign-in and signed-in users into the app, once the stored session and the
 * fonts are ready. Someone trying the demo deck counts as signed in. For a signed-in player the splash
 * stays up until the tabs have the deck (see the tabs layout); for everyone else it lifts here.
 */
function Gate() {
  const t = useTheme();
  const { session, demo, ready: authReady } = useAuth();
  const signedIn = !!session || !!demo;
  const [fontsLoaded, fontError] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  // A font that fails to load falls back to the system font rather than blocking the app.
  const ready = authReady && (fontsLoaded || !!fontError);
  const segments = useSegments();
  const router = useRouter();
  const inAuth = segments[0] === '(auth)';

  useEffect(() => {
    if (!ready) return;
    if (!signedIn) hideSplash();
    if (!signedIn && !inAuth) router.replace('/sign-in');
    else if (signedIn && inAuth) router.replace('/');
  }, [ready, signedIn, inAuth, router]);

  return (
    <>
      <DemoNotes />
      <Sound on={ready && signedIn} />
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
      <AskHost />
    </>
  );
}

/** Thumb marks and plans made in the demo deck leave with it, so nothing from the demo lingers on this phone. */
function DemoNotes() {
  const { forgetDemoNotes } = usePrefs();
  useEffect(
    () =>
      onSignOut((who) => {
        if (who.demo) forgetDemoNotes();
      }),
    [forgetDemoNotes],
  );
  return null;
}

/** Keeps the music and effects in step with the settings. Music plays only inside the app, never on sign-in. */
function Sound({ on }: { on: boolean }) {
  const { prefs, ready } = usePrefs();
  const music = on && ready && prefs.music;
  const sounds = prefs.sounds;
  // On the web, sound.ts itself listens for the first tap or key that lets music start.
  useEffect(() => {
    setSoundSettings({ sounds, music });
  }, [sounds, music]);
  return null;
}
