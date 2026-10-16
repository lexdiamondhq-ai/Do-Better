import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUITS } from '@/engine/cards';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import * as feel from '@/lib/feel';
import { hasSeen, usePrefs } from '@/lib/prefs';
import { confirmSavedEmail, confirmSwitchEmail, saveDeckWithApple, saveDeckWithEmail, SignInError, switchToApple, switchToEmail } from '@/lib/signIn';
import { useTheme } from '@/theme/ThemeProvider';
import { cardFace, fontScale, fonts, INK, radius, space, suitColors, TAP, typeScale } from '@/theme/tokens';

import { ask } from './Ask';
import { SuitGlyph } from './Suit';
import { Body, Button, Display, Label } from './ui';

/** Expo Go doesn't ship the native Apple sign-in button, so it can only be offered in a real build. */
const APPLE = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type Moment = 'showdown' | 'face' | 'you';

const TITLES: Record<Moment, string> = {
  showdown: 'Your first hand is in. Keep it.',
  face: 'A face card is worth keeping.',
  you: 'Save your deck',
};

/**
 * Asks a guest to save their deck to Sign in with Apple or an email address. Only guests see it: at
 * their first Showdown and their first face card, once each, and always on You. It is drawn as a cream
 * playing card, so it reads on the light table and on the dark Showdown and face card alike.
 */
