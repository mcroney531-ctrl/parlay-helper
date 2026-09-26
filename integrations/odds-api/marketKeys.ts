// Curated subset of The Odds API's real market keys. The UI must offer
// exact provider keys, not a guess derived from free-text — a typed label
// like "Receiving yards" never matches the provider's "player_reception_yds".
export type MarketOption = {
  key: string;
  label: string;
  requiresPlayer: boolean;
  // Whether this market's selection is a numeric line (over/under a number)
  // vs. a plain yes/no or side pick. Purely a UI hint for which fields the
  // details editor shows as relevant — not a validation rule.
  requiresLine: boolean;
};

export const MARKET_OPTIONS: MarketOption[] = [
  { key: "player_reception_yds", label: "Receiving Yards", requiresPlayer: true, requiresLine: true },
  { key: "player_receptions", label: "Receptions", requiresPlayer: true, requiresLine: true },
  { key: "player_rush_yds", label: "Rushing Yards", requiresPlayer: true, requiresLine: true },
  { key: "player_rush_attempts", label: "Rush Attempts", requiresPlayer: true, requiresLine: true },
  { key: "player_pass_yds", label: "Passing Yards", requiresPlayer: true, requiresLine: true },
  { key: "player_pass_tds", label: "Passing TDs", requiresPlayer: true, requiresLine: true },
  { key: "player_pass_completions", label: "Pass Completions", requiresPlayer: true, requiresLine: true },
  { key: "player_anytime_td", label: "Anytime TD Scorer", requiresPlayer: true, requiresLine: false },
  { key: "player_1st_td", label: "First TD Scorer", requiresPlayer: true, requiresLine: false },
  { key: "totals", label: "Game Total (Over/Under)", requiresPlayer: false, requiresLine: true },
  { key: "spreads", label: "Point Spread", requiresPlayer: false, requiresLine: true },
  { key: "h2h", label: "Moneyline", requiresPlayer: false, requiresLine: false },
];

export const CUSTOM_MARKET_VALUE = "__custom__";

export function marketLabelForKey(key: string | null): string | null {
  return MARKET_OPTIONS.find((m) => m.key === key)?.label ?? null;
}
