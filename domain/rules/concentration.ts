import { CONCENTRATION_MIN_LEGS, CONCENTRATION_SHARE_THRESHOLD } from "./config";

export type ConcentrationLeg = {
  ideaId: string;
  eventId: string | null;
  team: string | null;
  kickoffWindow: string | null;
};

export type ConcentrationDimension = "event" | "team" | "kickoff_window";

export type ConcentrationSignal = {
  dimension: ConcentrationDimension;
  value: string;
  ideaIds: string[];
  shareRatio: number;
  explanation: string;
};

function largestGroupsByKey(
  legs: ConcentrationLeg[],
  keyOf: (leg: ConcentrationLeg) => string | null,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const leg of legs) {
    const key = keyOf(leg);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(leg.ideaId);
    groups.set(key, group);
  }
  return groups;
}

const DIMENSION_LABEL: Record<ConcentrationDimension, string> = {
  event: "event",
  team: "team",
  kickoff_window: "kickoff window",
};

/**
 * Only evaluated at 4+ selected legs. Surfaces when a single event, team,
 * or kickoff window accounts for at least half the slip — context only,
 * never a block and never a safety claim.
 */
export function detectConcentrationSignals(legs: ConcentrationLeg[]): ConcentrationSignal[] {
  if (legs.length < CONCENTRATION_MIN_LEGS) return [];

  const dimensions: [ConcentrationDimension, (leg: ConcentrationLeg) => string | null][] = [
    ["event", (leg) => leg.eventId],
    ["team", (leg) => leg.team],
    ["kickoff_window", (leg) => leg.kickoffWindow],
  ];

  const signals: ConcentrationSignal[] = [];
  for (const [dimension, keyOf] of dimensions) {
    const groups = largestGroupsByKey(legs, keyOf);
    for (const [value, ideaIds] of groups) {
      const shareRatio = ideaIds.length / legs.length;
      if (shareRatio >= CONCENTRATION_SHARE_THRESHOLD) {
        signals.push({
          dimension,
          value,
          ideaIds,
          shareRatio,
          explanation: `${ideaIds.length} of ${legs.length} legs (${Math.round(shareRatio * 100)}%) share the same ${DIMENSION_LABEL[dimension]}.`,
        });
      }
    }
  }
  return signals;
}
