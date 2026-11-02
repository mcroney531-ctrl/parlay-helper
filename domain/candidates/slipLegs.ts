import type { CapturedIdea } from "@/domain/types";

/**
 * One stored leg of a slip, resolved against the ideas that exist now. A leg
 * whose idea was deleted stays a leg: it keeps its place and its id, so the
 * user can see it and remove it. It is never filled in with a made-up idea,
 * and it never gets a price, even if a cached live price for it remains.
 */
export type SlipLeg =
  | { kind: "present"; ideaId: string; idea: CapturedIdea }
  | { kind: "missing"; ideaId: string };

/**
 * Every entry of `ideaIds`, in order, as a present or missing leg. The one
 * way a slip's legs are read, so the Slip screen, the estimate, the rule
 * banners and placement all see the same legs.
 */
export function resolveSlipLegs(
  ideaIds: readonly string[],
  ideaFor: (ideaId: string) => CapturedIdea | undefined,
): SlipLeg[] {
  return ideaIds.map((ideaId) => {
    const idea = ideaFor(ideaId);
    return idea ? { kind: "present", ideaId, idea } : { kind: "missing", ideaId };
  });
}

/** The ideas of the legs that still exist, in slip order. */
export function presentIdeas(legs: readonly SlipLeg[]): CapturedIdea[] {
  return legs.flatMap((leg) => (leg.kind === "present" ? [leg.idea] : []));
}

/** The ids of legs whose idea no longer exists, in slip order. */
export function missingLegIds(legs: readonly SlipLeg[]): string[] {
  return legs.flatMap((leg) => (leg.kind === "missing" ? [leg.ideaId] : []));
}

/** A lookup over a list of ideas, for resolveSlipLegs. */
export function ideaLookup(ideas: readonly CapturedIdea[]): (ideaId: string) => CapturedIdea | undefined {
  const byId = new Map(ideas.map((idea) => [idea.id, idea]));
  return (ideaId) => byId.get(ideaId);
}
