import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EXAMPLES, HandFan } from '@/components/HandFan';
import { ask } from '@/components/Ask';
import { PlayingCard } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { SwipeCard } from '@/components/SwipeCard';
import { Body, Button, Chip, Display, Label } from '@/components/ui';
import { SUIT_INFO, SUITS, type Suit } from '@/engine/cards';
import { PRINCIPLES, RECIPES, suggestRecipes, type Recipe } from '@/engine/playbook';
import { useData } from '@/lib/data';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, fonts, radius, space, suitColors, type CardColor } from '@/theme/tokens';

type Art = 'deal' | 'hand' | 'suits';

type Intro = { color: CardColor | 'back'; eyebrow: string; title: string; body: string; hint: string; art?: Art };

const INTRO: Intro[] = [
  {
    color: 'tomato',
    eyebrow: 'Do Better',
    title: 'Every habit is a card.',
    body: 'Each card has a Ceiling, what a great day looks like, and a Floor, a version so small you can do it on your worst day. Hit either one and the day is kept.',
    hint: 'Swipe the card away',
  },
  {
    color: 'pine',
    eyebrow: 'How it works',
    title: 'Down for the Floor. Up for the Ceiling.',
    body: 'Each morning your deck is dealt. Swipe a card down when you did the minimum, up when you hit the Ceiling, sideways to come back to it later.',
    hint: 'Try it: swipe down or up',
  },
  {
    color: 'back',
    eyebrow: 'The deal',
    title: 'Every kept day deals a playing card.',
    body: 'Keep some habits and you draw a 2 to a Queen. Keep them all and it can be an Ace. Reach a Ceiling too and it is 9 or better. Better days, better cards.',
    hint: 'Swipe to keep going',
    art: 'deal',
  },
  {
    color: 'sun',
    eyebrow: 'The week',
    title: 'Your week is a poker hand.',
    body: 'Monday to Sunday, your best five cards make the hand. At Sunday midnight it pays chips: 10 for a high card, 500 for a Royal flush. Call your hand on Monday and win its chips twice.',
    hint: 'Swipe to keep going',
    art: 'hand',
  },
  {
    color: 'lilac',
    eyebrow: 'Identity',
    title: 'Suits are who you are.',
    body: 'Body, Heart, Craft and Mind. Every kept day counts for that part of you, and enough of them earn it a face card in your Court. Each new face card deals a Joker.',
    hint: 'Swipe to keep going',
    art: 'suits',
  },
  {
    color: 'back',
    eyebrow: 'The comeback',
    title: 'Missing once is human.',
    body: 'Miss a day and come back the next, and the missed day still gets its card. Miss two in a row and the first stays empty. There are no streaks here, so nothing ever resets to zero.',
    hint: 'Swipe to build your deck',
  },
];

function IntroArt({ art }: { art: Art }) {
  if (art === 'deal') {
    return (
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <PlayingCard face={{ kind: 'card', rank: 6, suit: 'clubs' }} size="sm" style={{ transform: [{ rotate: '-6deg' }] }} />
        <PlayingCard face={{ kind: 'card', rank: 11, suit: 'spades' }} size="sm" />
        <PlayingCard face={{ kind: 'card', rank: 14, suit: 'hearts' }} size="md" style={{ transform: [{ rotate: '6deg' }] }} />
      </View>
    );
  }
  if (art === 'hand') return <HandFan faces={EXAMPLES['full-house']} size="sm" spread={0.62} style={{ alignSelf: 'flex-start' }} />;
  return (
    <View style={{ flexDirection: 'row', gap: space.lg }}>
      {SUITS.map((suit) => (
        <View key={suit} style={{ alignItems: 'center', gap: 4 }}>
          <SuitGlyph suit={suit} size={34} color="#17121F" />
          <Body size={11} weight="heavy" color="#17121F">{SUIT_INFO[suit].part.toUpperCase()}</Body>
        </View>
      ))}
    </View>
  );
}

