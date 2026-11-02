import type { CaptureProposition, CapturedIdea } from "@/domain/types";

/**
 * WHICH BET A CAPTURE PRICE BELONGS TO (chunk 4a; Trevor/GPT 2026-11-02).
 *
 * The capture odds and book sit on the idea next to its bet fields, and the
 * bet fields can be edited later. A capture price stays stored either way (it
 * is history, never deleted), but it is a price source only for the bet it
 * was entered for. captureProposition records that bet when the price is
 * entered; while the idea's bet still matches it, the price is eligible.
 *
 * - A field that was blank when the price was entered and has since been
 *   filled in (a game picked later, a line added) is completion, not a
 *   different bet.
 * - A field that had a value and now has another, or none, is a different bet.
 * - An idea saved before this field existed has none: its price is taken to
 *   belong to the idea's bet as it stands, until an edit changes that bet, at
 *   which point the bet it belonged to is recorded (stampedCaptureProposition).
 *
 * The fields are the bet-defining part of changesPriceIdentity's list
 * (playerId is left out: re-linking the same player isn't a different bet),
 * compared the same way (player name and selection ignore case and spaces).
 */
const FIELDS = ["league", "eventId", "marketKey", "playerName", "selection", "lineAtCapture"] as const;

type BetFields = Pick<CapturedIdea, (typeof FIELDS)[number]>;

function normalized(field: (typeof FIELDS)[number], value: unknown): unknown {
  if ((field === "playerName" || field === "selection") && typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "string" && value.trim() === "") return null;
  return value ?? null;
}

/** The bet an idea describes, as compared for capture prices. */
export function propositionOf(idea: BetFields): CaptureProposition {
  return {
    league: normalized("league", idea.league) as string | null,
    eventId: normalized("eventId", idea.eventId) as string | null,
    marketKey: normalized("marketKey", idea.marketKey) as string | null,
    playerName: normalized("playerName", idea.playerName) as string | null,
    selection: normalized("selection", idea.selection) as string | null,
    lineAtCapture: normalized("lineAtCapture", idea.lineAtCapture) as number | null,
  };
}

/** Whether `idea` describes a different bet from `stamped`. Filling in a field that was blank isn't. */
function differs(stamped: CaptureProposition, idea: BetFields): boolean {
  const now = propositionOf(idea);
  return FIELDS.some((field) => stamped[field] !== null && stamped[field] !== now[field]);
}

/**
 * Whether the idea's capture price may be used as a price (the estimate's
 * fallback, and what the change radar compares against). False only when the
 * idea has a capture price that was entered for a different bet.
 */
export function captureIsEligible(idea: CapturedIdea): boolean {
  if (idea.oddsAtCaptureAmerican === null) return true;
  if (!idea.captureProposition) return true; // saved before the field existed: the idea's bet as it stands
  return !differs(idea.captureProposition, idea);
}

/** The bet a capture price that isn't eligible was entered for, to say so; null when eligible or absent. */
export function capturedForOtherBet(idea: CapturedIdea): CaptureProposition | null {
  return captureIsEligible(idea) ? null : (idea.captureProposition ?? null);
}

/**
 * What captureProposition to store when `existing` is saved as `merged`:
 * - no capture price any more: none;
 * - the capture price or its book was entered or changed: the bet as now saved;
 * - an idea from before the field, whose bet this edit changes: the bet it had;
 * - otherwise unchanged.
 */
export function stampedCaptureProposition(existing: CapturedIdea | null, merged: CapturedIdea): CaptureProposition | null | undefined {
  if (merged.oddsAtCaptureAmerican === null) return null;
  const captureChanged =
    !existing ||
    existing.oddsAtCaptureAmerican !== merged.oddsAtCaptureAmerican ||
    (existing.sportsbookAtCapture ?? null) !== (merged.sportsbookAtCapture ?? null);
  if (captureChanged) return propositionOf(merged);
  if (existing.captureProposition === undefined) {
    return differs(propositionOf(existing), merged) ? propositionOf(existing) : undefined;
  }
  return existing.captureProposition;
}
