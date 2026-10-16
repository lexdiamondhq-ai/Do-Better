import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips } from '@/components/Chips';
import { CardSlot, PlayingCard, type CardFace } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Display, Label } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dealMeIn, sendEmailCode, SignInError, signInWithApple, verifyEmailCode } from '@/lib/signIn';
import { useTheme } from '@/theme/ThemeProvider';
import { SUITS } from '@/engine/cards';
import { cardColors, fontScale, fonts, radius, space, suitColors, TAP, typeScale, WHITE } from '@/theme/tokens';

/** Expo Go doesn't ship the native Apple sign-in button, so it can only be offered in a real build. */
const APPLE = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type Mode = 'start' | 'sign-in';

/**
 * The first screen. "Deal me in" starts a deck with no account; the demo is one tap away; a returning
 * player signs in with Apple or a 6-digit email code. The Gate moves on once a session exists.
 */
export default function SignIn() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { startDemo } = useAuth();
  const [mode, setMode] = useState<Mode>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<'deal' | 'apple' | 'email' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const keyboard = useKeyboardShown();
  const compact = height < 720;

  async function run(which: 'deal' | 'apple' | 'email', action: () => Promise<unknown>) {
    setBusy(which);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      const problem = e instanceof SignInError ? e : null;
      setNotice(problem?.message || 'Something went wrong. Try again.');
      // With guest decks switched off, the only way in is an account: show it.
      if (problem?.problem === 'guest-off') setMode('sign-in');
    } finally {
      setBusy(null);
    }
  }

  function emailStep() {
    return run('email', async () => {
      const address = email.trim();
      if (!codeSent) {
        if (!/^\S+@\S+\.\S+$/.test(address)) throw new SignInError('email', 'Type your email address first.', '');
        await sendEmailCode(address);
        setCodeSent(true);
        return;
      }
      if (!/^\d{6}$/.test(code.trim())) throw new SignInError('code', 'Type the 6-digit code from the email.', '');
      await verifyEmailCode(address, code.trim());
    });
  }

  const input = {
    fontFamily: fonts.bodyBold,
    color: t.text,
    backgroundColor: t.bgRaised,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    fontSize: typeScale.text.lg,
    minHeight: 54,
  };

  // Marked with a red "!", so a problem never looks like one more field to fill in or a button to press.
  const noticeView = notice ? (
    <View accessibilityLiveRegion="polite" role="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg, borderWidth: 1.5, borderColor: t.scheme === 'dark' ? cardColors.tomato.onDark : cardColors.tomato.bg }}>
      <View aria-hidden style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: cardColors.tomato.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Body size={14} weight="heavy" color={WHITE} maxFontSizeMultiplier={fontScale.graphic}>
          !
        </Body>
      </View>
      <Body size={typeScale.text.md} weight="bold" style={{ flex: 1 }}>
        {notice}
      </Body>
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* It fills the screen, and scrolls only when large text or the keyboard leaves too little room. */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.xl, gap: compact ? space.md : space.lg }}
      >
        {mode === 'sign-in' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => {
              setMode('start');
              setNotice(null);
            }}
            hitSlop={8}
            style={{ minHeight: TAP, alignSelf: 'flex-start', justifyContent: 'center' }}
          >
            <Body weight="heavy" color={t.textSecondary}>
              ‹ Back
            </Body>
          </Pressable>
        ) : (
          <Wordmark />
        )}

        {/* While typing, the email field and its button get the room. */}
        {keyboard && mode === 'sign-in' ? null : <HeroLoop calm={mode === 'sign-in'} />}

        {mode === 'start' ? (
          <>
            <View style={{ gap: space.sm }}>
              <Display size={compact ? 36 : typeScale.display.xl} header>
                {'Miss a day.\nKeep everything you’ve earned.'}
              </Display>
              <Body size={compact ? typeScale.text.md : typeScale.text.lg}>Every habit you keep deals a playing card. Every Sunday, your week plays as a poker hand. No streaks to break, ever.</Body>
            </View>
            {noticeView}
            <View style={{ gap: space.sm }}>
              <Button label="Deal me in" busy={busy === 'deal'} disabled={!!busy && busy !== 'deal'} hint="Starts your own deck. No account needed yet." onPress={() => run('deal', dealMeIn)} />
              <Button label="Play a demo deck" variant="ghost" hint="A made-up player ten weeks in. Nothing is saved." onPress={startDemo} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Already have a deck? Sign in"
                onPress={() => {
                  setMode('sign-in');
                  setNotice(null);
                }}
                style={({ pressed }) => ({ minHeight: TAP, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
              >
                <Body weight="bold" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
                  Already have a deck?{' '}
                  <Body weight="heavy" maxFontSizeMultiplier={fontScale.chrome} style={{ textDecorationLine: 'underline' }}>
                    Sign in
                  </Body>
                </Body>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={{ gap: space.sm }}>
              <Label>Welcome back</Label>
              <Display size={compact ? 32 : 40} header>
                Pick up your deck.
              </Display>
              <Body size={typeScale.text.md} color={t.textSecondary}>
                {APPLE ? 'Use the Apple ID or the email you saved your deck with.' : 'Use the email you saved your deck with. We’ll send a 6-digit code.'}
              </Body>
            </View>
            {noticeView}
            <View style={{ gap: space.sm }}>
              {APPLE ? (
                <>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={t.scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={radius.pill}
                    style={{ height: 54 }}
                    onPress={() => run('apple', signInWithApple)}
                  />
                  <Label style={{ textAlign: 'center', paddingVertical: space.xs }}>or with email</Label>
                </>
              ) : null}
              {codeSent ? (
                <TextInput
                  key="code"
                  style={input}
                  value={code}
                  onChangeText={setCode}
                  accessibilityLabel="6-digit code"
                  placeholder="6-digit code"
                  placeholderTextColor={t.textFaint}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  keyboardAppearance={t.scheme}
                  maxLength={6}
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={emailStep}
                />
              ) : (
                <TextInput
                  key="email"
                  style={input}
                  value={email}
                  onChangeText={setEmail}
                  accessibilityLabel="Email"
                  placeholder="Email"
                  placeholderTextColor={t.textFaint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardAppearance={t.scheme}
                  returnKeyType="send"
                  onSubmitEditing={emailStep}
                />
              )}
              <Button label={codeSent ? 'Sign in' : 'Email me a code'} variant={APPLE ? 'ghost' : 'primary'} busy={busy === 'email'} disabled={!!busy && busy !== 'email'} onPress={emailStep} />
              {codeSent ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setCodeSent(false);
                    setCode('');
                    setNotice(null);
                  }}
                  style={{ minHeight: TAP, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Body size={typeScale.text.md} weight="bold" color={t.textSecondary}>{`Code sent to ${email.trim()}. Use another email`}</Body>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Whether the on-screen keyboard is up. The web has none to report, so it stays false there. */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/** The name, with the four suits that stand for the four parts of you. */
function Wordmark() {
  const t = useTheme();
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Do Better" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 }}>
      <View style={{ flexDirection: 'row', gap: 3 }} aria-hidden>
        {SUITS.map((suit) => (
          <SuitGlyph key={suit} suit={suit} size={16} color={t.scheme === 'dark' ? suitColors[suit].bright : suitColors[suit].glyph} />
        ))}
      </View>
      <Display size={typeScale.display.sm} maxFontSizeMultiplier={fontScale.chrome}>
        Do Better
      </Display>
    </View>
  );
}

/** The art is drawn on a 310 by 300 stage, then scaled to whatever room the screen leaves it. */
const STAGE = { w: 310, h: 300 };
const LOOP_MS = 6400;
const FAN_CARD = 92;
const FAN_STEP = 52;
const FAN_H = Math.round((FAN_CARD * 104) / 74);
const FAN: (CardFace | null)[] = [
  { kind: 'card', rank: 5, suit: 'spades' },
  { kind: 'card', rank: 6, suit: 'hearts' },
  null,
  { kind: 'card', rank: 8, suit: 'diamonds' },
  { kind: 'card', rank: 9, suit: 'spades' },
];
const SEVEN: CardFace = { kind: 'card', rank: 7, suit: 'clubs' };
const HABIT = { w: 140, h: 190 };
/** Where each fan card sits: an arc of five, the middle slot left open for today's card. */
const slot = (i: number) => {
  const off = i - 2;
  return { left: (STAGE.w - (FAN_CARD + FAN_STEP * 4)) / 2 + i * FAN_STEP, top: STAGE.h - FAN_H - 16 + 4 * off * off, rotate: off * 7 };
};
/** How far the dealt card drops from where the habit card turned over into its open slot. */
const DROP = slot(2).top - (HABIT.h / 2 + 56 - FAN_H / 2);

/**
 * The game in one loop: a Read card is swiped down for its Floor, turns over into the 7 of Clubs and
 * drops into the gap in a hand, which makes a Straight. It measures its box and scales to fit, so
 * nothing is clipped on a small phone. Still, on the finished hand, under Reduce Motion.
 */
function HeroLoop({ calm }: { calm?: boolean }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const p = useSharedValue(0.7);

  useEffect(() => {
    if (reduced || calm) {
      cancelAnimation(p);
      p.set(withTiming(0.7, { duration: 300 }));
      return;
    }
    p.set(0);
    p.set(withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(p);
  }, [reduced, calm, p]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
  };
  const scale = box ? Math.max(0.35, Math.min(1.3, box.w / STAGE.w, box.h / STAGE.h)) : 0;

  return (
    <View onLayout={onLayout} style={{ flex: 1, minHeight: 120 }} aria-hidden accessible={false} importantForAccessibility="no-hide-descendants">
      {box ? (
        <View style={{ position: 'absolute', width: STAGE.w, height: STAGE.h, left: (box.w - STAGE.w) / 2, top: (box.h - STAGE.h) / 2, transform: [{ scale }] }}>
          <View style={{ position: 'absolute', left: -14, right: -14, top: STAGE.h - FAN_H - 40, height: FAN_H + 46, borderRadius: radius.pill, backgroundColor: t.surface }} />
          <Fan p={p} dashed={t.dashed} />
          <Caption p={p} />
          <Habit p={p} />
          <Dealt p={p} />
        </View>
      ) : null}
    </View>
  );
}

function Fan({ p, dashed }: { p: SharedValue<number>; dashed: string }) {
  const bounce = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(p.get(), [0.54, 0.57, 0.61], [0, -9, 0], 'clamp') }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: STAGE.w, height: STAGE.h }, bounce]}>
      {FAN.map((face, i) => {
        const s = slot(i);
        const at = { position: 'absolute' as const, left: s.left, top: s.top, transform: [{ rotate: `${s.rotate}deg` }] };
        return face ? (
          <PlayingCard key={i} face={face} size="md" width={FAN_CARD} style={at} />
        ) : (
          <CardSlot key={i} size="md" color={dashed} style={[at, { width: FAN_CARD, height: FAN_H }]}>
            <SuitGlyph suit="clubs" size={26} color={dashed} />
          </CardSlot>
        );
      })}
    </Animated.View>
  );
}

/** "Straight" and what it pays, once the hand comes together. */
function Caption({ p }: { p: SharedValue<number> }) {
  const t = useTheme();
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0.55, 0.59, 0.88, 0.94], [0, 1, 1, 0], 'clamp'),
    transform: [{ scale: interpolate(p.get(), [0.55, 0.6, 0.63], [0.4, 1.08, 1], 'clamp') }, { rotate: '-3deg' }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 44, left: 0, right: 0, alignItems: 'center' }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.raised, borderRadius: radius.pill, paddingVertical: space.md, paddingLeft: space.xl, paddingRight: space.lg, borderWidth: t.edge === 'transparent' ? 0 : 1, borderColor: t.edge }}>
        <Display size={30} color={t.onRaised} maxFontSizeMultiplier={fontScale.graphic}>
          Straight
        </Display>
        <Chips value={100} size={22} pill />
      </View>
    </Animated.View>
  );
}

