// Static NFL team table (chunk 4b). Maps the forms a team shows up in to one
// team: Sleeper's code (a player's team), The Odds API's full name (a game's
// sides), and what people type (city, nickname, "City Nickname"). NFL only;
// anything the table doesn't know resolves to null, never a guess.

export type NflTeam = {
  /** Sleeper's team code, e.g. "LAR". */
  code: string;
  city: string;
  nickname: string;
  /** The Odds API's name for the team, e.g. "Los Angeles Rams": what Team and Opponent store. */
  name: string;
  /** Common short names, used like the nickname ("Niners", "Bucs"). */
  shortNames: string[];
};

function team(code: string, city: string, nickname: string, ...shortNames: string[]): NflTeam {
  return { code, city, nickname, name: `${city} ${nickname}`, shortNames };
}

export const NFL_TEAMS: NflTeam[] = [
  team("ARI", "Arizona", "Cardinals"),
  team("ATL", "Atlanta", "Falcons"),
  team("BAL", "Baltimore", "Ravens"),
  team("BUF", "Buffalo", "Bills"),
  team("CAR", "Carolina", "Panthers"),
  team("CHI", "Chicago", "Bears"),
  team("CIN", "Cincinnati", "Bengals"),
  team("CLE", "Cleveland", "Browns"),
  team("DAL", "Dallas", "Cowboys"),
  team("DEN", "Denver", "Broncos"),
  team("DET", "Detroit", "Lions"),
  team("GB", "Green Bay", "Packers"),
  team("HOU", "Houston", "Texans"),
  team("IND", "Indianapolis", "Colts"),
  team("JAX", "Jacksonville", "Jaguars", "Jags"),
  team("KC", "Kansas City", "Chiefs"),
  team("LV", "Las Vegas", "Raiders"),
  team("LAC", "Los Angeles", "Chargers"),
  team("LAR", "Los Angeles", "Rams"),
  team("MIA", "Miami", "Dolphins", "Fins", "Phins"),
  team("MIN", "Minnesota", "Vikings"),
  team("NE", "New England", "Patriots", "Pats"),
  team("NO", "New Orleans", "Saints"),
  team("NYG", "New York", "Giants"),
  team("NYJ", "New York", "Jets"),
  team("PHI", "Philadelphia", "Eagles"),
  team("PIT", "Pittsburgh", "Steelers"),
  team("SF", "San Francisco", "49ers", "Niners"),
  team("SEA", "Seattle", "Seahawks"),
  team("TB", "Tampa Bay", "Buccaneers", "Bucs"),
  team("TEN", "Tennessee", "Titans"),
  team("WAS", "Washington", "Commanders"),
];

/** Short city forms people type for the two shared cities. */
const CITY_ALIASES: Record<string, string> = { la: "los angeles", ny: "new york" };

const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const cityOf = (value: string) => CITY_ALIASES[value] ?? value;
const isNickname = (t: NflTeam, word: string) => norm(t.nickname) === word || t.shortNames.some((n) => norm(n) === word);

export function nflTeamByCode(code: string | null | undefined): NflTeam | null {
  if (!code) return null;
  return NFL_TEAMS.find((t) => t.code === code.trim().toUpperCase()) ?? null;
}

/**
 * The team a stored or typed Team value names: a Sleeper code, a full name, a
 * nickname or short name, "City Nickname", or a city only one team has. A
 * shared city ("Los Angeles") or anything else is null.
 */
export function resolveNflTeam(value: string | null | undefined): NflTeam | null {
  if (!value || !value.trim()) return null;
  const byCode = nflTeamByCode(value);
  if (byCode) return byCode;
  const v = norm(value);
  const exact = NFL_TEAMS.find((t) => norm(t.name) === v || isNickname(t, v));
  if (exact) return exact;
  const parts = v.split(" ");
  const nick = parts.pop() as string;
  const withCity = NFL_TEAMS.find((t) => isNickname(t, nick) && norm(t.city) === cityOf(parts.join(" ")));
  if (withCity) return withCity;
  const byCity = NFL_TEAMS.filter((t) => norm(t.city) === cityOf(v));
  return byCity.length === 1 ? byCity[0] : null;
}

/** Words after a city or code that don't make it something other than the team ("Seattle ML", "KC over"). */
const BET_WORDS = new Set(["ml", "moneyline", "spread", "over", "under", "o", "u", "tt"]);

export type TeamAtStart =
  /** The text opens with this team; `length` is how many characters name it. */
  | { team: NflTeam; length: number }
  /** The text opens with a city two teams share and nothing after it picks one. */
  | { team: null; length: number };

/**
 * Whether quick-add text opens with a team (chunk 4b, Trevor 2026-11-02), in
 * this order:
 * - "City Nickname", full or short ("LA Rams", "Tampa Bay Bucs");
 * - Sleeper's code, typed in capitals ("KC -3"; "No" or "kc" is no code);
 * - the nickname or a short name alone ("Rams", "Niners");
 * - a city. A two-word city always means the team; a city two teams share is
 *   decided by the next word, else no team.
 * A one-word city or a code followed by some other word is a player's name
 * ("Dallas Goedert", "KC Concepcion"), not the team. Null when the text
 * doesn't open with a team.
 */
export function teamAtStart(text: string): TeamAtStart | null {
  const words = [...text.matchAll(/[A-Za-z0-9]+/g)].map((m) => ({ raw: m[0], word: m[0].toLowerCase(), end: m.index + m[0].length, start: m.index }));
  if (words.length === 0 || words[0].start !== 0) return null;
  const spaced = (i: number) => /^\s+$/.test(text.slice(words[i - 1].end, words[i].start));
  // Only spaces between the words a team name is made of.
  const joined = (n: number) => (words.length >= n && words.slice(1, n).every((_, i) => spaced(i + 1)) ? words.slice(0, n).map((w) => w.word).join(" ") : null);
  /** Whether the word after the first n is a name ("Goedert"), not a bet word or a number. */
  const nameFollows = (n: number) => words[n] !== undefined && spaced(n) && /^[a-z]/.test(words[n].word) && !BET_WORDS.has(words[n].word);

  for (const n of [3, 2]) {
    const phrase = joined(n);
    if (!phrase) continue;
    const parts = phrase.split(" ");
    const nick = parts.pop() as string;
    const found = NFL_TEAMS.find((t) => isNickname(t, nick) && norm(t.city) === cityOf(parts.join(" ")));
    if (found) return { team: found, length: words[n - 1].end };
  }

  const byCode = /^[A-Z0-9]+$/.test(words[0].raw) ? NFL_TEAMS.find((t) => t.code === words[0].raw) : undefined;
  if (byCode && nameFollows(1) && !isNickname(byCode, words[1].word)) return null;
  if (byCode) return { team: byCode, length: words[nameFollows(1) ? 1 : 0].end };

  const byNickname = NFL_TEAMS.find((t) => isNickname(t, words[0].word));
  if (byNickname) return { team: byNickname, length: words[0].end };

  for (const n of [2, 1]) {
    const phrase = joined(n);
    if (!phrase) continue;
    const teams = NFL_TEAMS.filter((t) => norm(t.city) === cityOf(phrase));
    if (teams.length === 0) continue;
    if (teams.length > 1) return { team: null, length: words[n - 1].end };
    if (n === 1 && nameFollows(1)) return null;
    return { team: teams[0], length: words[n - 1].end };
  }
  return null;
}
