import { useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { clockMinutes, clockOf, QUIET, type Cue } from '@/engine/cues';
import { daysBetween, type Day } from '@/engine/day';
import { playsLine, type PartOfDay } from '@/engine/playbook';
import { useAuth } from '@/lib/auth';
import { remindersSupported, requestPermission, usePlannedCues } from '@/lib/cues';
import { useDeck } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { usePrefs, type Reminders } from '@/lib/prefs';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, cardFace, fontScale, INK, on, radius, space, TAP, typeScale } from '@/theme/tokens';

import { ask } from './Ask';
import { SuitGlyph } from './Suit';
import { Body, Display, Label, raisedStyle, Section } from './ui';

const APP_ICON = require('@/assets/favicon.png');

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "20:30" as the phone writes times: "8:30 PM" or "20:30". */
export function clockLabel(clock: string): string {
  const m = clockMinutes(clock) ?? 0;
  return timeFormat.format(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60));
}

const asUtc = (day: Day) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** "Tonight", "Tomorrow", "Monday" or "Mon 26 Oct", for when a reminder goes out. */
export function whenLabel(day: Day, at: string, today: Day): string {
  const ahead = daysBetween(today, day);
  if (ahead === 0) return (clockMinutes(at) ?? 0) >= 17 * 60 ? 'Tonight' : 'Today';
  if (ahead === 1) return 'Tomorrow';
  if (ahead < 7) return weekdayFormat.format(asUtc(day));
  return dateFormat.format(asUtc(day));
}

/** A sensible first time for a card's own reminder, from when it usually plays. */
export function suggestedTime(part: PartOfDay): string {
  return { morning: '07:30', midday: '12:30', evening: '19:00', any: '18:00' }[part];
}

const STEP = 15;
const QUIET_FROM = clockMinutes(QUIET.from)!;
const QUIET_UNTIL = clockMinutes(QUIET.until)!;

function PlusMinus({ sign, onPress, onLongPress, label, disabled }: { sign: '+' | '-'; onPress: () => void; onLongPress: () => void; label: string; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 2,
        borderColor: t.text,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Line x1={3} y1={10} x2={17} y2={10} stroke={t.text} strokeWidth={2.6} strokeLinecap="round" />
        {sign === '+' ? <Line x1={10} y1={3} x2={10} y2={17} stroke={t.text} strokeWidth={2.6} strokeLinecap="round" /> : null}
      </Svg>
    </Pressable>
  );
}

/**
 * A time, chosen with big minus and plus buttons in quarter hours (hold for a whole hour) and a row of
 * quick picks. Works the same on every phone and on the web, and VoiceOver can swipe it up and down.
 */
