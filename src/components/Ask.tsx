import { useSyncExternalStore } from 'react';
import { ActionSheetIOS, Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Display } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, fontScale, hasEdge, radius, space, TAP } from '@/theme/tokens';

/**
 * One choice. `cancel` is the way out, drawn quietest. `isPreferred` marks the one main next step: it is
 * the solid pill in the browser sheet and the bold button in an iOS alert. An iOS action sheet can't mark
 * a choice, so a menu with a preferred choice opens as an alert there instead. `quiet` draws a destructive
 * choice as red words on an outline instead of a solid red pill, for one that is there but not the point
 * (Undo on a kept card's sheet). iOS draws destructive choices in red words already.
 */
export type AskButton = { text: string; style?: 'cancel' | 'destructive'; isPreferred?: boolean; quiet?: boolean; onPress?: () => void };

/** Red words that keep 4.5:1 on the sheet in either scheme. */
const QUIET_RED = { light: '#B5301A', dark: '#FF8A6E' } as const;

type Question = { title: string; message?: string; buttons: AskButton[] };

/**
 * A question with choices. On a phone it is the system alert, or the system action sheet when it
 * offers three or more choices (that's a menu, and iOS puts menus at the bottom, under your thumb).
 * In a browser the system alert does nothing, so the same question opens as a sheet drawn by `AskHost`.
 */
export function ask(title: string, message?: string, buttons?: AskButton[]) {
  if (Platform.OS === 'ios' && (buttons?.length ?? 0) >= 3) return menu(title, message, buttons ?? []);
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  open({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
}

/**
 * A menu of things to do: the action sheet on iOS, an alert on Android, the `AskHost` sheet in a
 * browser. A Cancel is added if the buttons have none, so the menu can always be closed. A menu with a
 * preferred choice is an alert on iOS too, so that choice can be the bold one.
 */
export function menu(title: string, message: string | undefined, buttons: AskButton[]) {
  const all = buttons.some((b) => b.style === 'cancel') ? buttons : [...buttons, { text: 'Cancel', style: 'cancel' as const }];
  if (Platform.OS === 'ios' && !all.some((b) => b.isPreferred)) {
    const destructive = all.flatMap((b, i) => (b.style === 'destructive' ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: all.map((b) => b.text),
        cancelButtonIndex: all.findIndex((b) => b.style === 'cancel'),
        destructiveButtonIndex: destructive.length ? destructive : undefined,
      },
      (i) => all[i]?.onPress?.(),
    );
    return;
  }
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, all, { cancelable: true });
    return;
  }
  open({ title, message, buttons: all });
}

let current: Question | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const open = (q: Question) => {
  current = q;
  listeners.forEach((l) => l());
};
const close = () => {
  current = null;
  listeners.forEach((l) => l());
};

/**
 * Draws the open question in a browser. Mount once, near the root. The dimmed backdrop sits beside the
 * sheet rather than around it, so a screen reader meets the sheet as a dialog, not as part of a Close
 * button.
 */
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
  const dismiss = () => (cancel ? choose(cancel) : close());
  return (
    <Modal transparent animationType="fade" onRequestClose={dismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={dismiss} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10, 8, 14, 0.55)' }]} />
        <View
          role="dialog"
          aria-modal
          aria-label={q.title}
          accessibilityViewIsModal
          style={{
            backgroundColor: t.bgRaised,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderTopWidth: hasEdge(t) ? 1 : 0,
            borderColor: t.edge,
            padding: space.xl,
            paddingBottom: insets.bottom + space.xl,
            gap: space.md,
          }}
        >
          <Display size={24} header maxFontSizeMultiplier={fontScale.chrome}>
            {q.title}
          </Display>
          {q.message ? <Body color={t.textSecondary}>{q.message}</Body> : null}
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {q.buttons.map((b) => {
              const destructive = b.style === 'destructive';
              const isCancel = b.style === 'cancel';
              const preferred = !!b.isPreferred && !destructive && !isCancel;
              const quietRed = destructive && !!b.quiet;
              const red = QUIET_RED[t.scheme];
              return (
                <Pressable
                  key={b.text}
                  accessibilityRole="button"
                  accessibilityLabel={b.text}
                  onPress={() => choose(b)}
                  style={({ pressed }) => ({
                    minHeight: TAP,
                    borderRadius: radius.pill,
                    paddingVertical: space.lg,
                    paddingHorizontal: space.xl,
                    alignItems: 'center',
                    justifyContent: 'center',
                    // A destructive choice is a solid tomato pill: red text on a pale surface can't keep 4.5:1 on every table.
                    // The preferred choice is the solid ink pill, like a primary button, so the main next step stands out.
                    backgroundColor: isCancel || quietRed ? 'transparent' : destructive ? cardColors.tomato.bg : preferred ? t.text : t.surface,
                    borderWidth: isCancel || quietRed ? 1.5 : 0,
                    borderColor: quietRed ? red : t.border,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Body weight="heavy" color={quietRed ? red : destructive ? cardColors.tomato.ink : preferred ? t.bg : t.text} maxFontSizeMultiplier={fontScale.chrome} style={{ textAlign: 'center' }}>
                    {b.text}
                  </Body>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
