import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => {},
  createAudioPlayer: (source: unknown) => ({
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
