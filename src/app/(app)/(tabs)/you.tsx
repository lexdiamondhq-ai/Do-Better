import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Share, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';

import { ArrangeDeck } from '@/components/ArrangeDeck';
import { ask, menu } from '@/components/Ask';
import { CardBack } from '@/components/CardBack';
import { ChipIcon, Chips, formatChips } from '@/components/Chips';
import { CardSlot, faceOfCourt, PlayingCard, type CardFace } from '@/components/PlayingCard';
import { ReminderSettings } from '@/components/Reminders';
import { RulesSheet } from '@/components/RulesSheet';
import { SaveDeckCard, SaveSheet } from '@/components/SaveDeckCard';
import { Star, SuitGlyph } from '@/components/Suit';
import { Body, Button, Display, Label, Page, PageTitle, raisedStyle, Section, TableSurface } from '@/components/ui';
import { SUIT_INFO } from '@/engine/cards';
import { FACES, RUNGS, type CourtSuit } from '@/engine/court';
import { BACKS, TABLES, type TableKey } from '@/engine/game';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { useDeck, useLook } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { usePrefs } from '@/lib/prefs';
import { playSound } from '@/lib/sound';
import { supabase } from '@/lib/supabase';
import type { Habit } from '@/lib/types';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { cardColors, fontScale, fonts, radius, space, suitColors, TAP, themeFor, typeScale } from '@/theme/tokens';

/** The public TestFlight invite. Until it's set, "Deal a friend in" shares the idea without a link. */
const TESTFLIGHT_URL = '';
/** The privacy policy. Its row stays hidden until there is one to open. */
const PRIVACY_URL = '';
/** Where feedback goes. Its row stays hidden until there is an address. */
const FEEDBACK_EMAIL = '';

/** Who you are becoming: your north star, the Court each part of you has earned, and everything you've won. */
export default function You() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { sheet } = useLocalSearchParams<{ sheet?: string }>();
  const [arranging, setArranging] = useState(false);
  const [rules, setRules] = useState(false);
  if (!deck) return null;

  const { game } = deck;
  const faces = deck.court.filter((c) => c.face).length;
  const arrangeOpen = arranging || sheet === 'arrange';

  return (
    <Page header={<PageTitle eyebrow="You" title="Who you’re becoming" />}>
      <NorthStar northStar={deck.profile.northStar} />

      <Section title="The Court" action={<Label>{`Face cards in ${faces} of 4 suits`}</Label>}>
        <Court court={deck.court} onFind={() => router.push('/playbook')} />
      </Section>

      <Section title="Your stack" action={<Label>{`${game.weeks.filter((w) => !w.warmup).length} weeks played`}</Label>}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Chips value={game.stack} size={40} color={t.text} />
        </View>
        <Body size={typeScale.text.md} color={t.textSecondary}>
          Chips never leave your stack. A bigger stack opens a new table, and a table recolours the whole app.
        </Body>
        <Tables stack={game.stack} open={game.tables} />
      </Section>

      <Section title="Card backs" action={<Label>{`${game.backs.size} of ${BACKS.length}`}</Label>}>
        <Body size={typeScale.text.md} color={t.textSecondary}>
          Each back unlocks its own way, at the Showdown of the week that earns it.
        </Body>
        <Backs open={game.backs} />
      </Section>

      <Section title="Your numbers">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {[
            { n: deck.totals.kept, label: 'kept days' },
            { n: deck.totals.ceilings, label: 'Ceilings reached' },
            { n: deck.totals.rescues, label: 'empty days saved' },
            { n: deck.totals.jokers, label: 'Jokers dealt' },
          ].map((s) => (
            <View key={s.label} accessible accessibilityLabel={`${s.n} ${s.label}`} style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg, borderWidth: t.edge === 'transparent' ? 0 : 1, borderColor: t.edge }}>
              <Display size={typeScale.display.lg}>{formatChips(s.n)}</Display>
              <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary}>
                {s.label}
              </Body>
            </View>
          ))}
          <View style={{ width: '100%', backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg, gap: 2, borderWidth: t.edge === 'transparent' ? 0 : 1, borderColor: t.edge }}>
            <Label>Best hand ever</Label>
            <Display size={typeScale.display.sm}>{game.bestEver?.hand.title ?? 'Your first Showdown is on a Sunday night'}</Display>
          </View>
        </View>
      </Section>

      <Section title="Your deck" action={deck.cards.length ? <Label>{`${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'}`}</Label> : undefined}>
        {deck.cards.length > 1 ? (
          <Button
            label="Arrange your deck"
            variant="ghost"
            hint="Choose the order Today deals your cards in."
            onPress={() => {
              feel.tick();
              setArranging(true);
            }}
          />
        ) : null}
        <Archived archived={deck.archived} />
      </Section>

      <ReminderSettings />

      <Feel />

      <Rows>
        <Row label="How it plays" detail="Every rule in a line" onPress={() => setRules(true)} />
        <Row label="Deal a friend in" detail="Send them the app" onPress={dealAFriendIn} />
      </Rows>

      <Account />

      <ArrangeDeck
        visible={arrangeOpen}
        onClose={() => {
          setArranging(false);
          if (sheet) router.setParams({ sheet: undefined });
        }}
      />
      <RulesSheet visible={rules} onClose={() => setRules(false)} />
    </Page>
  );
}

