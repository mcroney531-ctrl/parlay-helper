import type { CapturedIdea } from "@/domain/types";
import { SUPPORTED_BOOK_NAMES, isRecognizedSportsbook } from "@/domain/sportsbook";

/**
 * Why a leg can't get a live price. The first three are details the idea is
 * missing, so refreshOddsForCandidate never sends it; unsupported_book means
 * the leg is sent but the provider has no prices for the slip's book. League
 * isn't checked for support because it is only ever picked from the supported
 * list. Nothing here blocks adding a leg to a slip: it only explains a price
 * that can't come.
 */
export type PriceBlocker = "no_league" | "no_game" | "no_market" | "unsupported_book";

/** The fields the odds request needs. The one definition shared by the refresh and the UI. */
export function missingOddsRequestFields(idea: CapturedIdea): PriceBlocker[] {
  const missing: PriceBlocker[] = [];
  if (!idea.eventId) missing.push("no_game");
  if (!idea.marketKey) missing.push("no_market");
  if (!idea.league) missing.push("no_league");
  return missing;
}

export function priceBlockers(idea: CapturedIdea, slipSportsbook: string): PriceBlocker[] {
  const blockers = missingOddsRequestFields(idea);
  if (!isRecognizedSportsbook(slipSportsbook)) blockers.push("unsupported_book");
  return blockers;
}

const MISSING_TEXT: Record<Exclude<PriceBlocker, "unsupported_book">, string> = {
  no_game: "a game",
  no_market: "a market",
  no_league: "a league",
};

/** One sentence for a leg card, or null when nothing blocks a live price. */
export function describePriceBlockers(blockers: PriceBlocker[], slipSportsbook: string): string | null {
  const parts: string[] = [];
  const missing = blockers.filter((b): b is Exclude<PriceBlocker, "unsupported_book"> => b !== "unsupported_book");
  if (missing.length > 0) {
    parts.push(`No live price until this idea has ${joinWords(missing.map((b) => MISSING_TEXT[b]))} set in its details.`);
  }
  if (blockers.includes("unsupported_book")) parts.push(unsupportedBookText(slipSportsbook));
  return parts.length > 0 ? parts.join(" ") : null;
}

export function unsupportedBookText(sportsbook: string): string {
  return `Live odds aren't available for "${sportsbook.trim()}" (supported: ${SUPPORTED_BOOK_NAMES.join(", ")}).`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
