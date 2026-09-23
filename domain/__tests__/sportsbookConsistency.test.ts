import { describe, expect, it } from "vitest";
import { SUPPORTED_BOOK_NAMES, canonicalSportsbookId, compareSportsbooks, isRecognizedSportsbook } from "../sportsbook";
import { bookmakerKeyForSportsbook } from "@/integrations/odds-api/sportKeys";

/**
 * domain/sportsbook.ts keeps its own list of supported books (for the UI and
 * provenance) that must stay in step with BOOKMAKER_KEY in sportKeys.ts (what
 * the odds route actually prices). These tests fail if the two drift.
 */

const SPELLINGS = [
  ...SUPPORTED_BOOK_NAMES,
  "fanduel",
  "Fan Duel",
  "FD",
  "FanDuel Sportsbook",
  "DK",
  "draftkings sportsbook",
  "MGM",
  "Bet MGM",
  "CZR",
  "William Hill",
  "Caesars Sportsbook",
  "ESPN",
  "espnbet",
  "Bet365",
  "BetRivers",
  "Fanatics",
  "Hard Rock Bet",
  "",
  "???",
];

describe("supported-book list vs the odds provider's bookmaker map", () => {
  it.each(SPELLINGS)("%j is recognized exactly when the odds route can price it", (book) => {
    expect(isRecognizedSportsbook(book)).toBe(bookmakerKeyForSportsbook(book) !== null);
  });

  it("every displayed supported name resolves to its own bookmaker key", () => {
    const keys = SUPPORTED_BOOK_NAMES.map((name) => bookmakerKeyForSportsbook(name));
    expect(keys).not.toContain(null);
    expect(new Set(keys).size).toBe(SUPPORTED_BOOK_NAMES.length);
  });

  it("aliases fold onto the same book as the full name", () => {
    const pairs: [string, string][] = [
      ["FD", "FanDuel"],
      ["DK", "DraftKings"],
      ["MGM", "BetMGM"],
      ["CZR", "Caesars"],
      ["William Hill", "Caesars"],
      ["ESPN", "ESPN BET"],
      ["DraftKings Sportsbook", "DraftKings"],
    ];
    for (const [alias, name] of pairs) {
      expect(canonicalSportsbookId(alias)).toBe(canonicalSportsbookId(name));
      expect(bookmakerKeyForSportsbook(alias)).toBe(bookmakerKeyForSportsbook(name));
      expect(compareSportsbooks(alias, name)).toBe("same");
    }
  });

  it("unsupported books stay distinct and are never called 'different' with certainty", () => {
    expect(canonicalSportsbookId("Bet365")).not.toBe(canonicalSportsbookId("BetRivers"));
    expect(compareSportsbooks("Bet365", "FanDuel")).toBe("unverified");
    expect(compareSportsbooks("DraftKings", "FanDuel")).toBe("different");
  });
});
