// Best-effort heuristic prefill for instant-capture text. Never required for
// saving — a raw idea with no parseable structure is still a valid save.
// Example input: "Puka 80+ Sunday - like matchup"

export type ParsedIdeaHints = {
  playerName: string | null;
  note: string | null;
};

export function parseRawText(rawText: string): ParsedIdeaHints {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { playerName: null, note: null };
  }

  // Leading run of capitalized word(s) before the first number/punctuation
  // is treated as a likely player/team name mention. Purely a convenience
  // prefill; the user can always overwrite it.
  const nameMatch = trimmed.match(/^([A-Z][a-zA-Z'.]*(?:\s+[A-Z][a-zA-Z'.]*)?)/);
  const playerName = nameMatch ? nameMatch[1] : null;

  const dashNoteMatch = trimmed.match(/[-–—]\s*(.+)$/);
  const note = dashNoteMatch ? dashNoteMatch[1].trim() : null;

  return { playerName, note };
}
