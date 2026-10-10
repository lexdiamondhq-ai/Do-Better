import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HabitCard } from '@/components/HabitCard';
import { Body, Button, Display, Field, Label } from '@/components/ui';
import { PRINCIPLES, RECIPES } from '@/engine/playbook';
import { CATEGORY_COLOR } from '@/lib/categoryColor';
import { useData } from '@/lib/data';
import { draftFromHabit, draftProblem, type Habit, type HabitDraft } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CARD_COLORS, cardColors, space } from '@/theme/tokens';

const BLANK: HabitDraft = { name: '', identity: '', floorLabel: '', ceilingLabel: '', twoMinuteLabel: '', color: 'tomato', anchor: '', whenWhere: '', why: '', recipeKey: null };

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

/** Make or edit a card. You write on the card itself: the preview at the top updates as you type. */
export default function EditHabit() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, recipe } = useLocalSearchParams<{ id?: string; recipe?: string }>();
  const { state, createHabit, updateHabit, archiveHabit } = useData();
  const existing = state.status === 'ready' && id ? state.habits.find((h) => h.id === id) : undefined;

  const [draft, setDraft] = useState<HabitDraft>(() => {
    if (existing) return draftFromHabit(existing);
    const r = RECIPES.find((x) => x.key === recipe);
    if (r) return { name: r.name, identity: r.identity, floorLabel: r.floor, ceilingLabel: r.ceiling, twoMinuteLabel: r.twoMinute, color: CATEGORY_COLOR[r.category], anchor: r.anchor, whenWhere: '', why: r.why, recipeKey: r.key };
    return BLANK;
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<HabitDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const problem = draftProblem(draft);

  const preview: Habit = {
    id: 'preview',
    name: draft.name || 'Name it',
    identity: draft.identity || null,
    floorLabel: draft.floorLabel || 'Your worst-day minimum',
    ceilingLabel: draft.ceilingLabel || 'Your best day',
    twoMinuteLabel: draft.twoMinuteLabel || null,
    color: draft.color,
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
      if (existing) await updateHabit(existing.id, draft);
      else await createHabit(draft);
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
    Alert.alert(`Archive ${existing.name}?`, 'It leaves your deck. Every day you kept still counts toward your pile and your collection.', [
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

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole="radiogroup" accessibilityLabel="Card colour">
          {CARD_COLORS.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityState={{ selected: draft.color === color }}
              accessibilityLabel={color}
              onPress={() => {
                Haptics.selectionAsync();
                set({ color });
              }}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: cardColors[color].bg, borderWidth: draft.color === color ? 3 : 0, borderColor: t.text }}
            />
          ))}
        </View>

        <Field label="Name" value={draft.name} onChangeText={(name) => set({ name })} placeholder="Read" autoFocus={!existing && !recipe} />
        <Field label="Ceiling · a great day" value={draft.ceilingLabel} onChangeText={(ceilingLabel) => set({ ceilingLabel })} placeholder="20 pages" />
        <View style={{ gap: space.sm }}>
          <Field label="Floor · still counts" value={draft.floorLabel} onChangeText={(floorLabel) => set({ floorLabel })} placeholder="1 page" hint="Small enough to do on your worst day. Hitting it keeps the day." />
          <Tip principle="two-minute" />
        </View>

        <Label style={{ marginTop: space.md }}>Make it stick</Label>
        <View style={{ gap: space.sm }}>
          <Field label="Who this makes you" value={draft.identity} onChangeText={(identity) => set({ identity })} placeholder="a reader" hint="Every kept day is a vote for this person." />
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

        <Button label={existing ? 'Save card' : 'Add to deck'} busy={busy} onPress={save} style={{ marginTop: space.md }} />
        {existing ? <Button label="Archive card" variant="quiet" onPress={archive} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
