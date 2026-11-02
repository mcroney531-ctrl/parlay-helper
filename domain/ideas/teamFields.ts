import { nflTeamByCode, resolveNflTeam } from "@/domain/teams";

// Team and Opponent in the details sheet (chunk 4b, Trevor/GPT 2026-11-02):
// - A player change RECOMPUTES Team from the player's team (Sleeper code ->
//   full name) and Opponent from the selected game: the side that isn't Team.
// - A game change RECOMPUTES Opponent. The game alone never says which side
//   the player is on, so it never sets Team.
// - A typed value sticks only until the next player or game change: market,
//   line and other edits, and saving, never recompute.
// - A team the table doesn't know gives a blank, never a guess (and never the
//   previous player's team).

export type GameTeams = { homeTeam: string; awayTeam: string };
export type TeamFieldValues = { team: string; opponent: string };

/** The side of the game that isn't `team`, or null when Team doesn't name a side. */
export function opponentFor(team: string, game: GameTeams | null): string | null {
  if (!game || !team.trim()) return null;
  const same = (side: string) => {
    if (side === team.trim()) return true;
    const resolved = resolveNflTeam(team);
    return resolved !== null && resolved === resolveNflTeam(side);
  };
  if (same(game.homeTeam)) return game.awayTeam;
  if (same(game.awayTeam)) return game.homeTeam;
  return null;
}

/** Team for a picked player's Sleeper team code; blank for a cleared player or a code the table doesn't know. */
export function teamForPlayer(playerTeamCode: string | null | undefined): string {
  return nflTeamByCode(playerTeamCode)?.name ?? "";
}

/**
 * After the player changes: picked from the list, or cleared (Trevor's review
 * of 1c3c2e0). Editing the text of a player's name (fixing a typo) isn't a
 * player change and recomputes nothing. `playerTeamCode` is the picked
 * Sleeper player's team; a cleared player has none, so Team is blank.
 */
export function teamFieldsAfterPlayerChange(playerTeamCode: string | null | undefined, game: GameTeams | null): TeamFieldValues {
  const team = teamForPlayer(playerTeamCode);
  return { team, opponent: opponentFor(team, game) ?? "" };
}

/** After the game changes (picked, cleared, or an event id typed in, which has no teams). Team is kept. */
export function teamFieldsAfterGameChange(values: TeamFieldValues, game: GameTeams | null): TeamFieldValues {
  return { team: values.team, opponent: opponentFor(values.team, game) ?? "" };
}
