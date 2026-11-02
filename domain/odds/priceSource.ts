import type { ResolvedLegPrice } from "./estimate";

export type LegPriceTone = "neutral" | "caution" | "missing";

function formatAmerican(value: number): string {
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

/**
 * One line for a leg card saying which price the slip's estimate uses for
 * it, from the same resolution (INV-12). A live price can disappear and the
 * leg then falls back to its capture price, possibly from another book,
 * without any new warning; this line is where the user sees that happened.
 * A capture price from a book that isn't confirmed to be the slip's is
 * flagged, never shown as the slip book's price.
 */
export function describeLegPrice(resolved: ResolvedLegPrice, slipSportsbook: string): { text: string; tone: LegPriceTone } {
  const slipBook = slipSportsbook.trim() || "this slip's book";
  switch (resolved.source) {
    case "current":
      return { text: `Price ${formatAmerican(resolved.oddsAmerican as number)} · live at ${slipBook}`, tone: "neutral" };
    case "capture": {
      const odds = formatAmerican(resolved.oddsAmerican as number);
      const book = resolved.captureBook?.label ?? null;
      const match = resolved.captureBook?.match ?? "unknown";
      if (match === "same") {
        return { text: `Price ${odds} · captured at ${book ?? slipBook} (no live price)`, tone: "neutral" };
      }
      if (match === "different") {
        return { text: `Price ${odds} · captured at ${book}, a different book from ${slipBook} (no live price)`, tone: "caution" };
      }
      if (match === "unverified") {
        return { text: `Price ${odds} · captured at ${book}, not confirmed to be ${slipBook} (no live price)`, tone: "caution" };
      }
      return { text: `Price ${odds} · captured, book not recorded (no live price)`, tone: "caution" };
    }
    case "unavailable":
      return resolved.unavailableReason === "market_not_offered"
        ? { text: `No price · ${slipBook} isn't offering this market`, tone: "missing" }
        : { text: "No price · no live or capture price", tone: "missing" };
  }
}