function dealAFriendIn() {
  feel.tick();
  const pitch = 'I’m keeping my habits with Do Better. Every day you keep one deals a playing card, and every week plays as a poker hand. No streaks to break.';
  Share.share(TESTFLIGHT_URL ? { message: `${pitch}\n${TESTFLIGHT_URL}`, url: TESTFLIGHT_URL } : { message: pitch }).catch(() => {});
}

/* ---------------------------------------------------------------- north star */

function NorthStar({ northStar }: { northStar: string | null }) {
  const t = useTheme();
  const { saveProfile } = useData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await saveProfile({ northStar: draft.trim() || null });
      setEditing(false);
    } catch (e) {
      ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[{ borderRadius: radius.card, padding: space.xl, gap: space.md }, raisedStyle(t)]}>
      <Label color={t.onRaisedSecondary}>Your north star</Label>
      {editing ? (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            multiline
            accessibilityLabel="Your north star"
            placeholder="I’m becoming someone who…"
            placeholderTextColor={t.onRaisedSecondary}
            keyboardAppearance={t.scheme}
            style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: t.onRaised, minHeight: 80 }}
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Save" busy={busy} onPress={save} colors={{ bg: t.onRaised, fg: t.raised }} style={{ flex: 1 }} />
            <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} colors={{ bg: 'transparent', fg: t.onRaised }} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Edit your north star"
          onPress={() => {
            setDraft(northStar ?? '');
            setEditing(true);
          }}
          style={{ gap: space.sm }}
        >
          <Display size={28} color={t.onRaised}>
            {northStar ?? 'Write one sentence about who you’re becoming.'}
          </Display>
          <Body size={typeScale.text.sm} weight="bold" color={t.onRaisedSecondary}>
            {northStar ? 'Tap to edit' : 'Tap to write it'}
          </Body>
        </Pressable>
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- the Court */

/** Four suits side by side, each a pile of the face cards it has earned with the next one filling up on top. */
function Court({ court, onFind }: { court: CourtSuit[]; onFind: () => void }) {
  const { width } = useWindowDimensions();
  const cardW = Math.max(56, Math.min(84, Math.floor((Math.min(width, 520) - space.xl * 2 - space.sm * 3) / 4)));
  // Every pile gets the height of the tallest, so the day counts under them line up.
  const piles = Math.max(1, ...court.map(pileOf));
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      {court.map((suit) => (
        <CourtColumn key={suit.suit} suit={suit} cardW={cardW} piles={piles} onFind={onFind} />
      ))}
    </View>
  );
}

const STEP = 0.26;

/** Cards in a suit's pile: the face cards it has earned, and the next one while there is one. */
function pileOf(suit: CourtSuit): number {
  return FACES.filter((f) => suit.votes >= f.votes).length + (suit.next ? 1 : 0);
}

