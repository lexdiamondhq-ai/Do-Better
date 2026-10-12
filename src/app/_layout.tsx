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
import { AuthProvider, useAuth } from '@/lib/auth';
import { PrefsProvider } from '@/lib/prefs';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
 * fonts are ready. Someone trying the demo deck counts as signed in.
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
    SplashScreen.hideAsync();
    if (!signedIn && !inAuth) router.replace('/sign-in');
    else if (signedIn && inAuth) router.replace('/');
  }, [ready, signedIn, inAuth, router]);

  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
      <AskHost />
    </>
  );
}
