import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YTPlayerEvent, YTPlayerOptions } from './youtube';
import { useYouTubePlayer } from './useYouTubePlayer';

/** A fake window.YT whose player time the test controls. */
const fake = { time: 0, options: null as YTPlayerOptions | null, destroyed: false };

const unloaded: string[] = [];
const target = {
  getCurrentTime: () => fake.time,
  destroy: () => {},
  unloadModule: (name: string) => unloaded.push(name),
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
    unloaded.length = 0;
    window.YT = {
      Player: class {
        constructor(_el: HTMLElement, options: YTPlayerOptions) {
          fake.options = options;
        }
        getCurrentTime() {
          return fake.time;
        }
        destroy() {
          fake.destroyed = true;
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

  it('destroys the player on unmount', async () => {
    const { unmount } = setup();
    await ready();

    unmount();

    expect(fake.destroyed).toBe(true);
  });
});
