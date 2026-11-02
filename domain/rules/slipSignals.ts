import type { SlipLeg } from "@/domain/candidates/slipLegs";
import { presentIdeas } from "@/domain/candidates/slipLegs";
import { hasSameGameCombination } from "@/domain/odds/estimate";
import { detectCorrelationSignals, type CorrelationSignal } from "./correlation";
import { detectConcentrationSignals, type ConcentrationSignal } from "./concentration";

export type SlipSignals = {
  sameGame: boolean;
  correlation: CorrelationSignal[];
  concentration: ConcentrationSignal[];
  /**
   * Legs whose idea was deleted. Nothing is known about them (no event, team
   * or kickoff), so every signal above is computed from the present legs only
   * and describes an incomplete slip whenever this is above zero. The Slip
   * screen says so even when there is no signal to show.
   */
  deletedLegCount: number;
};

/** Hour-granularity kickoff bucket for the concentration check, or null when the start time is unknown. */
export function kickoffWindowFor(scheduledStart: string | null): string | null {
  if (!scheduledStart) return null;
  const date = new Date(scheduledStart);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 13);
}

/**
 * The context signals for a slip's legs as stored. Deleted legs are left out
 * rather than filled in, and the concentration check counts present legs
 * only: both its 4-leg minimum and the share denominator. A deleted leg
 * can't be shown to share a game or team with anything, so counting it
 * would only dilute a real concentration among the legs that are known.
 */
export function detectSlipSignals(
  legs: readonly SlipLeg[],
  scheduledStartFor: (ideaId: string) => string | null,
): SlipSignals {
  const present = presentIdeas(legs);
  return {
    sameGame: hasSameGameCombination(present.map((idea) => ({ eventId: idea.eventId }))),
    correlation: detectCorrelationSignals(present.map((idea) => ({ ideaId: idea.id, eventId: idea.eventId }))),
    concentration: detectConcentrationSignals(
      present.map((idea) => ({
        ideaId: idea.id,
        eventId: idea.eventId,
        team: idea.team,
        kickoffWindow: kickoffWindowFor(scheduledStartFor(idea.id)),
      })),
    ),
    deletedLegCount: legs.length - present.length,
  };
}
