import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Chip, Display, Field, Label } from '@/components/ui';
import { PLAN_WHENS, PLAN_WORDS_MAX, planLine, planThens, type Plan } from '@/engine/comeback';
import { useData } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { usePlans } from '@/lib/plans';
import { usePrefs } from '@/lib/prefs';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, fontScale, fonts, INK, radius, space, TAP } from '@/theme/tokens';

/** "Something else": the chip that opens a line for the player's own words. */
const OWN = 'own';

/**
 * Your plan for a card's next Comeback, opened with `habit` from a kept Comeback's receipt. First what
 * got in the way (five common things, or your own words), then what you'll do next time: only ever a keep,
 * the card's First move or its Floor. One plan per card, kept on this phone; a new one replaces it. The
 * card's next Comeback leads with it, as the sheet shows while you choose.
 */
export default function PlanSheet() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { seed, today } = useData();
  const { setPlan } = usePrefs();
  const plans = usePlans();
  const { habit: habitId } = useLocalSearchParams<{ habit?: string }>();
  const view = deck?.cards.find((c) => c.habit.id === habitId) ?? null;
  const [when, setWhen] = useState<string | null>(null);
  const [words, setWords] = useState('');
  const [then, setThen] = useState<Plan['then'] | null>(null);

  const close = (
    <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" style={{ minHeight: TAP, justifyContent: 'center' }}>
      <Body weight="heavy" color={t.textSecondary}>
        Close
      </Body>
    </Pressable>
  );

  if (!view) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: space.xl, paddingTop: space.xl + space.sm, gap: space.lg }}>
        <View style={{ alignItems: 'flex-end' }}>{close}</View>
        <Display size={34} header>
          Plan for next time
        </Display>
      </View>
    );
  }

  const habit = view.habit;
  const c = cardColors[habit.color];
  const saved = plans[habit.id] ?? null;
  const thens = planThens(habit);
  const ownWords = words.trim();
  const reason = when === OWN ? ownWords : when;
  const plan: Plan | null = reason && then ? { when: reason, then, made: today } : null;

  const pickWhen = (key: string) => {
    feel.tick();
    setWhen(key);
  };
  const pickThen = (key: Plan['then']) => {
    feel.tick();
    setThen(key);
  };
  const keep = () => {
    if (!plan) return;
    setPlan(seed, habit.id, plan);
    feel.tick();
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: space.xl, paddingTop: space.xl + space.sm, paddingBottom: space.xxl, gap: space.xl }}
      >
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <SuitGlyph suit={habit.suit} size={14} color={t.textSecondary} />
              <Label numberOfLines={1} style={{ flexShrink: 1 }}>
                {habit.name}
              </Label>
            </View>
            {close}
          </View>
          <Display size={34} header>
            Plan for next time
          </Display>
          {saved ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.pill, borderWidth: 1.5, borderColor: t.border, paddingVertical: space.sm, paddingHorizontal: space.md }}>
              <Body size={14} weight="bold" color={t.textSecondary} numberOfLines={2} style={{ flexShrink: 1 }}>
                {`Your plan now: ${planLine(saved, habit)}`}
              </Body>
            </View>
          ) : null}
        </View>

        <Step n={1} title="What got in the way?">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {PLAN_WHENS.map((w) => (
              <Chip key={w.key} label={w.chip} active={when === w.key} color={c.bg} ink={c.ink} onPress={() => pickWhen(w.key)} />
            ))}
            <Chip label="Something else" active={when === OWN} color={c.bg} ink={c.ink} onPress={() => pickWhen(OWN)} />
          </View>
          {when === OWN ? (
            <Field
              label="Something else"
              value={words}
              onChangeText={setWords}
              autoFocus
              maxLength={PLAN_WORDS_MAX}
              autoCapitalize="sentences"
              autoCorrect
              returnKeyType="done"
              blurOnSubmit
            />
          ) : null}
        </Step>

        <Step n={2} title="Next time, I’ll…">
          <View style={{ gap: space.sm }}>
            {thens.map((o) => (
              <Then key={o.key} label={o.label} arrow={o.key === 'first' ? '✓' : '↓'} active={then === o.key} bg={c.bg} ink={c.ink} onPress={() => pickThen(o.key)} />
            ))}
          </View>
        </Step>

        {plan ? <Preview line={planLine(plan, habit)} accent={c.onDark} first={plan.then === 'first' && !!habit.twoMinuteLabel?.trim()} /> : null}

        <View style={{ gap: space.md }}>
          <Button label="Keep this plan" onPress={keep} disabled={!plan} />
          <Body size={13} weight="semi" color={t.textSecondary} style={{ textAlign: 'center', paddingHorizontal: space.lg }}>
            Saved on this phone. One plan per card; a new one replaces it.
          </Body>
        </View>
      </ScrollView>
    </View>
  );
}

/** A numbered step of the sheet. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View aria-hidden style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.text, alignItems: 'center', justifyContent: 'center' }}>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.display, fontSize: 15, color: t.bg }}>
            {n}
          </Text>
        </View>
        <Display size={22} header style={{ flexShrink: 1 }}>
          {title}
        </Display>
      </View>
      {children}
    </View>
  );
}

/** One of the two keeps next time can be: a big button that fills with the card's colour when chosen. */
function Then({ label, arrow, active, bg, ink, onPress }: { label: string; arrow: string; active: boolean; bg: string; ink: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 64,
        borderRadius: radius.lg,
        borderWidth: 2,
        borderColor: active ? bg : t.border,
        backgroundColor: active ? bg : t.bgRaised,
        padding: space.sm,
        paddingRight: space.lg,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View aria-hidden style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: active ? ink : withAlpha(t.text, 0.08), alignItems: 'center', justifyContent: 'center' }}>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: active ? bg : t.text }}>
          {arrow}
        </Text>
      </View>
      <Body weight="heavy" size={16} color={active ? ink : t.text} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ flex: 1, lineHeight: 21 }}>
        {label}
      </Body>
    </Pressable>
  );
}

/** The plan as the card's next Comeback will lead with it: the same dashed box, on the card's dark side. */
function Preview({ line, accent, first }: { line: string; accent: string; first: boolean }) {
  const t = useTheme();
  return (
    <View aria-hidden style={{ backgroundColor: t.raised, borderRadius: radius.card, padding: space.md, borderWidth: 1, borderColor: t.scheme === 'light' ? withAlpha(INK, 0.4) : t.edge, transform: [{ rotate: '-1deg' }] }}>
      <View style={{ gap: 6, backgroundColor: withAlpha(accent, 0.12), borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: withAlpha(accent, 0.7), padding: space.md, paddingLeft: space.lg }}>
        <Label color={accent} maxFontSizeMultiplier={fontScale.chrome}>
          Your plan
        </Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text numberOfLines={3} maxFontSizeMultiplier={fontScale.chrome} style={{ flex: 1, fontFamily: fonts.display, fontSize: 22, lineHeight: 24, color: t.onRaised }}>
            {line}
          </Text>
          {first ? (
            <View style={{ borderRadius: radius.pill, backgroundColor: accent, paddingVertical: space.sm + 2, paddingHorizontal: space.lg }}>
              <Body weight="heavy" size={15} color={INK} maxFontSizeMultiplier={fontScale.chrome}>
                Done it
              </Body>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
