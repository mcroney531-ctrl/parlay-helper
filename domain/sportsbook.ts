/**
 * Canonical sportsbook identity. A sportsbook is entered as free text
 * ("FanDuel", "Fan Duel", "fanduel."), so every comparison, cache key and
 * provider lookup goes through this one function instead of the raw string.
 *
 * The id is the lowercased letters and digits of the text. That folds the
 * spelling variants of a supported book together, and it gives every
 * unsupported or custom book its own id ("Bet365" and "BetRivers" stay
 * distinct); nothing is ever pooled under a shared "other". Display text is
 * kept separately and is never used as an identity.
 */
export function canonicalSportsbookId(book: string | null | undefined): string | null {
  if (!book) return null;
  const id = book.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return id === "" ? null : id;
}

export type SportsbookMatch = "same" | "different" | "unknown";

/** "unknown" whenever either side is missing or blank: a missing book is never treated as a match. */
export function compareSportsbooks(a: string | null | undefined, b: string | null | undefined): SportsbookMatch {
  const left = canonicalSportsbookId(a);
  const right = canonicalSportsbookId(b);
  if (left === null || right === null) return "unknown";
  return left === right ? "same" : "different";
}
