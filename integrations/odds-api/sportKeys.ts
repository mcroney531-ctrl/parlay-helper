// Maps our internal league label to The Odds API's sport key.
// https://the-odds-api.com/sports-odds-data/sports-apis.html
const LEAGUE_TO_SPORT_KEY: Record<string, string> = {
  NFL: "americanfootball_nfl",
  NBA: "basketball_nba",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  NCAAF: "americanfootball_ncaaf",
  NCAAB: "basketball_ncaab",
};

const BOOKMAKER_KEY: Record<string, string> = {
  fanduel: "fanduel",
  draftkings: "draftkings",
  betmgm: "betmgm",
  caesars: "williamhill_us",
  espnbet: "espnbet",
};

export const SUPPORTED_LEAGUES = Object.keys(LEAGUE_TO_SPORT_KEY);

export function sportKeyForLeague(league: string | null): string | null {
  if (!league) return null;
  return LEAGUE_TO_SPORT_KEY[league.toUpperCase()] ?? null;
}

export function bookmakerKeyForSportsbook(sportsbook: string): string | null {
  return BOOKMAKER_KEY[sportsbook.trim().toLowerCase().replace(/\s+/g, "")] ?? null;
}