export function SaveDeckCard({ moment }: { moment: Moment }) {
  const { guest, demo } = useAuth();
  const { seed } = useData();
  const { prefs, ready, markSeen } = usePrefs();
  const [dismissed, setDismissed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const once = moment !== 'you';
  const key = `save-${moment}`;
  const visible = guest && !demo && ready && !dismissed && !(once && hasSeen(prefs, seed, key));

  // A big moment asks once: it counts as asked when that moment closes.
  useEffect(() => {
    if (!visible || !once) return;
    return () => markSeen(seed, key);
  }, [visible, once, markSeen, seed, key]);

  if (!visible && !sheet) return null;

  return (
    <>
      {visible ? (
        <View
          style={{
            alignSelf: 'stretch',
            backgroundColor: cardFace.bg,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: cardFace.edge,
            padding: space.xl,
            gap: space.md,
            transform: [{ rotate: moment === 'you' ? '0deg' : '-1.5deg' }],
            boxShadow: '0 14px 28px rgba(0, 0, 0, 0.22)',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} aria-hidden>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {SUITS.map((s) => (
                <SuitGlyph key={s} suit={s} size={12} color={suitColors[s].glyph} />
              ))}
            </View>
            <Label color={cardFace.savedInk}>Only on this phone</Label>
          </View>
          <Display size={typeScale.display.md} color={INK} header>
            {TITLES[moment]}
          </Display>
          <Body size={typeScale.text.md} color={cardFace.savedInk}>
            Right now your deck lives on this phone only. Save it to {APPLE ? 'Sign in with Apple or your email' : 'your email'} and it’s safe on any phone, with every card and kept day.
          </Body>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Button
              label="Save my deck"
              colors={{ bg: INK, fg: cardFace.bg }}
              style={{ flex: 1 }}
              onPress={() => {
                feel.tick();
                setSheet(true);
              }}
            />
            {once ? (
              <Button
                label="Not now"
                variant="quiet"
                colors={{ bg: 'transparent', fg: cardFace.savedInk }}
                onPress={() => {
                  markSeen(seed, key);
                  setDismissed(true);
                }}
              />
            ) : null}
          </View>
        </View>
      ) : null}
      <SaveSheet visible={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

type Step = { kind: 'choose' } | { kind: 'code'; email: string } | { kind: 'switch-code'; email: string } | { kind: 'saved'; via: 'apple' | 'email' };

/** Saving a guest deck: Sign in with Apple, or an email and the 6-digit code sent to it. */
export function SaveSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={onClose}>
      {visible ? <SaveBody onClose={onClose} /> : null}
    </Modal>
  );
}

const SWITCH_WARNING = 'Switch to it? This guest deck will be deleted. Its cards and kept days don’t move across.';

function SaveBody({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'apple' | 'email' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(which: 'apple' | 'email', action: () => Promise<void>) {
    setBusy(which);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setNotice(e instanceof SignInError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const saved = (via: 'apple' | 'email') => {
    feel.ceiling();
    setStep({ kind: 'saved', via });
  };

  const apple = () =>
    run('apple', async () => {
      const result = await saveDeckWithApple();
      if (result.kind === 'saved') saved('apple');
      else if (result.kind === 'taken' && result.via === 'apple') {
        const token = result.token;
        ask('That Apple ID already has a deck', SWITCH_WARNING, [
          { text: 'Keep this deck', style: 'cancel' },
          { text: 'Switch and delete this deck', style: 'destructive', onPress: () => void run('apple', async () => void (await switchToApple(token))) },
        ]);
      }
    });

  const sendCode = () =>
    run('email', async () => {
      const address = email.trim();
      if (!/^\S+@\S+\.\S+$/.test(address)) throw new SignInError('email', 'Type your email address first.', '');
      const result = await saveDeckWithEmail(address);
      if (result.kind === 'code-sent') {
        setCode('');
        setStep({ kind: 'code', email: address });
      } else if (result.kind === 'taken') {
        ask('That email already has a deck', SWITCH_WARNING, [
          { text: 'Keep this deck', style: 'cancel' },
          {
            text: 'Switch and delete this deck',
            style: 'destructive',
            onPress: () =>
              void run('email', async () => {
                await switchToEmail(address);
                setCode('');
                setStep({ kind: 'switch-code', email: address });
              }),
          },
        ]);
      }
    });

  const confirm = () =>
    run('email', async () => {
      if (step.kind !== 'code' && step.kind !== 'switch-code') return;
      if (!/^\d{6}$/.test(code.trim())) throw new SignInError('code', 'Type the 6-digit code from the email.', '');
      if (step.kind === 'code') {
        await confirmSavedEmail(step.email, code.trim());
        saved('email');
      } else {
        // The phone moves to the other deck; this sheet closes with the guest deck it belonged to.
        await confirmSwitchEmail(step.email, code.trim());
      }
    });

  const input = {
    fontFamily: fonts.bodyBold,
    color: t.text,
    backgroundColor: t.bgRaised,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    fontSize: typeScale.text.lg,
    minHeight: 54,
    borderWidth: t.edge === 'transparent' ? 0 : 1,
    borderColor: t.edge,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: Platform.OS === 'ios' ? space.lg : insets.top + space.md, paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxl, gap: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={step.kind === 'saved' ? 'Done' : 'Close'} onPress={onClose} hitSlop={8} style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.6 : 1 })}>
            <Body weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
              {step.kind === 'saved' ? 'Done' : 'Close'}
            </Body>
          </Pressable>
        </View>

        {step.kind === 'saved' ? (
          <View style={{ gap: space.lg, alignItems: 'flex-start' }}>
            <View style={{ width: 96, height: 134, borderRadius: 14, backgroundColor: cardFace.bg, borderWidth: 1, borderColor: cardFace.edge, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }], boxShadow: '0 10px 22px rgba(0,0,0,0.2)' }} aria-hidden>
              <Display size={48} color={suitColors.spades.glyph} maxFontSizeMultiplier={fontScale.graphic}>
                ✓
              </Display>
            </View>
            <Display size={typeScale.display.xl} header>
              Saved.
            </Display>
            <Body size={typeScale.text.lg}>
              {step.via === 'apple' ? 'Sign in with Apple on any phone and your deck is there, every card and kept day.' : 'Sign in with that email on any phone and your deck is there, every card and kept day.'}
            </Body>
            <Button label="Back to the game" onPress={onClose} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : step.kind === 'choose' ? (
          <>
            <View style={{ gap: space.sm }}>
              <Label>Only on this phone</Label>
              <Display size={typeScale.display.xl} header>
                Save your deck.
              </Display>
              <Body size={typeScale.text.lg} color={t.textSecondary}>
                Same deck, same cards, same chips. It just stops living on this phone alone.
              </Body>
            </View>
            {notice ? <Notice text={notice} /> : null}
            {APPLE ? (
              <>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={t.scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.pill}
                  style={{ height: 54, opacity: busy ? 0.5 : 1 }}
                  onPress={() => {
                    if (!busy) void apple();
                  }}
                />
                <Label style={{ textAlign: 'center' }}>or with email</Label>
              </>
            ) : null}
            <TextInput
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
              onSubmitEditing={sendCode}
            />
            <Button label="Email me a code" variant={APPLE ? 'ghost' : 'primary'} busy={busy === 'email'} disabled={!!busy && busy !== 'email'} onPress={sendCode} />
          </>
        ) : (
          <>
            <View style={{ gap: space.sm }}>
              <Label>{step.kind === 'code' ? 'Saving your deck' : 'Switching decks'}</Label>
              <Display size={typeScale.display.xl} header>
                Check your email.
              </Display>
              <Body size={typeScale.text.lg} color={t.textSecondary}>{`We sent a 6-digit code to ${step.email}.`}</Body>
            </View>
            {notice ? <Notice text={notice} /> : null}
            <TextInput
              key={step.kind}
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
              onSubmitEditing={confirm}
            />
            <Button label={step.kind === 'code' ? 'Save my deck' : 'Switch and delete this deck'} busy={busy === 'email'} onPress={confirm} />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setStep({ kind: 'choose' });
                setNotice(null);
              }}
              style={{ minHeight: TAP, alignItems: 'center', justifyContent: 'center' }}
            >
              <Body size={typeScale.text.md} weight="bold" color={t.textSecondary}>
                Use another email
              </Body>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Notice({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View accessibilityLiveRegion="polite" role="alert" style={{ backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg }}>
      <Body size={typeScale.text.md} weight="bold">
        {text}
      </Body>
    </View>
  );
}
