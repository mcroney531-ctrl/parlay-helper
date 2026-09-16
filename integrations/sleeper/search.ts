import type { SleeperPlayer } from "./types";

const MAX_RESULTS = 8;

/**
 * Name search over the cached snapshot so a player can be found and
 * resolved to a real Sleeper player id without the user ever typing one.
 * Prefix matches rank above plain substring matches.
 */
export function searchPlayersByName(
  players: Record<string, SleeperPlayer>,
  query: string,
): SleeperPlayer[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];

  const matches: SleeperPlayer[] = [];
  for (const player of Object.values(players)) {
    if (!player.fullName) continue;
    if (player.fullName.toLowerCase().includes(normalizedQuery)) matches.push(player);
  }

  matches.sort((a, b) => {
    const aPrefix = a.fullName.toLowerCase().startsWith(normalizedQuery);
    const bPrefix = b.fullName.toLowerCase().startsWith(normalizedQuery);
    if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
    return a.fullName.length - b.fullName.length;
  });

  return matches.slice(0, MAX_RESULTS);
}
