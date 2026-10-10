import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Sends signed-out users to sign-in and signed-in users into the app, once the stored session has been read. */
function Gate() {
  const t = useTheme();
  const { session, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const inAuth = segments[0] === '(auth)';

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync();
    if (!session && !inAuth) router.replace('/sign-in');
    else if (session && inAuth) router.replace('/');
  }, [ready, session, inAuth, router]);

  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </>
  );
}
