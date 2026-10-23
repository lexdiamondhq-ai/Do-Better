import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dayChord, handChord, KEY_SOUNDS, strum, TONES } from '@/engine/chord';

// The sounds are required as files, which the bundler turns into assets. Under the test runner, Node
// loads them instead, so each one is taught to load as just its path.
type Loader = (loaded: { exports: unknown }, filename: string) => void;
const nodeRequire = require as unknown as { extensions: Record<string, Loader> };
for (const ext of ['.mp3', '.m4a']) {
  nodeRequire.extensions[ext] = (loaded, filename) => {
    loaded.exports = filename;
  };
}

/** Every play() asked of a player, by what it was made from: an effect's file, or the music. */
const played: string[] = [];
/** Every player made, by its file. */
const created: string[] = [];

vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => {},
  createAudioPlayer: (source: unknown) => (created.push(String(source)), {
    volume: 1,
    loop: false,
    playing: false,
    seekTo: async () => {},
    play() {
      this.playing = true;
      played.push(String(source));
    },
    pause() {},
    addListener() {},
  }),
}));

let os = 'web';
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return os;
    },
  },
}));

/** A page that only knows how to be listened to, which is all the module asks of it. */
type Listener = (e: { type: string; key?: string }) => void;
let listeners: Record<string, Listener[]> = {};
function fire(type: string, key?: string) {
  for (const l of listeners[type] ?? []) l({ type, key });
}

async function load({ activation }: { activation: { hasBeenActive: boolean } | null }) {
  vi.resetModules();
  listeners = {};
  vi.stubGlobal('document', { addEventListener: (type: string, l: Listener) => (listeners[type] ??= []).push(l) });
  vi.stubGlobal('navigator', activation ? { userActivation: activation } : {});
  return import('./sound');
}

beforeEach(() => {
  played.length = 0;
  created.length = 0;
  os = 'web';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sound on the web', () => {
  it('asks nothing to play before the page has been used, so a reload never throws', async () => {
    const activation = { hasBeenActive: false };
    const sound = await load({ activation });
    sound.setSoundSettings({ sounds: true, music: true });
    sound.playSound('tap');
    sound.playSound('flip', 300);
    vi.advanceTimersByTime(400);
    expect(played).toEqual([]);
  });

  it('starts the music on the first tap, and plays effects from then on', async () => {
    const activation = { hasBeenActive: false };
    const sound = await load({ activation });
    sound.setSoundSettings({ sounds: true, music: true });
    activation.hasBeenActive = true;
    fire('pointerup');
    expect(played).toHaveLength(1);
    sound.playSound('tap');
    expect(played).toHaveLength(2);
  });

  it('believes the browser over its own guess: a key the browser does not count changes nothing', async () => {
    const activation = { hasBeenActive: false };
    const sound = await load({ activation });
    sound.setSoundSettings({ sounds: true, music: false });
    fire('keydown', 'Shift');
    sound.playSound('tap');
    expect(played).toEqual([]);
  });

  it('waits for a tap in a browser that cannot say whether it has been used, and Escape is not one', async () => {
    const sound = await load({ activation: null });
    sound.setSoundSettings({ sounds: true, music: false });
    sound.playSound('tap');
    fire('keydown', 'Escape');
    sound.playSound('tap');
    expect(played).toEqual([]);
    fire('click');
    sound.playSound('tap');
    expect(played).toHaveLength(1);
  });

  it('plays nothing with sounds off, even after a tap', async () => {
    const sound = await load({ activation: { hasBeenActive: true } });
    sound.setSoundSettings({ sounds: false, music: false });
    sound.playSound('tap');
    expect(played).toEqual([]);
  });
});

describe('sound on a phone', () => {
  it('plays straight away, with no tap to wait for', async () => {
    os = 'ios';
    const sound = await load({ activation: null });
    sound.setSoundSettings({ sounds: true, music: true });
    expect(played).toHaveLength(1);
    sound.playSound('tap');
    expect(played).toHaveLength(2);
  });
});

/** The file a play() came from, without its folder: "ring-f4.mp3". */
const file = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const size = (path: string) => ts.sys.getFileSize?.(path) ?? 0;

