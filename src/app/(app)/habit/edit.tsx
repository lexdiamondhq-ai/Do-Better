import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask } from '@/components/Ask';
import { HabitCard } from '@/components/HabitCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Display, Field, Label } from '@/components/ui';
import { SUIT_INFO, SUITS } from '@/engine/cards';
import { exampleRecipe, inferSuit, ownWhy, PRINCIPLES, recipeFor, type EditField, type EditFocus } from '@/engine/playbook';
import { useData } from '@/lib/data';
import { useAdded } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { draftFromHabit, draftProblem, type Habit, type HabitDraft } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CARD_COLORS, cardColors, fontScale, radius, space, suitColors, TAP, typeScale, WHITE } from '@/theme/tokens';

const BLANK: HabitDraft = { name: '', identity: '', floorLabel: '', ceilingLabel: '', twoMinuteLabel: '', color: 'lilac', suit: 'clubs', anchor: '', whenWhere: '', why: '', recipeKey: null };

/** Moments that happen every day, for "When it plays". None waits for a workday or a payday. */
const MOMENTS = ['after waking up', 'after my first coffee', 'after lunch', 'after dinner', 'before bed'] as const;

const FIELDS: readonly EditField[] = ['name', 'ceilingLabel', 'floorLabel', 'identity', 'anchor', 'twoMinuteLabel', 'why'];
const isFocus = (v: unknown): v is EditFocus => typeof v === 'string' && (v === 'archive' || (FIELDS as readonly string[]).includes(v));

type TipText = { title: string; body: string };

const TIPS: Partial<Record<EditField, TipText>> = {
  ceilingLabel: { title: PRINCIPLES.stretch.title, body: PRINCIPLES.stretch.idea },
  floorLabel: { title: 'Small enough for your worst day', body: 'On a bad day the Floor is the whole habit, and it still keeps the day. If it takes courage, make it smaller.' },
  identity: { title: PRINCIPLES.identity.title, body: PRINCIPLES.identity.idea },
  anchor: { title: PRINCIPLES['when-it-plays'].title, body: PRINCIPLES['when-it-plays'].idea },
  twoMinuteLabel: { title: PRINCIPLES['first-move'].title, body: PRINCIPLES['first-move'].idea },
};

/** One idea, folded to its title until tapped. */
function Tip({ tip }: { tip: TipText }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? `${tip.title}. ${tip.body}` : tip.title}
      onPress={() => {
        feel.tick();
        setOpen((o) => !o);
      }}
      hitSlop={6}
      style={({ pressed }) => ({ flexDirection: 'row', gap: space.sm, minHeight: 32, paddingHorizontal: space.xs, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}
    >
      <View aria-hidden style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: t.textSecondary, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Body weight="heavy" size={12} color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic} style={{ lineHeight: 14 }}>
          {open ? '–' : '+'}
        </Body>
      </View>
      <Body size={typeScale.text.sm} color={t.textSecondary} style={{ flex: 1 }}>
        <Body size={typeScale.text.sm} weight="heavy" color={t.text}>
          {tip.title}
        </Body>
        {open ? `. ${tip.body}` : ''}
      </Body>
    </Pressable>
  );
}

/**
 * Make or edit a card. You write on the card itself: the preview at the top updates as you type. A new
 * card guesses its suit from its name until you pick one, and takes its suit's colour until you pick one.
 * Empty fields show examples from the card's own ready-made card, or from one of its suit.
 * Opened with `focus`, it scrolls to that field and puts the cursor in it, ready to change, or with
 * `focus=archive`, to the Archive button, ringed.
 */
