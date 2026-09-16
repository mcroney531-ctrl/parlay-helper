import type { OddsFetchResult } from "./types";

const CACHE_TTL_MS = 60_000; // odds move fast; short server-side TTL just dedupes bursts

type CacheEntry = {
  expiresAt: number;
  result: OddsFetchResult;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<OddsFetchResult>>();

/** sport + event + region/bookmaker + sorted market set, per the handoff's grouping rule. */
export function buildCacheKey(params: {
  sport: string;
  eventId: string;
  sportsbook: string;
  marketKeys: string[];
}): string {
  const sortedMarkets = [...new Set(params.marketKeys)].sort().join(",");
  return `${params.sport}::${params.eventId}::${params.sportsbook}::${sortedMarkets}`;
}

export function getCached(key: string): OddsFetchResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

export function setCached(key: string, result: OddsFetchResult): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
}

/** Dedupes concurrent identical requests so N legs in one event never fan out to N provider calls. */
export async function dedupeInFlight(key: string, fetcher: () => Promise<OddsFetchResult>): Promise<OddsFetchResult> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetcher().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export function __clearCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
