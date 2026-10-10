import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Placeholder home until the check-in screen lands. */
export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + space.xl, paddingHorizontal: space.xl, gap: space.md }}>
      <Text style={{ color: t.text, fontSize: 28, fontWeight: '700' }}>Do Better</Text>
      <Text style={{ color: t.textSecondary, fontSize: 16 }}>Signed in as {user?.email ?? 'you'}. Habits come next.</Text>
      <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()}>
        <Text style={{ color: t.accent, fontSize: 16, fontWeight: '600' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
