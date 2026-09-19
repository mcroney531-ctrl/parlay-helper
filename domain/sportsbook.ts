/**
 * Canonical sportsbook identity. A sportsbook is entered as free text
 * ("FanDuel", "Fan Duel", "fanduel.", "FD"), so every comparison, cache key
 * and provider lookup goes through this one function instead of the raw string.
 *
 * The id is the lowercased letters and digits of the text (NFKC-normalized, so
 * a precomposed and a decomposed accent are the same). That folds the spelling
 * variants of a book together, and it gives every unsupported or custom book
 * its own id ("Bet365" and "BetRivers" stay distinct); nothing is ever pooled
 * under a shared "other". A trailing "sportsbook" word is dropped
 * ("DraftKings Sportsbook"), and the closed set of supported books also folds
 * its common abbreviations ("DK", "FD", "MGM", "CZR"). Display text is kept
 * separately and is never used as an identity.
 */

/**
 * The supported books' canonical ids. These must stay in step with the keys of
 * BOOKMAKER_KEY in integrations/odds-api/sportKeys.ts.
 */
const SUPPORTED_BOOK_IDS = ["fanduel", "draftkings", "betmgm", "caesars", "espnbet"] as const;

const SUPPORTED_BOOK_ALIASES: Record<string, (typeof SUPPORTED_BOOK_IDS)[number]> = {
  fd: "fanduel",
  dk: "draftkings",
  mgm: "betmgm",
  czr: "caesars",
  williamhill: "caesars", // the Odds API's williamhill_us is Caesars
  espn: "espnbet",
};

const SPORTSBOOK_WORD = "sportsbook";

export function canonicalSportsbookId(book: string | null | undefined): string | null {
  if (typeof book !== "string" || !book) return null;
  let id = book.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (id.length > SPORTSBOOK_WORD.length && id.endsWith(SPORTSBOOK_WORD)) {
    id = id.slice(0, -SPORTSBOOK_WORD.length);
  }
  if (id === "") return null;
  return SUPPORTED_BOOK_ALIASES[id] ?? id;
}

/** True when the text resolves to one of the supported books (the only books we can positively tell apart). */
export function isRecognizedSportsbook(book: string | null | undefined): boolean {
  const id = canonicalSportsbookId(book);
  return id !== null && (SUPPORTED_BOOK_IDS as readonly string[]).includes(id);
}

/**
 * same: identical canonical book.
 * different: both sides are recognized supported books and they are not the same, so this is certain.
 * unverified: both sides are present and differ, but at least one is free text we can't place ("Bet365",
 *   a typo, a nickname), so it may still be the same book. Never assert "different" for this.
 * unknown: either side is missing or blank. A missing book is never treated as a match.
 */
export type SportsbookMatch = "same" | "different" | "unverified" | "unknown";

export function compareSportsbooks(a: string | null | undefined, b: string | null | undefined): SportsbookMatch {
  const left = canonicalSportsbookId(a);
  const right = canonicalSportsbookId(b);
  if (left === null || right === null) return "unknown";
  if (left === right) return "same";
  return isRecognizedSportsbook(left) && isRecognizedSportsbook(right) ? "different" : "unverified";
}