/** The habit card, swiped down for its Floor, then turning over. */
function Habit({ p }: { p: SharedValue<number> }) {
  const c = cardColors.lilac;
  const card = useAnimatedStyle(() => {
    const v = p.get();
    return {
      opacity: interpolate(v, [0, 0.07], [0, 1], 'clamp'),
      transform: [
        { translateY: interpolate(v, [0, 0.07, 0.16, 0.3], [-26, 0, 0, 56], 'clamp') },
        { rotate: `${interpolate(v, [0.16, 0.3], [-5, 3], 'clamp')}deg` },
        { scaleX: interpolate(v, [0.31, 0.36], [1, 0], 'clamp') },
      ],
    };
  });
  const stamp = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.19, 0.26], [0, 1], 'clamp') }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: (STAGE.w - HABIT.w) / 2, top: 0, width: HABIT.w, height: HABIT.h, borderRadius: 24, backgroundColor: c.bg, padding: 16, justifyContent: 'space-between', boxShadow: '0 12px 24px rgba(23, 18, 31, 0.22)' },
        card,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <SuitGlyph suit="clubs" size={13} color={c.ink} />
        <Body size={11} weight="heavy" color={c.ink} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1 }}>
          MIND
        </Body>
      </View>
      <View style={{ gap: 2 }}>
        <Body size={13} weight="heavy" color={c.ink} maxFontSizeMultiplier={fontScale.graphic}>
          ↑ 20 pages
        </Body>
        <Display size={44} color={c.ink} maxFontSizeMultiplier={fontScale.graphic}>
          Read
        </Display>
        <Body size={13} weight="heavy" color={c.ink} maxFontSizeMultiplier={fontScale.graphic}>
          ↓ 1 page
        </Body>
      </View>
      <Animated.View style={[{ position: 'absolute', top: 40, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, transform: [{ rotate: '-9deg' }] }, stamp]}>
        <Display size={22} color={c.ink} maxFontSizeMultiplier={fontScale.graphic}>
          FLOOR
        </Display>
      </Animated.View>
    </Animated.View>
  );
}

/** The day's card: it turns over where the habit card was and drops into the open slot. */
function Dealt({ p }: { p: SharedValue<number> }) {
  const s = slot(2);
  const style = useAnimatedStyle(() => {
    const v = p.get();
    return {
      opacity: interpolate(v, [0.355, 0.36, 0.9, 0.97], [0, 1, 1, 0], 'clamp'),
      transform: [{ translateY: interpolate(v, [0.42, 0.52, 0.545], [0, DROP + 6, DROP], 'clamp') }, { scaleX: interpolate(v, [0.36, 0.42], [0, 1], 'clamp') }],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: s.left, top: s.top - DROP }, style]}>
      <PlayingCard face={SEVEN} size="md" width={FAN_CARD} />
    </Animated.View>
  );
}