describe('the day’s chord, in sound', () => {
  it('has a file for every keep sound and every note the engine can ask for', async () => {
    const sound = await load({ activation: { hasBeenActive: true } });
    for (const name of [...KEY_SOUNDS, ...TONES]) expect(sound.SOUND_NAMES).toContain(name);
  });

  it('gives each new sound its own small mp3, and the deal its own brush', async () => {
    os = 'ios';
    const sound = await load({ activation: null });
    sound.setSoundSettings({ sounds: false, music: false });
    sound.setSoundSettings({ sounds: true, music: false });
    for (const name of sound.SOUND_NAMES) {
      sound.playSound(name);
    }
    const files = played.map(file);
    for (const name of [...KEY_SOUNDS.filter((k) => k.includes('-')), ...TONES, 'deal']) expect(files).toContain(`${name}.mp3`);
    for (const path of new Set(played)) {
      expect(ts.sys.fileExists(path)).toBe(true);
      expect(path.endsWith('.mp3')).toBe(true);
      if (/(floor|ceiling|resolve|ring)-|deal/.test(file(path))) {
        expect(size(path)).toBeGreaterThan(2_000);
        expect(size(path)).toBeLessThan(25_000);
      }
    }
  });

  it('loads the everyday sounds up front and makes each chord sound only when it first plays', async () => {
    os = 'ios';
    const sound = await load({ activation: null });
    sound.setSoundSettings({ sounds: true, music: false });
    const isChord = (path: string) => /(floor|ceiling|resolve|ring)-/.test(file(path));
    expect(created.filter(isChord)).toEqual([]);
    expect(created.map(file)).toContain('floor.mp3');
    expect(created.map(file)).toContain('deal.mp3');
    sound.playSound('floor-clubs');
    sound.playSound('floor-clubs');
    expect(created.filter(isChord).map(file)).toEqual(['floor-clubs.mp3']);
    expect(played.map(file)).toEqual(['floor-clubs.mp3', 'floor-clubs.mp3']);
  });

  it('strums each note at its time after the start, every player made before the first rings', async () => {
    os = 'ios';
    const sound = await load({ activation: null });
    sound.setSoundSettings({ sounds: true, music: false });
    const steps = strum(['ring-d5', 'ring-f4', 'ring-a5']);
    sound.playTones(steps, 380);
    expect(created.filter((p) => file(p).startsWith('ring-')).map(file).sort()).toEqual(['ring-a5.mp3', 'ring-a5.mp3', 'ring-d5.mp3', 'ring-d5.mp3', 'ring-f4.mp3', 'ring-f4.mp3']);
    expect(played).toEqual([]);
    vi.advanceTimersByTime(379);
    expect(played).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(played.map(file)).toEqual(['ring-f4.mp3']);
    vi.advanceTimersByTime(70);
    expect(played.map(file)).toEqual(['ring-f4.mp3', 'ring-d5.mp3']);
    vi.advanceTimersByTime(70);
    expect(played.map(file)).toEqual(['ring-f4.mp3', 'ring-d5.mp3', 'ring-a5.mp3']);
  });

  it('gives back the moment a strum counts from, sounds on or off, so the pills can ring with it', async () => {
    os = 'ios';
    const sound = await load({ activation: null });
    vi.setSystemTime(new Date('2026-10-23T19:00:00-04:00'));
    sound.setSoundSettings({ sounds: true, music: false });
    expect(sound.playTones(strum(['ring-f4']), 380)).toBe(Date.parse('2026-10-23T19:00:00-04:00'));
    sound.setSoundSettings({ sounds: false, music: false });
    expect(sound.playTones(strum(['ring-f4']), 380)).toBe(Date.parse('2026-10-23T19:00:00-04:00'));
  });

  it('rings a hand’s chord from the moment it’s asked, a low F for a card with no suit', async () => {
    os = 'ios';
    const sound = await load({ activation: null });
    sound.setSoundSettings({ sounds: true, music: false });
    const cards = [
      { rank: 9 as const, suit: 'hearts' as const, day: '2026-10-19', joker: false },
      { rank: 9 as const, suit: null, day: '2026-10-20', joker: false },
    ];
    sound.playTones(handChord({ kind: 'pair', cards }));
    expect(played.map(file)).toEqual(['ring-a4.mp3']);
    vi.advanceTimersByTime(90);
    expect(played.map(file)).toEqual(['ring-a4.mp3', 'ring-low.mp3']);
  });

  it('stops a strum halfway when sounds are turned off, and rings nothing with sounds off', async () => {
    os = 'ios';
    const sound = await load({ activation: null });
    sound.setSoundSettings({ sounds: true, music: false });
    sound.playTones(strum(dayChord([{ suit: 'spades', level: 'ceiling' }, { suit: 'clubs', level: 'floor' }]).notes), 0);
    expect(played.map(file)).toEqual(['ring-f4.mp3']);
    sound.setSoundSettings({ sounds: false, music: false });
    vi.advanceTimersByTime(500);
    expect(played.map(file)).toEqual(['ring-f4.mp3']);
    created.length = 0;
    sound.playTones(strum(['ring-c5']), 0);
    vi.advanceTimersByTime(500);
    expect(played.map(file)).toEqual(['ring-f4.mp3']);
    expect(created).toEqual([]);
  });

  it('waits for the first tap on the web before ringing anything', async () => {
    const activation = { hasBeenActive: false };
    const sound = await load({ activation });
    sound.setSoundSettings({ sounds: true, music: false });
    sound.playTones(strum(['ring-c5', 'ring-f4']), 0);
    vi.advanceTimersByTime(500);
    expect(played).toEqual([]);
    activation.hasBeenActive = true;
    sound.playTones(strum(['ring-c5', 'ring-f4']), 0);
    vi.advanceTimersByTime(500);
    expect(played.map(file)).toEqual(['ring-f4.mp3', 'ring-c5.mp3']);
  });
});
