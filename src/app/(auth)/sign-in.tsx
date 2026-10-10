import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Button, Display, Label } from '@/components/ui';
import { sendEmailCode, signInAsGuest, signInWithApple, verifyEmailCode } from '@/lib/signIn';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, fonts, radius, space, type CardColor } from '@/theme/tokens';

const FAN: { color: CardColor; name: string; rotate: number; x: number }[] = [
  { color: 'sky', name: 'Walk', rotate: -14, x: -70 },
  { color: 'pine', name: 'Read', rotate: -4, x: -20 },
  { color: 'sun', name: 'Write', rotate: 6, x: 30 },
  { color: 'tomato', name: 'Do Better', rotate: 14, x: 70 },
];

/** Expo Go doesn't ship the native Apple sign-in button, so it can only be offered in a real build. */
const APPLE = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Apple on iOS, or a 6-digit email code anywhere. The Gate moves the user on once a session exists. */
export default function SignIn() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const input = { fontFamily: fonts.bodyBold, color: t.text, backgroundColor: t.bgRaised, borderRadius: radius.pill, paddingVertical: space.lg, paddingHorizontal: space.xl, fontSize: 17 };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.xl, gap: space.lg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} accessible={false} importantForAccessibility="no-hide-descendants">
          {FAN.map((card) => {
            const c = cardColors[card.color];
            return (
              <View
                key={card.name}
                style={{
                  position: 'absolute',
                  width: 170,
                  height: 240,
                  borderRadius: radius.lg + 4,
                  backgroundColor: c.bg,
                  padding: space.lg,
                  justifyContent: 'space-between',
                  transform: [{ translateX: card.x }, { rotate: `${card.rotate}deg` }],
                  shadowColor: '#000',
                  shadowOpacity: 0.18,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 10 },
                }}
              >
                <Body weight="heavy" size={13} color={c.ink}>↑</Body>
                <Display size={card.name.length > 6 ? 30 : 34} color={c.ink}>{card.name}</Display>
                <Body weight="heavy" size={13} color={c.ink}>↓</Body>
              </View>
            );
          })}
        </View>

        <View style={{ gap: space.sm }}>
          <Display size={44}>Keep the Floor.{'\n'}Reach for the Ceiling.</Display>
          <Body color={t.textSecondary}>A habit deck for people who want to get better without starting over every Monday.</Body>
        </View>

        {__DEV__ ? <Button label="Try it as a guest" busy={busy} onPress={() => run(signInAsGuest)} /> : null}

        {APPLE ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={t.scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.pill}
            style={{ height: 54 }}
            onPress={() => run(signInWithApple)}
          />
        ) : null}

        {APPLE || __DEV__ ? <Label style={{ textAlign: 'center' }}>or with email</Label> : null}

        {codeSent ? (
          <TextInput style={input} value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={t.textFaint} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} />
        ) : (
          <TextInput style={input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={t.textFaint} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
        )}

        <Button
          label={codeSent ? 'Sign in' : 'Email me a code'}
          variant={APPLE || __DEV__ ? 'ghost' : 'primary'}
          busy={busy}
          onPress={() =>
            run(async () => {
              if (codeSent) await verifyEmailCode(email.trim(), code.trim());
              else {
                await sendEmailCode(email.trim());
                setCodeSent(true);
              }
            })
          }
        />

        {error ? <Body size={14} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }}>{error}</Body> : null}
      </View>
    </KeyboardAvoidingView>
  );
}
