import { americanToDecimal, decimalToAmerican, roundAmerican } from "./conversion";
import { compareSportsbooks, type SportsbookMatch } from "@/domain/sportsbook";
import type { CapturedIdea, LiveContext, SnapshotLegPrice } from "@/domain/types";
import { captureIsEligible } from "@/domain/ideas/captureProposition";
import { missingLegIds, presentIdeas, type SlipLeg } from "@/domain/candidates/slipLegs";

// The canonical resolver (INV-12): every place that needs "the price of this
// leg" (the builder's estimate, finalize's saved estimate and each saved leg's
// snapshot) builds its input with legPriceInputs and resolves it with
// resolveLegPrice. Nothing else picks between a live price and a capture price.

export type LegPriceSource = "current" | "capture" | "unavailable";

export type LegPriceInput = {
  ideaId: string;
  eventId: string | null;
  currentOddsAmerican: number | null;
  /** The line the live price is for (live context's currentLine). Missing means none. */
  currentLine?: number | null;
  /** When the live price was fetched (live context's oddsFetchedAt). Missing means unknown. */
  currentOddsFetchedAt?: string | null;
  /** The capture price, or null when there is none or it was entered for a different bet (captureForOtherBet). */
  captureOddsAmerican: number | null;
  /**
   * The leg's own line (the idea's lineAtCapture): the line it was captured at
   * and the only line it is ever priced at (exact-line rule, chunk 4a).
   * Missing means none.
   */
  captureLine?: number | null;
  /** The idea has a capture price, but it was entered for a different bet, so it isn't one (chunk 4a). */
  captureForOtherBet?: boolean;
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
  /** The line oddsAmerican is for: the live line for "current", the capture line for "capture", null for "unavailable". */
  line: number | null;
  /** Only when source is "current": when that live price was fetched (null if unknown). */
  oddsFetchedAt?: string | null;
  /**
   * Only when source is "unavailable": the slip's book isn't offering this bet
   * (its market, or this leg's line in it), or the only price is a capture
   * price entered for a different bet.
   */
  unavailableReason?: "market_not_offered" | "capture_for_other_bet";
  /** With market_not_offered: the leg's line, to say which line isn't offered (null for a market with no line). */
  notOfferedLine?: number | null;
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
 * whether that is the slip's book. Policy (Trevor/GPT 2026-11-02): a capture
 * price from another or unknown book is KEPT and LABELLED, a fallback the
 * slip book's live price always outranks, and never presented as the slip
 * book's price.
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
      line: null,
      unavailableReason: "market_not_offered",
      notOfferedLine: leg.captureLine ?? null,
      lastKnownOddsAmerican: leg.currentOddsAmerican,
    };
  }
  // EXACT LINE (Trevor/GPT 2026-11-02): the line is part of the bet. A live
  // price stored for another line (written before the matcher required the
  // leg's own line, or for a leg with no line in a line market) is not this
  // leg's price, and the main line is never substituted.
  const liveIsThisLine = leg.currentLine == null || leg.currentLine === (leg.captureLine ?? null);
  if (leg.currentOddsAmerican !== null && liveIsThisLine) {
    return {
      ideaId: leg.ideaId,
      eventId: leg.eventId,
      oddsAmerican: leg.currentOddsAmerican,
      source: "current",
      line: leg.currentLine ?? null,
      oddsFetchedAt: leg.currentOddsFetchedAt ?? null,
    };
  }
  if (leg.captureOddsAmerican !== null) {
    return {
      ideaId: leg.ideaId,
      eventId: leg.eventId,
      oddsAmerican: leg.captureOddsAmerican,
      source: "capture",
      line: leg.captureLine ?? null,
      captureBook: {
        label: leg.captureSportsbook?.trim() || null,
        match: compareSportsbooks(leg.captureSportsbook, leg.slipSportsbook),
      },
    };
  }
  if (leg.captureForOtherBet) {
    return { ideaId: leg.ideaId, eventId: leg.eventId, oddsAmerican: null, source: "unavailable", line: null, unavailableReason: "capture_for_other_bet" };
  }
  return { ideaId: leg.ideaId, eventId: leg.eventId, oddsAmerican: null, source: "unavailable", line: null };
}

