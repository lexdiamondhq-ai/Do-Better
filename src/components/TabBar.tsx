import type { BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Body } from './ui';

const LABELS: Record<string, string> = { index: 'Today', hands: 'Hands', you: 'You', playbook: 'Playbook' };

/** A floating ink pill. The active tab is a raised chip inside it. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, space.md), paddingHorizontal: space.xl }}>
      <View style={{ flexDirection: 'row', backgroundColor: t.accent, borderRadius: radius.pill, padding: 6, gap: 4 }}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  Haptics.selectionAsync();
                  navigation.navigate(route.name);
                }
              }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.pill, backgroundColor: focused ? t.bg : 'transparent' }}
            >
              <Body weight="heavy" size={13} color={focused ? t.text : t.onAccent}>{LABELS[route.name] ?? route.name}</Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
