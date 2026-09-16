import { groupLegsByEvent } from "@/domain/odds/estimate";
import { CORRELATION_MIN_SHARED_LEGS } from "./config";

export type CorrelationLeg = { ideaId: string; eventId: string | null };

export type CorrelationSignal = {
  eventId: string;
  ideaIds: string[];
  explanation: string;
};

/**
 * Surfaces context only — never blocks selection and never claims the
 * correlation is positive or negative for the bettor.
 */
export function detectCorrelationSignals(legs: CorrelationLeg[]): CorrelationSignal[] {
  const groups = groupLegsByEvent(legs);
  const signals: CorrelationSignal[] = [];
  for (const [eventId, ideaIds] of groups) {
    if (ideaIds.length >= CORRELATION_MIN_SHARED_LEGS) {
      signals.push({
        eventId,
        ideaIds,
        explanation: `${ideaIds.length} legs share event ${eventId}.`,
      });
    }
  }
  return signals;
}