export default function EditHabit() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { id, recipe, focus } = useLocalSearchParams<{ id?: string; recipe?: string; focus?: string }>();
  const { state, today, createHabit, updateHabit, archiveHabit } = useData();
  const { noteAdded } = useAdded();
  const existing = state.status === 'ready' && id ? state.habits.find((h) => h.id === id) : undefined;
  const fromRecipe = existing ? undefined : recipeFor(recipe);
  // The Archive button can only be opened on a card that is already in the deck.
  const target = isFocus(focus) && (focus !== 'archive' || existing) ? focus : null;

  const [start] = useState<HabitDraft>(() => {
    // A ready-made card's own line is the app talking, not the player: their "why" starts empty.
    if (existing) return { ...draftFromHabit(existing), why: ownWhy(existing) ?? '' };
    const r = fromRecipe;
    if (r) return { name: r.name, identity: r.identity, floorLabel: r.floor, ceilingLabel: r.ceiling, twoMinuteLabel: r.twoMinute, color: suitColors[r.suit].habit, suit: r.suit, anchor: r.anchor, whenWhere: '', why: '', recipeKey: r.key };
    return BLANK;
  });
  const [draft, setDraft] = useState<HabitDraft>(start);
  const [suitPicked, setSuitPicked] = useState(!!existing || !!fromRecipe);
  const [colorPicked, setColorPicked] = useState(!!existing);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<HabitDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const suit = suitPicked ? draft.suit : inferSuit(draft.name, draft.identity);
  // Until there is a name to guess from, no suit is shown as chosen and nothing claims a guess.
  const nameless = !draft.name.trim() && !draft.identity.trim();
  const suitShown = suitPicked || !nameless;
  const color = colorPicked ? draft.color : suitColors[suit].habit;
  const example = exampleRecipe(draft.recipeKey, suit);
  const final: HabitDraft = { ...draft, suit, color };
  const problem = draftProblem(final);
  // Changed from how it opened, with the same guesses it opened with.
  const startSuit = existing || fromRecipe ? start.suit : inferSuit(start.name, start.identity);
  const dirty = JSON.stringify(final) !== JSON.stringify({ ...start, suit: startSuit, color: existing ? start.color : suitColors[startSuit].habit });
  // Both Save buttons stand out once there is something to save. A card with no changes just closes.
  const ready = !problem && (dirty || !existing);

  // Once a day before today has been dealt, a new suit would change hands already played. Only a suit
  // that was guessed, on a card made before suits existed, can still be picked, and then only once.
  const played = !!existing && state.status === 'ready' && state.days.some((d) => d.habitId === existing.id && d.day < today);
  const suitLocked = played && !!existing?.suitSet;
  const guessed = played && existing?.suitSet === false;
  const suitLabel = suitLocked
    ? 'Suit · locked, its days are already dealt'
    : guessed
      ? 'Suit · guessed, pick the one that fits'
      : suitPicked || nameless
        ? 'Suit · the part of you it builds'
        : 'Suit · guessed from the name, tap to choose';

  // One input per field, so the return key can move on and a Playbook tip can open the right one.
  const name = useRef<TextInput>(null);
  const ceiling = useRef<TextInput>(null);
  const floor = useRef<TextInput>(null);
  const identity = useRef<TextInput>(null);
  const anchor = useRef<TextInput>(null);
  const firstMove = useRef<TextInput>(null);
  const why = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<Partial<Record<EditFocus, number>>>({});
  // Leaving after a save, or after "Discard", goes straight through.
  const leaving = useRef(false);

  useEffect(() => {
    if (!target) return;
    const input: Record<EditField, RefObject<TextInput | null>> = { name, ceilingLabel: ceiling, floorLabel: floor, identity, anchor, twoMinuteLabel: firstMove, why };
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        const y = tops.current[target];
        if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - space.xxxl), animated: true });
        // Focus once the scroll has settled: a scroll still running can count as a drag and put the keyboard away.
        // The Archive button is only ringed: archiving always asks first.
        if (target !== 'archive') timers.push(setTimeout(() => input[target].current?.focus(), y === undefined ? 0 : 450));
      }, 450),
    );
    return () => timers.forEach(clearTimeout);
  }, [target]);

  usePreventRemove(dirty && !busy, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    ask(existing ? 'Discard your changes?' : 'Discard this card?', existing ? 'The card stays as it was.' : 'Nothing has been added to your deck yet.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          leaving.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  const preview: Habit = {
    id: 'preview',
    name: draft.name || 'Name it',
    identity: draft.identity || null,
    floorLabel: draft.floorLabel || 'Your worst-day minimum',
    ceilingLabel: draft.ceilingLabel || 'Your best day',
    twoMinuteLabel: draft.twoMinuteLabel || null,
    color,
    suit,
    suitSet: true,
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
      ask('Almost there', problem);
      return;
    }
    if (existing && !dirty) {
      // Nothing changed, so nothing is written.
      leaving.current = true;
      router.back();
      return;
    }
    setBusy(true);
    try {
      if (existing) await updateHabit(existing.id, final);
      else {
        const made = await createHabit(final);
        noteAdded({ id: made.id, name: made.name, back: false });
      }
      feel.ceiling();
      leaving.current = true;
      router.back();
    } catch (e) {
      ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  function archive() {
    if (!existing) return;
    ask(`Archive ${existing.name}?`, 'It leaves your deck. Every day you kept still counts: its cards stay in old hands and its kept days stay in the Court.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          leaving.current = true;
          archiveHabit(existing.id)
            .then(() => router.dismissAll())
            .catch((e: unknown) => {
              leaving.current = false;
              ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
            });
        },
      },
    ]);
  }

  /** A field's wrapper: remembers where it sits, and rings the field a Playbook tip opened. */
  const spot = (field: EditField, children: ReactNode) => (
    <View
      key={field}
      onLayout={(e) => {
        tops.current[field] = e.nativeEvent.layout.y;
      }}
      style={[{ gap: 2 }, target === field ? { borderRadius: radius.md + 4, borderWidth: 2.5, borderColor: t.text, padding: 2, margin: -4.5 } : null]}
    >
      {children}
      {TIPS[field] ? <Tip tip={TIPS[field]} /> : null}
    </View>
  );

  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      // On the web every scroll counts as a drag, so a field opened by a tip would lose its focus as it scrolls into view.
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : Platform.OS === 'web' ? 'none' : 'on-drag'}
      automaticallyAdjustKeyboardInsets
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.xl, paddingTop: space.lg, paddingBottom: insets.bottom + space.xxxl, gap: space.lg }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: TAP }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel" style={{ minHeight: TAP, justifyContent: 'center' }}>
          <Body weight="bold" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
            Cancel
          </Body>
        </Pressable>
        <Display size={typeScale.display.sm} header>
          {existing ? 'Edit card' : 'New card'}
        </Display>
        <Pressable
          onPress={save}
          hitSlop={12}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={existing ? 'Save card' : 'Add to deck'}
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: ready ? t.text : 'transparent', borderWidth: 1.5, borderColor: ready ? t.text : t.border, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <Body weight="heavy" color={ready ? t.bg : t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
            Save
          </Body>
        </Pressable>
      </View>

      <View style={{ height: 360, transform: [{ rotate: '-1.5deg' }], marginHorizontal: space.sm }} aria-hidden>
        <HabitCard habit={preview} />
      </View>

      <Label style={{ marginTop: space.sm }}>The card</Label>
      {spot('name', <Field label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder={example.name} autoFocus={!existing && !recipe && !target} inputRef={name} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => ceiling.current?.focus()} />)}

      <View style={{ gap: space.sm }}>
        <Label>{suitLabel}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Suit">
          {SUITS.map((s) => {
            const on = suitShown && suit === s;
            const info = SUIT_INFO[s];
            return (
              <Pressable
                key={s}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: suitLocked }}
                accessibilityLabel={`${info.name}, ${info.part}. ${info.about}`}
                disabled={suitLocked}
                onPress={() => {
                  feel.tick();
                  setSuitPicked(true);
                  set({ suit: s });
                }}
                style={({ pressed }) => ({
                  width: '48.5%',
                  borderRadius: radius.md,
                  padding: space.md,
                  gap: 4,
                  backgroundColor: on ? suitColors[s].glyph : t.bgRaised,
                  opacity: suitLocked && !on ? 0.4 : pressed ? 0.8 : 1,
                  transform: [{ rotate: on ? (SUITS.indexOf(s) % 2 ? '1deg' : '-1deg') : '0deg' }],
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <SuitGlyph suit={s} size={20} color={on ? WHITE : undefined} />
                  <Body weight="heavy" color={on ? WHITE : t.text}>
                    {info.part}
                  </Body>
                </View>
                <Body size={12} color={on ? WHITE : t.textSecondary}>
                  {info.about.slice(0, info.about.indexOf('.') + 1)}
                </Body>
              </Pressable>
            );
          })}
        </View>
        {suitLocked ? (
          <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary}>
            A suit is set once its days are dealt, so your past hands never change. To build another part of you, archive this card and start a new one.
          </Body>
        ) : guessed ? (
          <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary}>
            This card was made before suits, so its suit is a guess. When you save, its past days are dealt in the suit you pick, and the suit is set for good.
          </Body>
        ) : null}
      </View>

      {spot('ceilingLabel', <Field label="Ceiling · a great day" value={draft.ceilingLabel} onChangeText={(v) => set({ ceilingLabel: v })} placeholder={example.ceiling} inputRef={ceiling} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => floor.current?.focus()} />)}
      {spot(
        'floorLabel',
        <Field label="Floor · still counts" value={draft.floorLabel} onChangeText={(v) => set({ floorLabel: v })} placeholder={example.floor} hint="Small enough to do on your worst day. Keeping it keeps the day and deals its card." inputRef={floor} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => identity.current?.focus()} />,
      )}

      <Label style={{ marginTop: space.md }}>Make it stick</Label>
      {spot(
        'identity',
        <Field label="I’m…" value={draft.identity} onChangeText={(v) => set({ identity: v })} placeholder={example.identity} hint="Every time you keep this card, it counts for this person in your Court." autoCapitalize="none" inputRef={identity} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => anchor.current?.focus()} />,
      )}
      {spot(
        'anchor',
        <View style={{ gap: space.sm }}>
          <Field label="When it plays" value={draft.anchor} onChangeText={(v) => set({ anchor: v })} placeholder={example.anchor} hint="A moment that already happens every day. Add a time, like 7 am, if it has one." autoCapitalize="none" inputRef={anchor} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => firstMove.current?.focus()} />
          {/* The moments run edge to edge, except inside the ring a Playbook tip draws, where they scroll within it. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ marginHorizontal: target === 'anchor' ? 0 : -space.xl, marginVertical: -4 }}
            contentContainerStyle={{ paddingHorizontal: target === 'anchor' ? space.xs : space.xl, paddingVertical: 4, gap: space.sm }}
          >
            {MOMENTS.map((m) => {
              const on = draft.anchor.trim().toLowerCase() === m;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityLabel={`Plays ${m}`}
                  accessibilityState={{ selected: on }}
                  hitSlop={{ top: 4, bottom: 4 }}
                  onPress={() => {
                    feel.tick();
                    set({ anchor: m });
                  }}
                  style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? t.text : t.border, backgroundColor: on ? t.text : 'transparent', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
                >
                  <Body weight="heavy" size={typeScale.text.sm} color={on ? t.bg : t.text} maxFontSizeMultiplier={fontScale.chrome}>
                    {m}
                  </Body>
                </Pressable>
              );
            })}
          </ScrollView>
          {draft.whenWhere.trim() ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xs }}>
              <Body size={typeScale.text.sm} color={t.textSecondary} style={{ flex: 1 }}>
                <Body size={typeScale.text.sm} weight="heavy" color={t.text}>
                  {'Also noted: '}
                </Body>
                {draft.whenWhere.trim()}
              </Body>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove the note ${draft.whenWhere.trim()}`} onPress={() => set({ whenWhere: '' })} hitSlop={8} style={{ minHeight: TAP, justifyContent: 'center' }}>
                <Body weight="heavy" size={typeScale.text.sm} color={t.textSecondary} style={{ textDecorationLine: 'underline' }}>
                  Remove
                </Body>
              </Pressable>
            </View>
          ) : null}
        </View>,
      )}
      {spot(
        'twoMinuteLabel',
        <Field
          label="First move"
          value={draft.twoMinuteLabel}
          onChangeText={(v) => set({ twoMinuteLabel: v })}
          placeholder={example.twoMinute}
          hint="Offered the morning after a miss. On that morning, doing just this keeps the day."
          inputRef={firstMove}
          returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => why.current?.focus()}
        />,
      )}
      {spot(
        'why',
        <Field
          label="Why it matters to you"
          value={draft.why}
          onChangeText={(v) => set({ why: v })}
          placeholder={example.prompt}
          hint="In your own words. The card shows it back on the hard days."
          multiline
          inputRef={why}
        />,
      )}

      <View style={{ gap: space.sm }}>
        <Label>Card colour</Label>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole="radiogroup" accessibilityLabel="Card colour">
          {CARD_COLORS.map((c) => {
            const on = color === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c}
                onPress={() => {
                  feel.tick();
                  setColorPicked(true);
                  set({ color: c });
                }}
                style={{ width: TAP + 4, height: TAP + 4, borderRadius: (TAP + 4) / 2, borderWidth: on ? 3 : 0, borderColor: t.text, padding: 3 }}
              >
                <View style={{ flex: 1, borderRadius: TAP / 2, backgroundColor: cardColors[c].bg, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? (
                    <Body weight="heavy" color={cardColors[c].ink} maxFontSizeMultiplier={fontScale.graphic}>
                      ✓
                    </Body>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button label={existing ? 'Save card' : 'Add to deck'} variant={ready ? 'primary' : 'ghost'} busy={busy} onPress={save} style={{ marginTop: space.md }} />
      {existing ? (
        <View
          onLayout={(e) => {
            tops.current.archive = e.nativeEvent.layout.y;
          }}
          style={target === 'archive' ? { borderRadius: radius.lg, borderWidth: 2.5, borderColor: t.text, padding: space.md, gap: space.sm } : null}
        >
          {target === 'archive' ? (
            <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }}>
              {`Archived, ${existing.name} leaves Today. Its kept days still count in your Court, and it can come back from You any time.`}
            </Body>
          ) : null}
          <Button label="Archive card" variant={target === 'archive' ? 'ghost' : 'quiet'} onPress={archive} />
        </View>
      ) : null}
    </ScrollView>
  );
}
