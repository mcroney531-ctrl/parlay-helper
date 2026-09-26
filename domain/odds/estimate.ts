import { americanToDecimal, decimalToAmerican, roundAmerican } from "./conversion";
import { compareSportsbooks, type SportsbookMatch } from "@/domain/sportsbook";
import type { CapturedIdea, LiveContext } from "@/domain/types";

export type LegPriceSource = "current" | "capture" | "unavailable";

export type LegPriceInput = {
  ideaId: string;
  eventId: string | null;
  currentOddsAmerican: number | null;
  captureOddsAmerican: number | null;
  /** Where captureOddsAmerican was observed (the idea's sportsbookAtCapture). Missing or blank means unknown. */
  captureSportsbook?: string | null;
  /** The sportsbook of the slip this estimate is for. Missing or blank means unknown. */
  slipSportsbook?: string | null;
  /**
   * The live context's marketAvailable. false means this slip's book no longer
   * offers the market (or the leg couldn't be found in its response), so
   * whatever currentOddsAmerican is still stored is a last-known value, not a
   * price that can be bet. null / undefined mean unknown and change nothing.
   */
  marketAvailable?: boolean | null;
};

export type ResolvedLegPrice = {
  ideaId: string;
  eventId: string | null;
  oddsAmerican: number | null;
  source: LegPriceSource;
  /** Only when source is "unavailable" because the slip's book no longer offers the market. */
  unavailableReason?: "market_not_offered";
  /** With unavailableReason: the last stored live price, for display only. Never used in an estimate or a snapshot. */
  lastKnownOddsAmerican?: number | null;
  /**
   * Only when source is "capture": the book the price was observed at and
   * whether it is the slip's book. A "current" price is always the slip's
   * book (live context is keyed per book), so it carries no capture book.
   */
  captureBook?: { label: string | null; match: SportsbookMatch };
};

/**
 * Resolves which price a leg's estimate should use. Never silently
 * substitutes: the result always names its source so the UI can say
 * "using capture price" or "cannot be calculated" instead of quietly
 * blending values. A capture price also names the book it came from and
 * whether that is the slip's book; it is still used either way (whether
 * other-book capture prices should count toward the estimate is an open
 * product question), but it is never presented as the slip book's price.
 */
export function resolveLegPrice(leg: LegPriceInput): ResolvedLegPrice {
  // A market the slip's book no longer offers has no price to bet at that book.
  // Neither the retained live price nor the capture price (possibly from another
  // book) stands in for it; the last-known live price is kept for display only.
  if (leg.marketAvailable === false) {
    return {
      ideaId: leg.ideaId,
      eventId: leg.eventId,
      oddsAmerican: null,
      source: "unavailable",
      unavailableReason: "market_not_offered",
      lastKnownOddsAmerican: leg.currentOddsAmerican,
    };
  }
  if (leg.currentOddsAmerican !== null) {
    return { ideaId: leg.ideaId, eventId: leg.eventId, oddsAmerican: leg.currentOddsAmerican, source: "current" };
  }
  if (leg.captureOddsAmerican !== null) {
    return {
      ideaId: leg.ideaId,
      eventId: leg.eventId,
      oddsAmerican: leg.captureOddsAmerican,
      source: "capture",
      captureBook: {
        label: leg.captureSportsbook?.trim() || null,
        match: compareSportsbooks(leg.captureSportsbook, leg.slipSportsbook),
      },
    };
  }
  return { ideaId: leg.ideaId, eventId: leg.eventId, oddsAmerican: null, source: "unavailable" };
}

/** The resolver input for each leg of a slip, so every screen that counts prices resolves them the same way. */
export function legPriceInputs(
  legs: CapturedIdea[],
  slipSportsbook: string,
  liveContextFor: (ideaId: string) => LiveContext | undefined,
): LegPriceInput[] {
  return legs.map((leg) => {
    const live = liveContextFor(leg.id);
    return {
      ideaId: leg.id,
      eventId: leg.eventId,
      currentOddsAmerican: live?.currentOddsAmerican ?? null,
      captureOddsAmerican: leg.oddsAtCaptureAmerican,
      captureSportsbook: leg.sportsbookAtCapture,
      slipSportsbook,
      marketAvailable: live?.marketAvailable ?? null,
    };
  });
}

export type CombinedEstimate =
  | {
      ok: true;
      decimalOdds: number;
      americanOdds: number;
      legSources: ResolvedLegPrice[];
    }
  | {
      ok: false;
      reason: "no_legs" | "missing_price";
      unavailableLegIds: string[];
      legSources: ResolvedLegPrice[];
    };

export function calculateCombinedEstimate(legs: LegPriceInput[]): CombinedEstimate {
  const resolved = legs.map(resolveLegPrice);
  if (resolved.length === 0) {
    return { ok: false, reason: "no_legs", unavailableLegIds: [], legSources: resolved };
  }
  const unavailable = resolved.filter((leg) => leg.source === "unavailable");
  if (unavailable.length > 0) {
    return {
      ok: false,
      reason: "missing_price",
      unavailableLegIds: unavailable.map((leg) => leg.ideaId),
      legSources: resolved,
    };
  }
  const decimalOdds = resolved.reduce(
    (product, leg) => product * americanToDecimal(leg.oddsAmerican as number),
    1,
  );
  return {
    ok: true,
    decimalOdds,
    americanOdds: roundAmerican(decimalToAmerican(decimalOdds)),
    legSources: resolved,
  };
}

export function calculatePayoutCents(stakeCents: number, decimalOdds: number): number {
  return Math.round(stakeCents * decimalOdds);
}

/** Legs sharing an event ID trigger the SGP repricing caveat and the correlation indicator. */
export function groupLegsByEvent(
  legs: { ideaId: string; eventId: string | null }[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const leg of legs) {
    if (!leg.eventId) continue;
    const group = groups.get(leg.eventId) ?? [];
    group.push(leg.ideaId);
    groups.set(leg.eventId, group);
  }
  for (const [eventId, ideaIds] of groups) {
    if (ideaIds.length < 2) groups.delete(eventId);
  }
  return groups;
}

export function hasSameGameCombination(legs: { eventId: string | null }[]): boolean {
  return groupLegsByEvent(legs.map((leg, i) => ({ ideaId: String(i), eventId: leg.eventId }))).size > 0;
}
