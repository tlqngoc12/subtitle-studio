import { vi } from 'vitest';

export type Route = { method: string; path: string; status: number; body?: unknown; delay?: Promise<void> };
export type Call = { method: string; path: string; body?: BodyInit | null };

/** Minimal fetch fake: first matching route wins; unmatched requests fail like a network error. */
export function fakeFetch(routes: Route[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input);
      calls.push({ method, path, body: init?.body });
      const route = routes.find((r) => r.method === method && r.path === path);
      if (!route) throw new TypeError('Failed to fetch');
      if (route.delay) await route.delay;
      return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
        status: route.status,
        headers: { 'Content-Type': route.status >= 400 ? 'application/problem+json' : 'application/json' },
      });
    }),
  );
  return calls;
}

export function problem(status: number, code: string, detail: string) {
  return { type: 'about:blank', title: 'Error', status, detail, code };
}
