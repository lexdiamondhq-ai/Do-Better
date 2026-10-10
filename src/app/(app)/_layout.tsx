import { Stack } from 'expo-router';

import { Celebration } from '@/components/Celebration';
import { useAuth } from '@/lib/auth';
import { DataProvider } from '@/lib/data';
import { useTheme } from '@/theme/ThemeProvider';

export default function AppLayout() {
  const t = useTheme();
  const { user } = useAuth();
  if (!user) return null;
  return (
    // Keyed by user so signing in as someone else starts from a clean slate.
    <DataProvider key={user.id} userId={user.id}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="habit/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="habit/[id]" />
        <Stack.Screen name="achievements" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
      <Celebration />
    </DataProvider>
  );
}
