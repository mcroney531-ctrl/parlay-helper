// Curated subset of The Odds API's real market keys. The UI must offer
// exact provider keys, not a guess derived from free-text — a typed label
// like "Receiving yards" never matches the provider's "player_reception_yds".
export type MarketOption = {
  key: string;
  label: string;
  requiresPlayer: boolean;
};

export const MARKET_OPTIONS: MarketOption[] = [
  { key: "player_reception_yds", label: "Receiving Yards", requiresPlayer: true },
  { key: "player_receptions", label: "Receptions", requiresPlayer: true },
  { key: "player_rush_yds", label: "Rushing Yards", requiresPlayer: true },
  { key: "player_rush_attempts", label: "Rush Attempts", requiresPlayer: true },
  { key: "player_pass_yds", label: "Passing Yards", requiresPlayer: true },
  { key: "player_pass_tds", label: "Passing TDs", requiresPlayer: true },
  { key: "player_pass_completions", label: "Pass Completions", requiresPlayer: true },
  { key: "player_anytime_td", label: "Anytime TD Scorer", requiresPlayer: true },
  { key: "player_1st_td", label: "First TD Scorer", requiresPlayer: true },
  { key: "totals", label: "Game Total (Over/Under)", requiresPlayer: false },
  { key: "spreads", label: "Point Spread", requiresPlayer: false },
  { key: "h2h", label: "Moneyline", requiresPlayer: false },
];

export const CUSTOM_MARKET_VALUE = "__custom__";

export function marketLabelForKey(key: string | null): string | null {
  return MARKET_OPTIONS.find((m) => m.key === key)?.label ?? null;
}
