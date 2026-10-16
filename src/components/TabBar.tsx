import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as feel from '@/lib/feel';
import { playSound } from '@/lib/sound';
import { useTheme } from '@/theme/ThemeProvider';
import { fontScale, radius, space, TAP } from '@/theme/tokens';

import { Body } from './ui';

const LABELS: Record<string, string> = { index: 'Today', hands: 'Hands', you: 'You', playbook: 'Playbook' };

/**
 * A floating pill in the table's text colour, with a thin rail of the accent round it. The active tab
 * is a chip of the table inside it. Tapping the tab you're on scrolls its page back to the top.
 *
 * Labels grow only a little with the phone's text size, so all four always fit; at the largest sizes
 * a long press shows the label large (the Large Content Viewer), like the system tab bar.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, space.md), paddingHorizontal: space.xl }}>
      <View
        accessibilityRole="tabbar"
        style={{
          flexDirection: 'row',
          backgroundColor: t.text,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: t.accent,
          padding: 5,
          gap: 4,
          boxShadow: '0 8px 24px rgba(10, 8, 14, 0.22)',
        }}
      >
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const label = LABELS[route.name] ?? route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              accessibilityShowsLargeContentViewer
              accessibilityLargeContentTitle={label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (event.defaultPrevented) return;
                feel.tick();
                if (!focused) {
                  playSound('tap');
                  navigation.navigate(route.name);
                }
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: TAP,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 11,
                borderRadius: radius.pill,
                backgroundColor: focused ? t.bg : 'transparent',
                opacity: pressed && !focused ? 0.7 : 1,
              })}
            >
              <Body weight="heavy" size={13} numberOfLines={1} color={focused ? t.text : t.bg} maxFontSizeMultiplier={fontScale.tabs}>
                {label}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