/** Identities to start from, grouped by suit. */
const IDENTITIES: { suit: Suit; identities: string[] }[] = SUITS.map((suit) => ({
  suit,
  identities: [...new Set(RECIPES.filter((r) => r.suit === suit).map((r) => r.identity))],
}));

/** First run: six cards that teach the gestures and the game, then who you want to be, then a starter deck. */
export default function Onboarding() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Opened from the You tab to read the rules again: just the cards, then back to the game.
  const replay = useLocalSearchParams<{ tour?: string }>().tour === '1';
  const { createHabit, saveProfile } = useData();
  const [step, setStep] = useState(0);
  const [identities, setIdentities] = useState<string[]>([]);
  const [northStar, setNorthStar] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const introDone = step >= INTRO.length;
  const suggestions = suggestRecipes(identities, [], 12);

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  async function finish(recipes: Recipe[]) {
    setBusy(true);
    try {
      // Each card takes its suit's colour, so a glance at the deck shows which part of you it builds.
      for (const r of recipes) {
        await createHabit({ name: r.name, identity: r.identity, floorLabel: r.floor, ceilingLabel: r.ceiling, twoMinuteLabel: r.twoMinute, color: suitColors[r.suit].habit, suit: r.suit, anchor: r.anchor, whenWhere: '', why: r.why, recipeKey: r.key });
      }
      await saveProfile({ northStar, onboarded: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
      if (recipes.length === 0) router.push('/habit/edit');
    } catch (e) {
      ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
      setBusy(false);
    }
  }

  if (!introDone) {
    const card = INTRO[step];
    const bg = card.color === 'back' ? t.cardBack : cardColors[card.color].bg;
    const ink = card.color === 'back' ? t.onCardBack : cardColors[card.color].ink;
    const next = INTRO[step + 1];
    const nextBg = next ? (next.color === 'back' ? t.cardBack : cardColors[next.color].bg) : t.bgRaised;
    return (
      <View style={{ flex: 1, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.xl, gap: space.lg }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {INTRO.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? t.text : t.border }} />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ position: 'absolute', top: 18, bottom: 0, left: 14, right: -6, borderRadius: radius.card, backgroundColor: nextBg, transform: [{ rotate: '4deg' }] }} />
          <SwipeCard
            key={step}
            onSwipe={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (replay && step === INTRO.length - 1) router.back();
              else setStep((s) => s + 1);
            }}
            labels={step === 1 ? { up: 'CEILING', down: 'FLOOR', left: 'LATER', right: 'LATER' } : { up: 'NEXT', down: 'NEXT', left: 'NEXT', right: 'NEXT' }}
          >
            <View style={{ flex: 1, backgroundColor: bg, borderRadius: radius.card, padding: space.xl, justifyContent: 'space-between' }}>
              <Label color={ink} style={{ opacity: 0.7 }}>{card.eyebrow}</Label>
              <View style={{ gap: space.lg }}>
                {card.art ? <IntroArt art={card.art} /> : null}
                <Display size={card.art ? 38 : 46} color={ink}>{card.title}</Display>
                <Body size={card.art ? 16 : 17} weight="semi" color={ink} style={{ opacity: 0.9 }}>{card.body}</Body>
              </View>
              <Body weight="heavy" color={ink} style={{ opacity: 0.75 }}>{`${step === 1 ? '↑ ↓' : '↔'}  ${replay && !next ? 'Swipe to get back to the game' : card.hint}`}</Body>
            </View>
          </SwipeCard>
        </View>
        <Pressable onPress={() => (replay ? router.back() : setStep(INTRO.length))} hitSlop={12} style={{ alignSelf: 'center' }}>
          <Body weight="bold" color={t.textSecondary}>{replay ? 'Close' : 'Skip the tour'}</Body>
        </Pressable>
      </View>
    );
  }

  if (step === INTRO.length) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.xl, gap: space.xl }}>
          <View style={{ gap: space.sm }}>
            <Label>Step 1 of 2</Label>
            <Display size={42}>Who are you becoming?</Display>
            <Body color={t.textSecondary}>Pick the people you want to be more of. Your starter deck is built from them.</Body>
          </View>

          {IDENTITIES.map((group) => {
            const col = { bg: suitColors[group.suit].glyph, ink: '#FFFFFF' };
            return (
              <View key={group.suit} style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SuitGlyph suit={group.suit} size={14} color={t.text} />
                  <Label color={t.text}>{`${SUIT_INFO[group.suit].part} · ${SUIT_INFO[group.suit].name}`}</Label>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {group.identities.map((id) => (
                    <Chip
                      key={id}
                      label={id}
                      active={identities.includes(id)}
                      color={col.bg}
                      ink={col.ink}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setIdentities((l) => toggle(l, id));
                      }}
                    />
                  ))}
                </View>
              </View>
            );
          })}

          <View style={{ backgroundColor: t.cardBack, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
            <Label color={t.onCardBack} style={{ opacity: 0.6 }}>Your north star · optional</Label>
            <TextInput
              value={northStar}
              onChangeText={setNorthStar}
              placeholder="In a year, I want to be someone who…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              multiline
              style={{ fontFamily: fonts.display, fontSize: 24, color: t.onCardBack, minHeight: 64, textAlignVertical: 'top' }}
            />
            <Body size={13} color={t.onCardBack} style={{ opacity: 0.6 }}>It sits at the top of your You page, so you see why on the hard days.</Body>
          </View>

          <Button
            label={identities.length ? 'Build my deck' : 'Show me everything'}
            onPress={() => {
              setPicked(suggestRecipes(identities, [], 3).filter((r) => identities.includes(r.identity)).map((r) => r.key));
              setStep(INTRO.length + 1);
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const chosen = suggestions.filter((r) => picked.includes(r.key));
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + 160, paddingHorizontal: space.xl, gap: space.xl }}>
        <Pressable onPress={() => setStep(INTRO.length)} hitSlop={12}>
          <Body weight="bold" color={t.textSecondary}>← Back</Body>
        </Pressable>
        <View style={{ gap: space.sm }}>
          <Label>Step 2 of 2</Label>
          <Display size={42}>Deal your first cards.</Display>
          <Body color={t.textSecondary}>{`Start with one to three. ${PRINCIPLES.focus.idea} You can edit every word later.`}</Body>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {suggestions.map((r, i) => {
            const on = picked.includes(r.key);
            const col = cardColors[suitColors[r.suit].habit];
            return (
              <Pressable
                key={r.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPicked((l) => toggle(l, r.key));
                }}
                style={{
                  width: '47.5%',
                  aspectRatio: 0.72,
                  backgroundColor: on ? col.bg : t.bgRaised,
                  borderRadius: radius.lg,
                  padding: space.lg,
                  justifyContent: 'space-between',
                  transform: [{ rotate: on ? `${i % 2 ? 2 : -2}deg` : '0deg' }, { scale: on ? 1.02 : 1 }],
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <SuitGlyph suit={r.suit} size={13} color={on ? col.ink : t.textSecondary} />
                    <Label color={on ? col.ink : t.textSecondary}>{SUIT_INFO[r.suit].part}</Label>
                  </View>
                  <Display size={18} color={on ? col.ink : t.textFaint}>{on ? '✓' : '+'}</Display>
                </View>
                <View style={{ gap: 4 }}>
                  <Display size={26} color={on ? col.ink : t.text}>{r.name}</Display>
                  <Body size={12} weight="bold" color={on ? col.ink : t.textSecondary}>{`↑ ${r.ceiling}`}</Body>
                  <Body size={12} weight="bold" color={on ? col.ink : t.textSecondary}>{`↓ ${r.floor}`}</Body>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: space.xl, right: space.xl, bottom: insets.bottom + space.lg, gap: space.sm }}>
        <Button label={chosen.length ? `Deal ${chosen.length} ${chosen.length === 1 ? 'card' : 'cards'}` : 'I’ll make my own'} busy={busy} onPress={() => finish(chosen)} />
        {chosen.length > 3 ? <Body size={13} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }}>That’s a big deck to start. Fewer cards are easier to keep.</Body> : null}
      </View>
    </View>
  );
}
