// Normalized shapes the rest of the app consumes. Keep The Odds API's raw
// response shape confined to client.ts so the domain/UI never depends on it.

export type OddsRequestLeg = {
  ideaId: string;
  sport: string;
  eventId: string;
  marketKey: string;
};

export type NormalizedOutcome = {
  marketKey: string;
  name: string; // e.g. "Over", "Under", player name for player props
  point: number | null;
  priceAmerican: number;
};

export type NormalizedEventOdds = {
  eventId: string;
  sportsbook: string;
  commenceTime: string | null;
  outcomes: NormalizedOutcome[];
};

export type OddsFetchResult = {
  eventId: string;
  status: "ok" | "not_found" | "provider_error" | "not_configured";
  fetchedAt: string;
  odds: NormalizedEventOdds | null;
  warning: string | null;
};
