import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HabitCard } from '@/components/HabitCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Display, Field, Label } from '@/components/ui';
import { SUIT_INFO, SUITS } from '@/engine/cards';
import { inferSuit, PRINCIPLES, RECIPES } from '@/engine/playbook';
import { useData } from '@/lib/data';
import { draftFromHabit, draftProblem, type Habit, type HabitDraft } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CARD_COLORS, cardColors, radius, space, suitColors } from '@/theme/tokens';

const BLANK: HabitDraft = { name: '', identity: '', floorLabel: '', ceilingLabel: '', twoMinuteLabel: '', color: 'lilac', suit: 'clubs', anchor: '', whenWhere: '', why: '', recipeKey: null };

function Tip({ principle }: { principle: keyof typeof PRINCIPLES }) {
  const t = useTheme();
  const p = PRINCIPLES[principle];
  return (
    <Body size={13} color={t.textSecondary}>
      <Body size={13} weight="heavy" color={t.text}>{`${p.title}. `}</Body>
      {`${p.idea} (${p.source})`}
    </Body>
  );
}

/**
 * Make or edit a card. You write on the card itself: the preview at the top updates as you type. A new
 * card guesses its suit from its name until you pick one, and takes its suit's colour until you pick one.
 */
export default function EditHabit() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, recipe } = useLocalSearchParams<{ id?: string; recipe?: string }>();
  const { state, createHabit, updateHabit, archiveHabit } = useData();
  const existing = state.status === 'ready' && id ? state.habits.find((h) => h.id === id) : undefined;
  const fromRecipe = existing ? undefined : RECIPES.find((x) => x.key === recipe);

  const [draft, setDraft] = useState<HabitDraft>(() => {
    if (existing) return draftFromHabit(existing);
    const r = fromRecipe;
    if (r) return { name: r.name, identity: r.identity, floorLabel: r.floor, ceilingLabel: r.ceiling, twoMinuteLabel: r.twoMinute, color: suitColors[r.suit].habit, suit: r.suit, anchor: r.anchor, whenWhere: '', why: r.why, recipeKey: r.key };
    return BLANK;
  });
  const [suitPicked, setSuitPicked] = useState(!!existing || !!fromRecipe);
  const [colorPicked, setColorPicked] = useState(!!existing);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<HabitDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const suit = suitPicked ? draft.suit : inferSuit(draft.name, draft.identity);
  const color = colorPicked ? draft.color : suitColors[suit].habit;
  const final: HabitDraft = { ...draft, suit, color };
  const problem = draftProblem(final);
  const resuited = !!existing && existing.suit !== suit;

  const preview: Habit = {
    id: 'preview',
    name: draft.name || 'Name it',
    identity: draft.identity || null,
    floorLabel: draft.floorLabel || 'Your worst-day minimum',
    ceilingLabel: draft.ceilingLabel || 'Your best day',
    twoMinuteLabel: draft.twoMinuteLabel || null,
    color,
    suit,
    anchor: draft.anchor || null,
    whenWhere: draft.whenWhere || null,
    why: draft.why || null,
    recipeKey: draft.recipeKey,
    position: 0,
    startedOn: '',
    archivedAt: null,
  };

  async function save() {
    if (problem) {
      Alert.alert('Almost there', problem);
      return;
    }
    setBusy(true);
    try {
      if (existing) await updateHabit(existing.id, final);
      else await createHabit(final);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert('That didn’t save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  function archive() {
    if (!existing) return;
    Alert.alert(`Archive ${existing.name}?`, 'It leaves your deck. Every day you kept still counts: its cards stay in old hands and its votes stay in the Court.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () =>
          archiveHabit(existing.id)
            .then(() => router.dismissAll())
            .catch((e: unknown) => Alert.alert('That didn’t save', e instanceof Error ? e.message : 'Try again.')),
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, paddingTop: space.lg, paddingBottom: insets.bottom + space.xxxl, gap: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Body weight="bold" color={t.textSecondary}>Cancel</Body>
          </Pressable>
          <Display size={22}>{existing ? 'Edit card' : 'New card'}</Display>
          <Pressable onPress={save} hitSlop={12} disabled={busy}>
            <Body weight="heavy" color={problem ? t.textFaint : t.text}>Save</Body>
          </Pressable>
        </View>

        <View style={{ height: 380, transform: [{ rotate: '-1.5deg' }] }}>
          <HabitCard habit={preview} />
        </View>

        <Field label="Name" value={draft.name} onChangeText={(name) => set({ name })} placeholder="Read" autoFocus={!existing && !recipe} />

        <View style={{ gap: space.sm }}>
          <Label>{suitPicked ? 'Suit · the part of you it builds' : 'Suit · guessed from the name, tap to choose'}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Suit">
            {SUITS.map((s) => {
              const on = suit === s;
              const info = SUIT_INFO[s];
              return (
                <Pressable
                  key={s}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${info.name}, ${info.part}. ${info.about}`}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSuitPicked(true);
                    set({ suit: s });
                  }}
                  style={{ width: '48.5%', borderRadius: radius.md, padding: space.md, gap: 4, backgroundColor: on ? suitColors[s].glyph : t.bgRaised }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <SuitGlyph suit={s} size={20} color={on ? '#FFFFFF' : undefined} />
                    <Body weight="heavy" color={on ? '#FFFFFF' : t.text}>{`${info.part}`}</Body>
                  </View>
                  <Body size={12} color={on ? 'rgba(255,255,255,0.85)' : t.textSecondary}>{info.about.slice(0, info.about.indexOf('.') + 1)}</Body>
                </Pressable>
              );
            })}
          </View>
          {resuited ? (
            <Body size={13} weight="bold" color={t.textSecondary}>
              {`Its past days will be dealt again as ${SUIT_INFO[suit].name}, so old hands can change.`}
            </Body>
          ) : null}
        </View>

        <Field label="Ceiling · a great day" value={draft.ceilingLabel} onChangeText={(ceilingLabel) => set({ ceilingLabel })} placeholder="20 pages" />
        <View style={{ gap: space.sm }}>
          <Field label="Floor · still counts" value={draft.floorLabel} onChangeText={(floorLabel) => set({ floorLabel })} placeholder="1 page" hint="Small enough to do on your worst day. Hitting it keeps the day and deals its card." />
          <Tip principle="two-minute" />
        </View>

        <Label style={{ marginTop: space.md }}>Make it stick</Label>
        <View style={{ gap: space.sm }}>
          <Field label="Who this makes you" value={draft.identity} onChangeText={(identity) => set({ identity })} placeholder="a reader" hint="Every kept day is a vote for this person in the Court." />
          <Tip principle="identity" />
        </View>
        <View style={{ gap: space.sm }}>
          <Field label="After I…" value={draft.anchor} onChangeText={(anchor) => set({ anchor })} placeholder="After I get into bed" />
          <Tip principle="habit-stacking" />
        </View>
        <View style={{ gap: space.sm }}>
          <Field label="When and where" value={draft.whenWhere} onChangeText={(whenWhere) => set({ whenWhere })} placeholder="10 pm, in bed" />
          <Tip principle="when-where" />
        </View>
        <View style={{ gap: space.sm }}>
          <Field label="Two-minute version" value={draft.twoMinuteLabel} onChangeText={(twoMinuteLabel) => set({ twoMinuteLabel })} placeholder="Open the book to your bookmark" hint="Offered the morning after a miss." />
          <Tip principle="never-miss-twice" />
        </View>
        <Field label="Why it matters to you" value={draft.why} onChangeText={(why) => set({ why })} placeholder="I want to finish a book a month again." multiline />

        <View style={{ gap: space.sm }}>
          <Label>Card colour</Label>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole="radiogroup" accessibilityLabel="Card colour">
            {CARD_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === c }}
                accessibilityLabel={c}
                onPress={() => {
                  Haptics.selectionAsync();
                  setColorPicked(true);
                  set({ color: c });
                }}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: cardColors[c].bg, borderWidth: color === c ? 3 : 0, borderColor: t.text }}
              />
            ))}
          </View>
        </View>

        <Button label={existing ? 'Save card' : 'Add to deck'} busy={busy} onPress={save} style={{ marginTop: space.md }} />
        {existing ? <Button label="Archive card" variant="quiet" onPress={archive} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
