import type { NormalizedEventOdds, NormalizedOutcome, OddsFetchResult } from "./types";
import { buildCacheKey, dedupeInFlight, getCached, setCached } from "./cache";

const FETCH_TIMEOUT_MS = 8_000;
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

type RawOutcome = { name: string; price: number; point?: number };
type RawMarket = { key: string; outcomes: RawOutcome[] };
type RawBookmaker = { key: string; markets: RawMarket[] };
type RawEventOdds = { id: string; commence_time: string; bookmakers: RawBookmaker[] };

function normalize(raw: RawEventOdds, bookmakerKey: string, sportsbookLabel: string): NormalizedEventOdds {
  const bookmaker = raw.bookmakers.find((b) => b.key === bookmakerKey);
  const outcomes: NormalizedOutcome[] = [];
  for (const market of bookmaker?.markets ?? []) {
    for (const outcome of market.outcomes) {
      outcomes.push({
        marketKey: market.key,
        name: outcome.name,
        point: outcome.point ?? null,
        priceAmerican: outcome.price,
      });
    }
  }
  return {
    eventId: raw.id,
    sportsbook: sportsbookLabel,
    commenceTime: raw.commence_time ?? null,
    outcomes,
  };
}

export type FetchEventOddsParams = {
  sportKey: string;
  eventId: string;
  bookmakerKey: string;
  sportsbookLabel: string;
  marketKeys: string[];
};

async function fetchFromProvider(params: FetchEventOddsParams, apiKey: string): Promise<OddsFetchResult> {
  const url = new URL(`${ODDS_API_BASE}/sports/${params.sportKey}/events/${params.eventId}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", [...new Set(params.marketKeys)].sort().join(","));
  url.searchParams.set("bookmakers", params.bookmakerKey);
  url.searchParams.set("oddsFormat", "american");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404) {
      return {
        eventId: params.eventId,
        status: "not_found",
        fetchedAt: new Date().toISOString(),
        odds: null,
        warning: "Event not found or no longer offered by this sportsbook.",
      };
    }
    if (!response.ok) {
      return {
        eventId: params.eventId,
        status: "provider_error",
        fetchedAt: new Date().toISOString(),
        odds: null,
        warning: "Odds provider returned an error.",
      };
    }
    const raw = (await response.json()) as RawEventOdds;
    const normalized = normalize(raw, params.bookmakerKey, params.sportsbookLabel);
    return {
      eventId: params.eventId,
      status: "ok",
      fetchedAt: new Date().toISOString(),
      odds: normalized,
      warning: normalized.outcomes.length === 0 ? "No matching markets returned for this sportsbook." : null,
    };
  } catch {
    return {
      eventId: params.eventId,
      status: "provider_error",
      fetchedAt: new Date().toISOString(),
      odds: null,
      warning: "Could not reach the odds provider.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches (or serves from cache) combined odds for one event's market set.
 * Never called once per leg — callers group legs by event + market set first.
 */
export async function fetchEventOdds(params: FetchEventOddsParams): Promise<OddsFetchResult> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return {
      eventId: params.eventId,
      status: "not_configured",
      fetchedAt: new Date().toISOString(),
      odds: null,
      warning: "Odds provider is not configured in this environment.",
    };
  }

  const cacheKey = buildCacheKey({
    sport: params.sportKey,
    eventId: params.eventId,
    sportsbook: params.bookmakerKey,
    marketKeys: params.marketKeys,
  });

  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = await dedupeInFlight(cacheKey, () => fetchFromProvider(params, apiKey));
  setCached(cacheKey, result);
  return result;
}
