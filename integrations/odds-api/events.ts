const EVENTS_TTL_MS = 10 * 60 * 1000; // upcoming-events list changes slowly; refetching every keystroke would be wasteful
const FETCH_TIMEOUT_MS = 8_000;
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

export type UpcomingEvent = {
  eventId: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
};

type RawEvent = { id: string; commence_time: string; home_team: string; away_team: string };

type CacheEntry = { expiresAt: number; events: UpcomingEvent[] };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<UpcomingEvent[]>>();

async function fetchFromProvider(sportKey: string, apiKey: string): Promise<UpcomingEvent[]> {
  const url = new URL(`${ODDS_API_BASE}/sports/${sportKey}/events`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("dateFormat", "iso");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Odds provider responded with ${response.status}`);
    const raw = (await response.json()) as RawEvent[];
    return raw.map((e) => ({
      eventId: e.id,
      commenceTime: e.commence_time,
      homeTeam: e.home_team,
      awayTeam: e.away_team,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lets the UI resolve a matchup to a real event id by league + teams
 * instead of asking the user to type the provider's opaque id. This is
 * the lightweight "list of events" call (no markets/bookmakers), so it
 * stays cheap even as a live-search-as-you-type source.
 */
export async function listUpcomingEvents(sportKey: string): Promise<UpcomingEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];

  const cached = cache.get(sportKey);
  if (cached && cached.expiresAt > Date.now()) return cached.events;

  let promise = inFlight.get(sportKey);
  if (!promise) {
    promise = fetchFromProvider(sportKey, apiKey).finally(() => inFlight.delete(sportKey));
    inFlight.set(sportKey, promise);
  }

  const events = await promise;
  cache.set(sportKey, { expiresAt: Date.now() + EVENTS_TTL_MS, events });
  return events;
}

export function __clearEventsCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
