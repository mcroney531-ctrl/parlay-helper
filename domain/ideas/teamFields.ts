import { nflTeamByCode, resolveNflTeam } from "@/domain/teams";

// Team and Opponent in the details sheet (chunk 4b, Trevor/GPT 2026-11-02):
// - Team comes from the picked player's team (Sleeper code -> full name);
//   Opponent comes from the picked game: the side that isn't Team.
// - They're recomputed only when the player or the game changes. A market or
//   line change never touches them.
// - A value the user typed sticks: it's never recomputed over.
// - A team the table doesn't know gives a blank, never a guess. The game alone
//   never says which side the player is on, so it never sets Team.

export type GameTeams = { homeTeam: string; awayTeam: string };
export type TeamFieldValues = { team: string; opponent: string };
/** Which of Team / Opponent the user typed (and so are never recomputed). */
export type TeamFieldManual = { team: boolean; opponent: boolean };

/**
 * Whether a stored value counts as typed when the sheet opens. A team the
 * table knows (a code or a name) is what the sheet or quick-add would have
 * filled in, so it's recomputed on a player or game change; anything else
 * someone typed, so it sticks. Blank isn't typed.
 */
export function isTypedTeamValue(value: string): boolean {
  return value.trim() !== "" && resolveNflTeam(value) === null;
}

export function manualFromValues(values: TeamFieldValues): TeamFieldManual {
  return { team: isTypedTeamValue(values.team), opponent: isTypedTeamValue(values.opponent) };
}

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

/**
 * After the player changes. `playerTeamCode` is the picked Sleeper player's
 * team; a player typed in (not picked) has none, so a filled-in Team from the
 * previous player is cleared rather than kept as a wrong guess.
 */
export function teamFieldsAfterPlayerChange(
  values: TeamFieldValues,
  manual: TeamFieldManual,
  playerTeamCode: string | null | undefined,
  game: GameTeams | null,
): TeamFieldValues {
  const team = manual.team ? values.team : (nflTeamByCode(playerTeamCode)?.name ?? "");
  const opponent = manual.opponent ? values.opponent : (opponentFor(team, game) ?? "");
  return { team, opponent };
}

/** After the game changes (picked, cleared, or an event id typed in, which has no teams). */
export function teamFieldsAfterGameChange(values: TeamFieldValues, manual: TeamFieldManual, game: GameTeams | null): TeamFieldValues {
  return { team: values.team, opponent: manual.opponent ? values.opponent : (opponentFor(values.team, game) ?? "") };
}