export function TimeChooser({
  value,
  onChange,
  label,
  presets = [],
  size = 'lg',
  quietHours = false,
  style,
}: {
  value: string;
  onChange: (clock: string) => void;
  /** What the time is for, read out first: "Last call". */
  label: string;
  presets?: readonly string[];
  size?: 'lg' | 'md';
  /** Keep the time out of 21:30 to 07:30, for reminders the app sends on its own. */
  quietHours?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const minutes = clockMinutes(value) ?? 0;
  const lo = quietHours ? QUIET_UNTIL : 0;
  const hi = quietHours ? QUIET_FROM : 24 * 60 - STEP;
  const move = (by: number) => {
    let next = Math.round((minutes + by) / STEP) * STEP;
    if (quietHours) next = Math.min(hi, Math.max(lo, next));
    else next = ((next % 1440) + 1440) % 1440;
    if (next === minutes) return;
    feel.tick();
    onChange(clockOf(next));
  };
  const big = size === 'lg' ? typeScale.display.xl : typeScale.display.lg;
  return (
    <View style={[{ gap: space.md }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <PlusMinus sign="-" label={`${label} earlier`} onPress={() => move(-STEP)} onLongPress={() => move(-60)} disabled={quietHours && minutes <= lo} />
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: clockLabel(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => move(e.nativeEvent.actionName === 'increment' ? STEP : -STEP)}
          style={{ flex: 1, alignItems: 'center' }}
        >
          <Display size={big} numberOfLines={1} maxFontSizeMultiplier={fontScale.graphic} style={{ fontVariant: ['tabular-nums'] }}>
            {clockLabel(value)}
          </Display>
        </View>
        <PlusMinus sign="+" label={`${label} later`} onPress={() => move(STEP)} onLongPress={() => move(60)} disabled={quietHours && minutes >= hi} />
      </View>
      {presets.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm }}>
          {presets.map((p) => {
            const active = p === clockOf(minutes);
            return (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityLabel={clockLabel(p)}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  feel.tick();
                  onChange(p);
                }}
                style={({ pressed }) => ({
                  minHeight: 36,
                  paddingHorizontal: space.md,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  borderColor: active ? t.text : t.border,
                  backgroundColor: active ? t.text : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Body weight="heavy" size={typeScale.text.sm} color={active ? t.bg : t.text} maxFontSizeMultiplier={fontScale.chrome}>
                  {clockLabel(p)}
                </Body>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** A reminder drawn the way it lands on the phone, on a paper-white banner. */
export function ReminderBanner({ title, body, when, style }: { title: string; body: string; when: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessible
      accessibilityLabel={`${when}: ${title}. ${body}`}
      style={[
        {
          backgroundColor: cardFace.bg,
          borderRadius: 22,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          gap: 2,
          boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 }}>
        <Image source={APP_ICON} style={{ width: 20, height: 20, borderRadius: 5 }} />
        <Body weight="heavy" size={12} color="rgba(23, 18, 31, 0.62)" maxFontSizeMultiplier={fontScale.chrome} style={{ flex: 1, letterSpacing: 0.6 }} numberOfLines={1}>
          DO BETTER
        </Body>
        <Body weight="semi" size={12} color="rgba(23, 18, 31, 0.62)" maxFontSizeMultiplier={fontScale.chrome}>
          {when}
        </Body>
      </View>
      <Body weight="heavy" size={15} color={INK} maxFontSizeMultiplier={fontScale.chrome} numberOfLines={1}>
        {title}
      </Body>
      <Body size={15} color={INK} maxFontSizeMultiplier={fontScale.chrome} numberOfLines={2} style={{ lineHeight: 20 }}>
        {body}
      </Body>
    </View>
  );
}

/** A labelled on and off switch, a whole row tall. */
export function ToggleRow({ label, caption, value, onChange, disabled }: { label: string; caption?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="heavy" size={typeScale.text.lg}>
          {label}
        </Body>
        {caption ? (
          <Body size={typeScale.text.sm} color={t.textSecondary}>
            {caption}
          </Body>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={caption}
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          feel.tick();
          onChange(v);
        }}
        trackColor={{ false: t.border, true: t.text }}
        thumbColor={value ? t.bg : '#FFFFFF'}
        ios_backgroundColor={t.border}
      />
    </View>
  );
}

/**
 * Turns reminders on: asks the phone first (only now, after the player chose to), then saves the answer.
 * Says how to fix it when the phone has notifications switched off.
 */
export function useTurnOnReminders(): (patch?: Partial<Reminders>) => Promise<boolean> {
  const { setPrefs } = usePrefs();
  return async (patch = {}) => {
    const allowed = await requestPermission();
    setPrefs((p) => ({ reminders: { ...p.reminders, ...patch, asked: true, on: allowed } }));
    if (!allowed) {
      ask('Notifications are off for Do Better', 'Turn them on in Settings and your reminders will start.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    }
    return allowed;
  };
}

function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.bgRaised, borderRadius: radius.lg, padding: space.lg, gap: space.md }, style]}>{children}</View>;
}

function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border, marginHorizontal: -space.lg }} />;
}

/** A time shown as a pill that opens its chooser. */
function TimePill({ value, placeholder, onPress, open, label }: { value: string | null; placeholder: string; onPress: () => void; open: boolean; label: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${clockLabel(value)}` : `${label}, ${placeholder}`}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        backgroundColor: value ? t.text : 'transparent',
        borderWidth: 1.5,
        borderColor: value ? t.text : t.dashed,
        borderStyle: value ? 'solid' : 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Body weight="heavy" size={typeScale.text.md} color={value ? t.bg : t.text} maxFontSizeMultiplier={fontScale.chrome} style={{ fontVariant: ['tabular-nums'] }}>
        {value ? clockLabel(value) : placeholder}
      </Body>
    </Pressable>
  );
}

/**
 * Reminder settings for the You screen: on or off, the last call time, the morning after, a time for
 * any single card, and what's coming up. On the web and in the demo the controls show but stay off, and
 * say why. `preview` shows them working anyway, for screenshots.
 */
export function ReminderSettings({ preview = false }: { preview?: boolean }) {
  const t = useTheme();
  const deck = useDeck();
  const { demo } = useAuth();
  const { prefs, setPrefs } = usePrefs();
  const turnOn = useTurnOnReminders();
  const planned = usePlannedCues(deck);
  const [open, setOpen] = useState<string | null>(null);
  const r = prefs.reminders;
  const usable = preview || (remindersSupported && !demo);
  const live = usable && r.on;
  const set = (patch: Partial<Reminders>) => setPrefs((p) => ({ reminders: { ...p.reminders, ...patch } }));
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  const why = !remindersSupported && !preview ? 'Reminders come from the app on your phone. Open Do Better there to turn them on.' : demo && !preview ? 'The demo deck never sends reminders. Start your own deck to turn them on.' : null;

  return (
    <Section title="Reminders">
      <Panel>
        <ToggleRow
          label="Remind me"
          caption={`A nudge while a card is still open. Two a day at most, and never after ${clockLabel(QUIET.from)}.`}
          value={live}
          disabled={!usable}
          onChange={(v) => {
            if (!v) set({ on: false, asked: true });
            else if (preview) set({ on: true, asked: true });
            else void turnOn();
          }}
        />
        {why ? (
          <Body size={typeScale.text.sm} color={t.textSecondary}>
            {why}
          </Body>
        ) : null}
        {live ? (
          <>
            <Divider />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Body weight="heavy" size={typeScale.text.lg}>
                  Last call
                </Body>
                <Body size={typeScale.text.sm} color={t.textSecondary}>
                  Only while a card is still open
                </Body>
              </View>
              <TimePill label="Last call" value={r.lastCall} placeholder="Set" open={open === 'last'} onPress={() => toggle('last')} />
            </View>
            {open === 'last' ? <TimeChooser label="Last call" value={r.lastCall} onChange={(v) => set({ lastCall: v })} size="md" quietHours presets={['18:00', '19:30', '20:30', '21:30']} /> : null}
            <Divider />
            <ToggleRow label="The morning after" caption={`After a quiet day, a nudge at ${clockLabel('09:00')} to log yesterday or still save it.`} value={r.morning} onChange={(v) => set({ morning: v })} />
          </>
        ) : null}
      </Panel>

      {live && deck && deck.cards.length ? (
        <Panel>
          <View style={{ gap: 2 }}>
            <Label>When it plays</Label>
            <Body size={typeScale.text.sm} color={t.textSecondary}>
              A reminder at the exact time a card plays, every day it’s still open. These never count towards the two a day.
            </Body>
          </View>
          {deck.cards.map((c) => {
            const colour = cardColors[c.habit.color];
            const time = r.perHabit[c.habit.id] ?? null;
            const key = `habit:${c.habit.id}`;
            const when = c.habit.anchor?.trim() || c.habit.whenWhere?.trim();
            return (
              <View key={c.habit.id} style={{ gap: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP }}>
                  <View aria-hidden style={{ width: 36, height: 44, borderRadius: 8, backgroundColor: colour.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <SuitGlyph suit={c.habit.suit} size={18} color={colour.ink} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body weight="heavy" size={typeScale.text.md} numberOfLines={1}>
                      {c.habit.name}
                    </Body>
                    <Body size={typeScale.text.sm} color={t.textSecondary} numberOfLines={1}>
                      {when ? playsLine(when) : 'No time of day yet'}
                    </Body>
                  </View>
                  <TimePill
                    label={`${c.habit.name} reminder`}
                    value={time}
                    placeholder="Add"
                    open={open === key}
                    onPress={() => {
                      if (!time) set({ perHabit: { ...r.perHabit, [c.habit.id]: suggestedTime(c.partOfDay) } });
                      toggle(key);
                    }}
                  />
                </View>
                {open === key && time ? (
                  <View style={{ gap: space.sm }}>
                    <TimeChooser label={`${c.habit.name} reminder`} value={time} onChange={(v) => set({ perHabit: { ...r.perHabit, [c.habit.id]: v } })} size="md" />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove the ${c.habit.name} reminder`}
                      onPress={() => {
                        const { [c.habit.id]: _gone, ...rest } = r.perHabit;
                        set({ perHabit: rest });
                        setOpen(null);
                      }}
                      style={({ pressed }) => ({ alignSelf: 'center', minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.lg, opacity: pressed ? 0.6 : 1 })}
                    >
                      <Body weight="heavy" size={typeScale.text.sm} color={t.textSecondary}>
                        Remove this reminder
                      </Body>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </Panel>
      ) : null}

      {live && deck && planned.length ? <ComingUp cues={planned.slice(0, 3)} today={deck.today} /> : null}
    </Section>
  );
}

/** The next few reminders, stacked like they'd sit on the lock screen. */
function ComingUp({ cues, today }: { cues: readonly Cue[]; today: Day }) {
  const t = useTheme();
  const scene = t.raised;
  const ink = on(scene);
  return (
    <View style={[{ borderRadius: radius.lg, padding: space.lg, gap: space.md }, raisedStyle(t)]}>
      <Label color={t.onRaisedSecondary}>Coming up</Label>
      {cues.map((c, i) => (
        <ReminderBanner key={c.id} title={c.title} body={c.body} when={`${whenLabel(c.day, c.at, today)} ${clockLabel(c.at)}`} style={{ transform: [{ scale: 1 - i * 0.02 }] }} />
      ))}
      <Body size={typeScale.text.sm} color={ink.secondary}>
        Keep a card and anything that no longer applies is taken off.
      </Body>
    </View>
  );
}
