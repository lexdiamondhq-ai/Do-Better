import { useSyncExternalStore } from 'react';
import { Alert, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Display } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, suitColors } from '@/theme/tokens';

export type AskButton = { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void };

type Question = { title: string; message?: string; buttons: AskButton[] };

/**
 * A question with choices. On a phone it is the system alert. In a browser the system alert does
 * nothing, so the same question opens as a sheet drawn by `AskHost`.
 */
export function ask(title: string, message?: string, buttons?: AskButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  current = { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] };
  listeners.forEach((l) => l());
}

let current: Question | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const close = () => {
  current = null;
  listeners.forEach((l) => l());
};

/** Draws the open question in a browser. Mount once, near the root. */
export function AskHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const q = useSyncExternalStore(subscribe, () => current, () => null);
  if (!q) return null;
  const cancel = q.buttons.find((b) => b.style === 'cancel');
  const choose = (b: AskButton) => {
    close();
    b.onPress?.();
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={() => (cancel ? choose(cancel) : close())}>
      <Pressable accessibilityLabel="Close" onPress={() => (cancel ? choose(cancel) : close())} style={{ flex: 1, backgroundColor: 'rgba(10, 8, 14, 0.55)', justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="alert"
          onPress={() => {}}
          style={{ backgroundColor: t.bgRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.md }}
        >
          <Display size={24}>{q.title}</Display>
          {q.message ? <Body color={t.textSecondary}>{q.message}</Body> : null}
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {q.buttons.map((b) => (
              <Pressable
                key={b.text}
                accessibilityRole="button"
                onPress={() => choose(b)}
                style={({ pressed }) => ({
                  borderRadius: radius.pill,
                  paddingVertical: space.lg,
                  paddingHorizontal: space.xl,
                  alignItems: 'center',
                  backgroundColor: b.style === 'cancel' ? 'transparent' : t.surface,
                  borderWidth: b.style === 'cancel' ? 1.5 : 0,
                  borderColor: t.border,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Body weight="heavy" color={b.style === 'destructive' ? suitColors.hearts.glyph : t.text}>{b.text}</Body>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