/**
 * What a saved leg records about its price: exactly one resolution from
 * resolveLegPrice, so the saved leg and the saved estimate (built from the same
 * resolutions) can't disagree about it. The book is named for every priced
 * leg: the slip's book for a live price (live context is kept per book), the
 * capture book, as typed, for a capture price.
 */
export function snapshotLegPrice(resolved: ResolvedLegPrice, slipSportsbook: string): SnapshotLegPrice {
  // resolveLegPrice only returns "current" or "capture" with a price.
  const oddsAmerican = resolved.oddsAmerican as number;
  switch (resolved.source) {
    case "current":
      return {
        source: "current",
        oddsAmerican,
        line: resolved.line,
        book: slipSportsbook.trim() || null,
        oddsFetchedAt: resolved.oddsFetchedAt ?? null,
      };
    case "capture":
      return {
        source: "capture",
        oddsAmerican,
        line: resolved.line,
        book: resolved.captureBook?.label ?? null,
        bookMatch: resolved.captureBook?.match ?? "unknown",
      };
    case "unavailable":
      return {
        source: "unavailable",
        oddsAmerican: null,
        line: null,
        book: null,
        ...(resolved.unavailableReason ? { unavailableReason: resolved.unavailableReason } : {}),
      };
  }
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
      currentLine: live?.currentLine ?? null,
      currentOddsFetchedAt: live?.oddsFetchedAt ?? null,
      captureOddsAmerican: captureIsEligible(leg) ? leg.oddsAtCaptureAmerican : null,
      captureLine: leg.lineAtCapture,
      captureForOtherBet: !captureIsEligible(leg),
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

export type SlipEstimate =
  | (Extract<CombinedEstimate, { ok: true }> & { missingLegIds: [] })
  | {
      ok: false;
      /** deleted_legs: at least one leg's idea no longer exists, so the slip as stored can't be priced. */
      reason: "no_legs" | "missing_price" | "deleted_legs";
      /** Present legs with no price. Never includes a deleted leg. */
      unavailableLegIds: string[];
      /** Legs whose idea no longer exists, in slip order. */
      missingLegIds: string[];
      legSources: ResolvedLegPrice[];
    };

/**
 * The estimate for a slip's legs as stored, the one used by the Slip screen
 * and by placement (INV-12). A leg whose idea was deleted has no price of any
 * kind, even if a cached live price for it remains, so while one is there the
 * estimate fails for the whole slip rather than pricing the survivors as if
 * they were the slip. legSources resolves the present legs only, in slip
 * order, and deleted legs are counted apart from present legs with no price.
 */
export function calculateSlipEstimate(
  legs: readonly SlipLeg[],
  slipSportsbook: string,
  liveContextFor: (ideaId: string) => LiveContext | undefined,
): SlipEstimate {
  const estimate = calculateCombinedEstimate(legPriceInputs(presentIdeas(legs), slipSportsbook, liveContextFor));
  const missing = missingLegIds(legs);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "deleted_legs",
      unavailableLegIds: estimate.ok ? [] : estimate.unavailableLegIds,
      missingLegIds: missing,
      legSources: estimate.legSources,
    };
  }
  return { ...estimate, missingLegIds: [] };
}

/**
 * The present legs the resolver found no price for, in slip order: what the
 * Mark Placed confirm warns about and what placement checks the user's
 * consent against (INV-17). A leg priced from its capture price is priced;
 * only a resolution of "unavailable" counts.
 */
export function unpricedLegIds(estimate: { legSources: readonly ResolvedLegPrice[] }): string[] {
  return estimate.legSources.filter((leg) => leg.source === "unavailable").map((leg) => leg.ideaId);
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
