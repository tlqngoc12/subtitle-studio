import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YTPlayerEvent, YTPlayerOptions } from './youtube';
import { useYouTubePlayer } from './useYouTubePlayer';

/** A fake window.YT whose player time the test controls. */
const fake = { time: 0, options: null as YTPlayerOptions | null, destroyed: false, created: 0, calls: [] as string[] };

const unloaded: string[] = [];
const target = {
  getCurrentTime: () => fake.time,
  destroy: () => {},
  unloadModule: (name: string) => unloaded.push(name),
  loadVideoById: (id: string) => {
    fake.calls.push(`load ${id}`);
  },
  seekTo: () => {},
  playVideo: () => {},
  cueVideoById: (id: string) => {
    fake.calls.push(`cue ${id}`);
  },
};
const event = (data: number): YTPlayerEvent => ({ data, target });

function setup(options?: { autoplay?: boolean }) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const ref = { current: el };
  return renderHook(() => useYouTubePlayer(ref, 'dQw4w9WgXcQ', options));
}

async function ready() {
  await act(async () => {
    await Promise.resolve(); // loadYouTubeApi resolves immediately when window.YT exists
  });
  act(() => fake.options!.events!.onReady!(event(-1)));
}

describe('useYouTubePlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.time = 0;
    fake.options = null;
    fake.destroyed = false;
    fake.created = 0;
    fake.calls = [];
    unloaded.length = 0;
    window.YT = {
      Player: class {
        constructor(_el: HTMLElement, options: YTPlayerOptions) {
          fake.options = options;
          fake.created++;
        }
        loadVideoById(id: string) {
          fake.calls.push(`load ${id}`);
        }
        cueVideoById(id: string) {
          fake.calls.push(`cue ${id}`);
        }
        getCurrentTime() {
          return fake.time;
        }
        destroy() {
          fake.destroyed = true;
        }
        playVideo() {
          fake.calls.push('play');
        }
        seekTo(seconds: number, allowSeekAhead: boolean) {
          fake.calls.push(`seek ${seconds} ${allowSeekAhead}`);
          fake.time = seconds;
        }
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.YT;
  });

  it('creates a no-cookie player without YouTube fullscreen', async () => {
    setup();
    await ready();

    expect(fake.options!.host).toBe('https://www.youtube-nocookie.com');
    expect(fake.options!.playerVars!.fs).toBe(0);
  });

  it('does not autoplay by default', async () => {
    setup();
    await ready();

    expect(fake.options!.playerVars!.autoplay ?? 0).toBe(0);
  });

  it('autoplays when asked (next video of a playlist)', async () => {
    setup({ autoplay: true });
    await ready();

    expect(fake.options!.playerVars!.autoplay).toBe(1);
  });

  it('seekTo moves the player to the given millisecond and updates the time at once', async () => {
    const { result } = setup();
    await ready();

    act(() => result.current.seekTo(12_500));

    expect(fake.calls).toContain('seek 12.5 true');
    expect(result.current.currentMs).toBe(12_500);
  });

  it('seekTo does nothing before the player is ready', async () => {
    const { result } = setup();

    act(() => result.current.seekTo(5_000));

    expect(fake.calls.filter((c) => c.startsWith('seek'))).toEqual([]);
  });

  it('play starts the player once it is ready, and does nothing before', async () => {
    const { result } = setup();
    act(() => result.current.play());
    expect(fake.calls).not.toContain('play');

    await ready();
    act(() => result.current.play());

    expect(fake.calls).toContain('play');
  });

  it('turns off YouTube built-in captions so only the Vietsub overlay shows', async () => {
    setup();
    await ready();

    expect(fake.options!.playerVars!.cc_load_policy).toBe(0);
    expect(unloaded).toContain('captions');
  });

  it('turns captions off again when playback starts', async () => {
    setup();
    await ready();
    unloaded.length = 0;

    act(() => fake.options!.events!.onStateChange!(event(1)));

    expect(unloaded).toContain('captions');
  });

  it('updates the time when the user seeks while paused', async () => {
    const { result } = setup();
    await ready();
    act(() => {
      fake.time = 10;
      fake.options!.events!.onStateChange!(event(2)); // paused at 0:10
    });
    expect(result.current.currentMs).toBe(10_000);

    // Seeking while paused often fires no state change at all.
    act(() => {
      fake.time = 90;
      vi.advanceTimersByTime(300);
    });

    expect(result.current.currentMs).toBe(90_000);
  });

  it('reports embedding blocked for errors 101 and 150', async () => {
    const { result } = setup();
    await ready();

    act(() => fake.options!.events!.onError!(event(150)));

    expect(result.current.error).toBe('EMBED_BLOCKED');
  });

  it('never reports the previous video as ended after switching videos', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ref = { current: el };
    const seen: [string, string][] = [];
    const { rerender } = renderHook(({ id }) => {
      const r = useYouTubePlayer(ref, id);
      seen.push([id, r.state]);
      return r;
    }, { initialProps: { id: 'aaaaaaaaaaa' } });
    await ready();
    act(() => fake.options!.events!.onStateChange!(event(0))); // ENDED
    expect(seen.at(-1)).toEqual(['aaaaaaaaaaa', 'ended']);

    rerender({ id: 'bbbbbbbbbbb' });

    // A playlist page reacting to 'ended' would otherwise skip the next video.
    expect(seen.filter(([id]) => id === 'bbbbbbbbbbb').map(([, state]) => state)).not.toContain('ended');
  });

  it('loads the next video into the same player when autoplay is on', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ref = { current: el };
    const { rerender } = renderHook(({ id }) => useYouTubePlayer(ref, id, { autoplay: true }), { initialProps: { id: 'aaaaaaaaaaa' } });
    await ready();

    rerender({ id: 'bbbbbbbbbbb' });

    expect(fake.created).toBe(1);
    expect(fake.destroyed).toBe(false);
    expect(fake.calls).toEqual(['load bbbbbbbbbbb']);
  });

  it('only cues the next video when autoplay is off', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ref = { current: el };
    const { rerender } = renderHook(({ id }) => useYouTubePlayer(ref, id, { autoplay: false }), { initialProps: { id: 'aaaaaaaaaaa' } });
    await ready();

    rerender({ id: 'bbbbbbbbbbb' });

    expect(fake.created).toBe(1);
    expect(fake.calls).toEqual(['cue bbbbbbbbbbb']);
  });

  it('shows the latest video when it changed before the player was ready', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ref = { current: el };
    const { rerender } = renderHook(({ id }) => useYouTubePlayer(ref, id, { autoplay: true }), { initialProps: { id: 'aaaaaaaaaaa' } });
    await act(async () => {
      await Promise.resolve();
    });
    rerender({ id: 'bbbbbbbbbbb' });
    expect(fake.calls).toEqual([]);

    act(() => fake.options!.events!.onReady!(event(-1)));

    expect(fake.calls).toEqual(['load bbbbbbbbbbb']);
  });

  it('destroys the player on unmount', async () => {
    const { unmount } = setup();
    await ready();

    unmount();

    expect(fake.destroyed).toBe(true);
  });
});
