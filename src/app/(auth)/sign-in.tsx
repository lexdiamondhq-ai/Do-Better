import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sendEmailCode, signInWithApple, verifyEmailCode } from '@/lib/signIn';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

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

  const input = { color: t.text, backgroundColor: t.bgRaised, borderColor: t.border, borderWidth: 1, borderRadius: radius.md, padding: space.lg, fontSize: 17 };

  return (
    <View style={{ flex: 1, paddingTop: insets.top + space.xxl, paddingHorizontal: space.xl, gap: space.lg }}>
      <Text style={{ color: t.text, fontSize: 32, fontWeight: '700' }}>Do Better</Text>
      <Text style={{ color: t.textSecondary, fontSize: 17 }}>Keep the Floor. Reach for the Ceiling.</Text>

      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={t.scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radius.md}
          style={{ height: 50 }}
          onPress={() => run(signInWithApple)}
        />
      ) : null}

      {codeSent ? (
        <TextInput style={input} value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={t.textSecondary} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} />
      ) : (
        <TextInput style={input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={t.textSecondary} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      )}

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => run(async () => {
          if (codeSent) await verifyEmailCode(email.trim(), code.trim());
          else {
            await sendEmailCode(email.trim());
            setCodeSent(true);
          }
        })}
        style={{ backgroundColor: t.accent, borderRadius: radius.md, padding: space.lg, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={{ color: t.onAccent, fontSize: 17, fontWeight: '600' }}>{codeSent ? 'Sign in' : 'Email me a code'}</Text>}
      </Pressable>

      {error ? <Text style={{ color: t.textSecondary, fontSize: 15 }}>{error}</Text> : null}
    </View>
  );
}