function CourtColumn({ suit, cardW, piles, onFind }: { suit: CourtSuit; cardW: number; piles: number; onFind: () => void }) {
  const t = useTheme();
  const info = SUIT_INFO[suit.suit];
  const color = t.scheme === 'dark' ? suitColors[suit.suit].bright : suitColors[suit.suit].glyph;
  const cardH = Math.round((cardW * 104) / 74);
  const step = Math.round(cardH * STEP);
  const earned = FACES.filter((f) => suit.votes >= f.votes);
  const empty = suit.habitIds.length === 0 && suit.votes === 0;
  const next = suit.next;
  const from = suit.face?.votes ?? 0;
  const progress = next ? Math.max(0, Math.min(1, (suit.votes - from) / (next.face.votes - from))) : 1;
  const height = cardH + step * Math.max(0, piles - 1);
  const showRungs = suit.face?.face === 'king' || suit.face?.face === 'ace';

  const describe = () => {
    feel.tick();
    if (empty) {
      ask(`${info.glyph} ${info.part}`, `${info.about} No habits here yet.`, [
        { text: 'Not now', style: 'cancel' },
        { text: `Find a ${info.part} habit`, onPress: onFind },
      ]);
      return;
    }
    const who = suit.identities.length ? `I’m ${suit.identities.slice(0, 4).join(', ')}.` : info.about;
    const counts = `${suit.votes} kept ${suit.votes === 1 ? 'day' : 'days'}, ${suit.ceilings} with a Ceiling${suit.lastWeek ? `, ${suit.lastWeek} this week` : ''}.`;
    const ahead = next ? `${next.needed} to the ${next.face.name}.` : 'Every face card earned.';
    const rung = suit.nextRung && showRungs ? ` Next rung at ${suit.nextRung.votes} days.` : '';
    ask(`${info.glyph} ${info.part}${suit.face ? ` · ${suit.face.name}` : ''}`, `${who}\n\n${counts} ${ahead}${rung}`);
  };

  const label = empty
    ? `${info.part}. No habits here yet.`
    : `${info.part}. ${suit.votes} kept days. ${suit.face ? `${suit.face.name} earned. ` : ''}${next ? `${next.needed} to the ${next.face.name}.` : 'Every face card earned.'}`;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Shows who this suit says you are." onPress={describe} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: space.sm, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} aria-hidden>
        <SuitGlyph suit={suit.suit} size={14} color={color} />
        <Body size={11} weight="heavy" color={t.text} maxFontSizeMultiplier={fontScale.tabs} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {info.part}
        </Body>
      </View>
      <View style={{ width: cardW, height }} aria-hidden>
        {earned.map((f, i) => (
          <PlayingCard key={f.face} face={faceOfCourt(suit.suit, f)} size="md" width={cardW} style={{ position: 'absolute', top: i * step, left: 0 }} />
        ))}
        {next ? (
          <NextSlot top={earned.length * step} w={cardW} h={cardH} letter={next.face.letter} at={next.face.votes} progress={progress} color={color} empty={empty} />
        ) : null}
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        {empty ? (
          <Body size={12} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }}>
            No habits here yet
          </Body>
        ) : (
          <>
            <Display size={typeScale.display.sm} maxFontSizeMultiplier={fontScale.chrome}>
              {formatChips(suit.votes)}
            </Display>
            <Body size={11} weight="heavy" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome} style={{ textAlign: 'center' }}>
              {next ? `${next.needed} to the ${next.face.name}` : 'Every face'}
            </Body>
          </>
        )}
        {showRungs ? (
          <View accessible accessibilityLabel={`${suit.rung} of ${RUNGS.length} rungs`} style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
            {RUNGS.map((r, i) => (
              <View key={r} style={{ opacity: i < suit.rung ? 1 : 0.28 }}>
                <Star size={11} color={i < suit.rung ? color : t.textSecondary} />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** The next face card: a dashed place that fills from the bottom as the days come in, marked with the day count it comes at. */
function NextSlot({ top, w, h, letter, at, progress, color, empty }: { top: number; w: number; h: number; letter: string; at: number; progress: number; color: string; empty: boolean }) {
  const t = useTheme();
  return (
    <View style={{ position: 'absolute', top, left: 0, width: w, height: h, borderRadius: 12, backgroundColor: t.bg, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.round(progress * 100)}%`, backgroundColor: color, opacity: 0.22 }} />
      <CardSlot size="md" color={t.dashed} style={{ width: w, height: h }}>
        {empty ? (
          <Display size={26} color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic}>
            +
          </Display>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Display size={Math.round(w * 0.36)} color={color} maxFontSizeMultiplier={fontScale.graphic}>
              {letter}
            </Display>
            <Body size={10} weight="heavy" color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic}>
              {`at ${at}`}
            </Body>
          </View>
        )}
      </CardSlot>
    </View>
  );
}

/* ---------------------------------------------------------------- tables and backs */

const PREVIEW: CardFace[] = [
  { kind: 'card', rank: 12, suit: 'hearts' },
  { kind: 'card', rank: 12, suit: 'spades' },
  { kind: 'card', rank: 7, suit: 'clubs' },
];

/** Every table as a little piece of its felt: yours, the ones you can sit at, and what the rest need. */
function Tables({ stack, open }: { stack: number; open: ReadonlySet<TableKey> }) {
  const t = useTheme();
  const scheme = useColorScheme();
  const { table: mine, setLook } = useLook();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.md }}>
      {TABLES.map((table) => {
        const unlocked = open.has(table.key);
        const on = mine === table.key;
        const look = themeFor(table.key, scheme);
        return (
          <Pressable
            key={table.key}
            disabled={!unlocked || on}
            accessibilityRole="radio"
            accessibilityLabel={`${table.name}. ${on ? 'Your table' : unlocked ? 'Sit here' : `Opens at ${formatChips(table.chips)} chips`}`}
            accessibilityState={{ selected: on, disabled: !unlocked }}
            onPress={() => {
              feel.tick();
              setLook({ table: table.key });
            }}
            style={({ pressed }) => ({ width: 136, gap: space.sm, opacity: pressed ? 0.8 : 1 })}
          >
            <ThemeScope theme={look}>
              <View style={{ height: 150, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: look.bg, borderWidth: on ? 3 : 1, borderColor: on ? t.text : t.border, alignItems: 'center', justifyContent: 'center' }}>
                <TableSurface />
                <View style={{ flexDirection: 'row', opacity: unlocked ? 1 : 0.5 }} aria-hidden>
                  {PREVIEW.map((face, i) => (
                    <PlayingCard key={i} face={face} size="sm" width={40} style={{ marginLeft: i ? -14 : 0, marginTop: i === 1 ? -6 : 0, transform: [{ rotate: `${(i - 1) * 10}deg` }] }} />
                  ))}
                </View>
                <Body size={12} weight="heavy" color={look.text} maxFontSizeMultiplier={fontScale.chrome} style={{ position: 'absolute', left: space.md, bottom: space.sm, right: space.md }} numberOfLines={1}>
                  {table.name}
                </Body>
              </View>
            </ThemeScope>
            {on ? (
              <Body size={typeScale.text.sm} weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
                ✓ Your table
              </Body>
            ) : unlocked ? (
              <Body size={typeScale.text.sm} weight="heavy" maxFontSizeMultiplier={fontScale.chrome} style={{ textDecorationLine: 'underline' }}>
                Sit here
              </Body>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
                  Opens at
                </Body>
                <ChipIcon size={14} />
                <Body size={typeScale.text.sm} weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
                  {formatChips(table.chips)}
                </Body>
              </View>
            )}
            {!unlocked ? (
              <Body size={11} weight="bold" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>{`${formatChips(Math.max(0, table.chips - stack))} to go`}</Body>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Backs({ open }: { open: ReadonlySet<string> }) {
  const t = useTheme();
  const { back: mine, setLook } = useLook();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.md }}>
      {BACKS.map((b) => {
        const unlocked = open.has(b.key);
        const on = mine === b.key;
        return (
          <Pressable
            key={b.key}
            disabled={!unlocked}
            accessibilityRole="radio"
            accessibilityLabel={`${b.name} card back. ${unlocked ? '' : 'Locked. '}${b.how}`}
            accessibilityState={{ selected: on, disabled: !unlocked }}
            onPress={() => {
              feel.tick();
              setLook({ back: b.key });
            }}
            style={{ width: 92, gap: 6 }}
          >
            <View style={{ alignSelf: 'flex-start', padding: 3, borderRadius: 15, borderWidth: 2.5, borderColor: on ? t.text : 'transparent' }}>
              <View style={{ opacity: unlocked ? 1 : 0.35 }}>
                <CardBack back={b.key} size="md" width={80} />
              </View>
              {!unlocked ? (
                <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: t.text, alignItems: 'center', justifyContent: 'center' }} aria-hidden>
                  <Body size={11} weight="heavy" color={t.bg} maxFontSizeMultiplier={fontScale.graphic}>
                    ?
                  </Body>
                </View>
              ) : null}
            </View>
            <Body size={typeScale.text.sm} weight="heavy" color={t.text} maxFontSizeMultiplier={fontScale.chrome}>
              {on ? `✓ ${b.name}` : b.name}
            </Body>
            <Body size={11} weight="bold" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
              {b.how}
            </Body>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- deck, settings and account */

function Archived({ archived }: { archived: Habit[] }) {
  const t = useTheme();
  const { restoreHabit } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  if (!archived.length) return null;

  async function restore(h: Habit) {
    setBusy(h.id);
    try {
      await restoreHabit(h.id);
      feel.ceiling();
    } catch (e) {
      ask('That card didn’t come back', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <Label>{`Out of the deck · ${archived.length}`}</Label>
      <Body size={typeScale.text.sm} color={t.textSecondary}>
        Their kept days still count in the Court.
      </Body>
      <Rows>
        {archived.map((h) => {
          const c = cardColors[h.color];
          return (
            <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <View style={{ width: 30, height: 40, borderRadius: 7, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', opacity: 0.6 }} aria-hidden>
                <SuitGlyph suit={h.suit} size={14} color={c.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Body weight="heavy" numberOfLines={1}>
                  {h.name}
                </Body>
                <Body size={12} color={t.textSecondary} numberOfLines={1}>{`${SUIT_INFO[h.suit].part} · ${h.floorLabel}`}</Body>
              </View>
              <Button label="Return to deck" variant="quiet" busy={busy === h.id} disabled={!!busy && busy !== h.id} onPress={() => restore(h)} style={{ paddingHorizontal: space.md }} />
            </View>
          );
        })}
      </Rows>
    </View>
  );
}

function Feel() {
  const t = useTheme();
  const { prefs, setPrefs } = usePrefs();
  return (
    <Section title="Sound and feel">
      <Rows>
        <Toggle label="Music" about="A slow tune for the card room while you play." on={prefs.music} onChange={(music) => setPrefs({ music })} />
        <Toggle
          label="Sounds"
          about="A sound for each swipe, card and Showdown."
          on={prefs.sounds}
          onChange={(sounds) => {
            setPrefs({ sounds });
            if (sounds) playSound('tap');
          }}
        />
        <Toggle
          label="Haptics"
          about="A tap you can feel for each swipe and card."
          on={prefs.haptics}
          onChange={(haptics) => {
            setPrefs({ haptics });
            if (haptics) feel.tick();
          }}
        />
      </Rows>
      <Body size={typeScale.text.sm} color={t.textSecondary}>
        Your phone’s silent switch quiets the music and sounds.
      </Body>
    </Section>
  );
}

function Account() {
  const t = useTheme();
  const { demo, guest, endDemo, startOwnDeck } = useAuth();
  const { deleteDeck } = useData();
  const [saving, setSaving] = useState(false);

  const removeDeck = async (then?: () => Promise<unknown>) => {
    try {
      await deleteDeck();
      feel.floor();
      if (then) await then();
    } catch (e) {
      ask('Your deck is still here', e instanceof Error ? e.message : 'Try again.');
    }
  };

  const confirmDelete = () =>
    ask(
      'Delete your deck?',
      demo
        ? 'The demo deck empties and starts again from the first deal. Nothing here is saved anyway.'
        : 'Every card, kept day, hand and call goes, and your north star with it. This can’t be undone. You start again from the first deal.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete my deck', style: 'destructive', onPress: () => void removeDeck() },
      ],
    );

  const leaveDemo = () =>
    menu('Leave the demo?', 'That was a made-up player ten weeks in. Your own deck deals today.', [
      { text: 'Deal me in', onPress: () => void startOwnDeck() },
      { text: 'Back to the first screen', onPress: endDemo },
      { text: 'Keep exploring', style: 'cancel' },
    ]);

  const signOut = () => {
    if (!guest) {
      supabase.auth.signOut().catch(() => {});
      return;
    }
    menu('Save your deck first?', 'Signing out deletes this deck. Save it to an account and it’s there when you sign in again.', [
      { text: 'Save my deck', onPress: () => setSaving(true) },
      { text: 'Sign out and delete it', style: 'destructive', onPress: () => void removeDeck(() => supabase.auth.signOut()) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Section title="Account">
      {guest && !demo ? <SaveDeckCard moment="you" /> : null}
      {demo ? (
        <Body size={typeScale.text.sm} color={t.textSecondary}>
          This is the demo deck: a made-up player ten weeks in. Nothing in it is saved.
        </Body>
      ) : null}
      <Rows>
        {PRIVACY_URL ? <Row label="Privacy" detail="What Do Better keeps, and why" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} /> : null}
        {FEEDBACK_EMAIL ? <Row label="Send feedback" detail="Straight to the person who makes it" onPress={() => Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Do Better feedback')}`).catch(() => {})} /> : null}
        <Row label="Delete my deck" detail={demo ? 'Start the demo from the first deal' : 'Cards, kept days, hands and calls'} danger onPress={confirmDelete} />
        {demo ? <Row label="Leave the demo" onPress={leaveDemo} /> : <Row label={guest ? 'Save my deck first' : 'Sign out'} detail={guest ? 'Signing out deletes this deck' : undefined} onPress={signOut} />}
      </Rows>
      <SaveSheet visible={saving} onClose={() => setSaving(false)} />
    </Section>
  );
}

/* ---------------------------------------------------------------- rows */

function Rows({ children }: { children: ReactNode }) {
  const t = useTheme();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  if (!items.length) return null;
  return (
    <View style={{ backgroundColor: t.bgRaised, borderRadius: radius.lg, overflow: 'hidden', borderWidth: t.edge === 'transparent' ? 0 : 1, borderColor: t.edge }}>
      {items.map((child, i) => (
        <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
          {child}
        </View>
      ))}
    </View>
  );
}

function Row({ label, detail, danger, onPress }: { label: string; detail?: string; danger?: boolean; onPress: () => void }) {
  const t = useTheme();
  const ink = danger ? (t.scheme === 'dark' ? cardColors.tomato.onDark : cardColors.tomato.bg) : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="heavy" color={ink}>
          {label}
        </Body>
        {detail ? (
          <Body size={typeScale.text.sm} color={t.textSecondary}>
            {detail}
          </Body>
        ) : null}
      </View>
      <Display size={22} color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic}>
        ›
      </Display>
    </Pressable>
  );
}

function Toggle({ label, about, on, onChange }: { label: string; about: string; on: boolean; onChange: (on: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={label}
      accessibilityHint={about}
      onPress={() => onChange(!on)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP + 16, paddingHorizontal: space.lg, paddingVertical: space.md }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="heavy">{label}</Body>
        <Body size={typeScale.text.sm} color={t.textSecondary}>
          {about}
        </Body>
      </View>
      <View style={{ width: 52, height: 32, borderRadius: 16, padding: 3, backgroundColor: on ? t.text : t.border, alignItems: on ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: on ? t.bg : t.bgRaised }} />
      </View>
    </Pressable>
  );
}
