import type { DayFile } from "@collector/day-schema";

export const LIVE_URL =
  "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media";
export const FIXTURE_URL = "/fixture/day.json";
export const POLL_MS = 120_000;
export const RETRY_MIN_MS = 15_000;
export const FETCH_TIMEOUT_MS = 30_000;

export const isFixture = (search: string) => new URLSearchParams(search).get("data") === "fixture";
export const dataUrl = (search: string) => (isFixture(search) ? FIXTURE_URL : LIVE_URL);

export interface PollerDeps {
  url: string;
  fetch: typeof fetch;
  onData: (d: DayFile) => void;
  onError: (e: unknown) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  visible?: () => boolean;
}

export function createPoller(d: PollerDeps): { start(): void; stop(): void; refresh(): void } {
  const { fetch: doFetch } = d;
  let handle: unknown = null;
  let failures = 0;
  let stopped = false;
  let gen = 0;
  let inFlight = false;
  const visible = d.visible ?? (() => true);

  const schedule = (ms: number, my: number) => {
    if (my === gen && !stopped) handle = d.setTimer(() => tick(my), ms);
  };

  async function tick(my: number) {
    if (!visible()) {
      schedule(POLL_MS, my);
      return;
    }
    inFlight = true;
    try {
      const res = await doFetch(d.url, { cache: "no-cache", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (my !== gen) return;
      if (!res.ok) throw new Error(`day.json ${res.status}`);
      const day = (await res.json()) as DayFile;
      if (my !== gen) return;
      d.onData(day);
      failures = 0;
      schedule(POLL_MS, my);
    } catch (e) {
      if (my !== gen) return;
      d.onError(e);
      schedule(Math.min(POLL_MS, RETRY_MIN_MS * 2 ** failures), my);
      failures++;
    } finally {
      if (my === gen) inFlight = false;
    }
  }

  return {
    start() {
      gen++;
      const my = gen;
      stopped = false;
      failures = 0;
      if (handle !== null) d.clearTimer(handle);
      inFlight = false;
      void tick(my);
    },
    refresh() {
      if (stopped || inFlight || gen === 0) return;
      if (handle !== null) d.clearTimer(handle);
      void tick(gen);
    },
    stop() {
      gen++;
      stopped = true;
      inFlight = false;
      if (handle !== null) d.clearTimer(handle);
    },
  };
}
