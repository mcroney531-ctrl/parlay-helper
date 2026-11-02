import { teamAtStart } from "@/domain/teams";

// Best-effort heuristic prefill for instant-capture text. Never required for
// saving — a raw idea with no parseable structure is still a valid save.
// Example input: "Puka 80+ Sunday - like matchup"

export type ParsedIdeaHints = {
  playerName: string | null;
  /** The team the text opens with, as stored (the Odds API full name). */
  team: string | null;
  note: string | null;
};

/**
 * Over/Under (and O/U), the Yes/No selections, and bet words ("Cards ML",
 * "Puka ATD") are never a player, or part of one.
 */
const NOT_A_NAME = new Set(["over", "under", "o", "u", "yes", "no", "ml", "pk", "td", "atd", "ftd", "tt", "alt", "sgp"]);

/** A capitalized word; a hyphen inside it ("Amon-Ra", "Smith-Njigba") keeps it one word. */
const NAME_WORD = /^[A-Z][a-zA-Z'.]*(?:-[A-Za-z][a-zA-Z'.]*)*/;

/**
 * Leading run of capitalized word(s) before the first number/punctuation is
 * treated as a likely player name. Two words, plus a third after a
 * "St."-style abbreviation ("Amon-Ra St. Brown"). Purely a convenience
 * prefill; the user can always overwrite it.
 */
function leadingName(text: string): string | null {
  const words: string[] = [];
  let rest = text;
  while (true) {
    const match = rest.match(NAME_WORD);
    if (!match || NOT_A_NAME.has(match[0].toLowerCase())) break;
    words.push(match[0]);
    const maxWords = words.length >= 2 && /^[A-Z][a-z]*\.$/.test(words[1]) ? 3 : 2;
    rest = rest.slice(match[0].length);
    const gap = rest.match(/^\s+/);
    if (words.length >= maxWords || !gap) break;
    rest = rest.slice(gap[0].length);
  }
  return words.length > 0 ? words.join(" ") : null;
}

export function parseRawText(rawText: string): ParsedIdeaHints {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { playerName: null, team: null, note: null };
  }

  // A note starts at a hyphen with spaces around it ("Puka - lean over"), or at
  // an en or em dash with or without them. "Rams -3" and "Amon-Ra" have none.
  const dashNoteMatch = trimmed.match(/(?:\s-\s|[–—])\s*(.+)$/);
  const note = dashNoteMatch ? dashNoteMatch[1].trim() : null;

  // Text that opens with a team is a team bet: Team, never Player (chunk 4b).
  // A shared city nothing picks out ("Los Angeles ML") and a matchup
  // ("Seahawks/Rams", "Rams @ Seahawks") name no one team, so both stay empty.
  const atStart = teamAtStart(trimmed);
  if (atStart) {
    const matchup = /^\s*(?:[/@&]|vs\.?\s|v\.?\s|at\s)/i.test(trimmed.slice(atStart.length));
    return { playerName: null, team: matchup ? null : (atStart.team?.name ?? null), note };
  }

  return { playerName: leadingName(trimmed), team: null, note };
}
