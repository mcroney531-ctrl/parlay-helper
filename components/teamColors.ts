// Visual-only team identity pairs for the Builder's prop-card rail/avatar
// ring. Never used to imply a recommendation — purely brand color.
export type TeamColorPair = {
  primary: `#${string}`;
  accent: `#${string}`;
};

export const nflTeamColors: Record<string, TeamColorPair> = {
  LAR: { primary: "#003594", accent: "#FFA300" },
  CIN: { primary: "#FB4F14", accent: "#000000" },
  BAL: { primary: "#241773", accent: "#9E7C0C" },
  KC: { primary: "#E31837", accent: "#FFB81C" },
  BUF: { primary: "#00338D", accent: "#C60C30" },
};

export const defaultTeamColors: TeamColorPair = {
  primary: "#26453B",
  accent: "#078D74",
};

// Expand this map only from a reviewed team-color source. Keep the fallback so
// unknown, missing, or non-NFL team codes never break card rendering.
export function teamColorsFor(team: string | null): TeamColorPair {
  if (!team) return defaultTeamColors;
  return nflTeamColors[team.toUpperCase()] ?? defaultTeamColors;
}
