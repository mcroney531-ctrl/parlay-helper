import type { FinalizedLegSnapshot, FinalizedParlay } from "@/domain/types";
import { calculateCombinedEstimate, calculatePayoutCents } from "@/domain/odds/estimate";
import { isValidAmericanOdds } from "@/domain/odds/conversion";
import { candidateRevision, isPlaced } from "@/domain/candidates/candidateState";
import { AlreadyPlacedError, CandidateNotFoundError, StaleCandidateError } from "@/domain/candidates/errors";
import {
  getAllFinalizedParlays,
  getFinalizedIdForCandidate,
} from "@/storage/indexeddb/repositories/finalizedRepository";
import {
  commitPlacement,
  type PlacementReads,
  type PlacementWrite,
} from "@/storage/indexeddb/repositories/placementRepository";

function newId(): string {
  return crypto.randomUUID();
}

export type FinalizeOptions = {
  actualSportsbookOddsAmerican?: number | null;
  actualSportsbookPayoutCents?: number | null;
  sportsbookBetId?: string;
  note?: string;
};

/**
 * Places a candidate: writes its finalized record and marks it placed, in one
 * transaction (INV-5). `seenRevision` is the candidate revision the user was
 * looking at when they confirmed (candidateRevision of the candidate they saw).
 * Inside the transaction the placement is rejected, with nothing written, if
 * the candidate is gone (CandidateNotFoundError), already placed
 * (AlreadyPlacedError, carrying the existing record's id), or changed since
 * that revision (StaleCandidateError) -- it never places legs, a sportsbook, a
 * stake or a promo other than the ones the user confirmed (INV-6).
 *
 * Ideas and live context are read inside the same transaction, and whatever is
 * stored at commit time is what's recorded; nothing is fetched here. A price
 * refreshed after the user's view is fine to use, because the snapshot records
 * the price itself.
 */
export async function finalizeCandidate(
  candidateId: string,
  seenRevision: number,
  options: FinalizeOptions = {},
): Promise<FinalizedParlay> {
  // INV-4: '' is a valid key for the unique index, so it must never be stored.
  if (!candidateId) {
    throw new Error("Cannot finalize without a candidate id.");
  }
  if (options.actualSportsbookOddsAmerican != null && !isValidAmericanOdds(options.actualSportsbookOddsAmerican)) {
    throw new Error("Actual odds must be a valid American price (e.g. +150 or -110).");
  }
  if (
    options.actualSportsbookPayoutCents != null &&
    (!Number.isFinite(options.actualSportsbookPayoutCents) || options.actualSportsbookPayoutCents < 0)
  ) {
    throw new Error("Actual payout must be a non-negative amount.");
  }

  try {
    return await commitPlacement(candidateId, (reads) => planPlacement(candidateId, seenRevision, options, reads));
  } catch (error) {
    // The unique by-candidateId index refused a second record for this
    // candidate (INV-3's second guard); the transaction aborted, so nothing
    // was written.
    if (error instanceof DOMException && error.name === "ConstraintError") {
      throw new AlreadyPlacedError(candidateId, (await getFinalizedIdForCandidate(candidateId)) ?? null);
    }
    throw error;
  }
}

/**
 * Decides the placement from what the transaction read. Synchronous: it runs
 * inside the transaction (see commitPlacement). Throws to reject.
 */
function planPlacement(
  candidateId: string,
  seenRevision: number,
  options: FinalizeOptions,
  { candidate, existingFinalizedId, ideas, liveContexts }: PlacementReads,
): PlacementWrite {
  if (!candidate) {
    throw new CandidateNotFoundError(candidateId);
  }
  if (isPlaced(candidate)) {
    throw new AlreadyPlacedError(candidateId, existingFinalizedId ?? null);
  }
  if (candidateRevision(candidate) !== seenRevision) {
    throw new StaleCandidateError(candidateId, seenRevision, candidateRevision(candidate));
  }
  if (candidate.ideaIds.length === 0) {
    throw new Error("Cannot finalize a candidate with no legs");
  }

  const legSnapshots: FinalizedLegSnapshot[] = [];
  const estimateInputs = [];
  const missingIdeaIds: string[] = [];

  for (const ideaId of candidate.ideaIds) {
    const idea = ideas.get(ideaId);
    if (!idea) {
      missingIdeaIds.push(ideaId);
      continue;
    }
    const liveContext = liveContexts.get(ideaId);
    // A market the book no longer offers has no price or line to record: what is
    // still stored is the last-known value, not what the slip would have been placed at.
    const marketOffered = liveContext?.marketAvailable !== false;

    legSnapshots.push({
      ideaId: idea.id,
      playerId: idea.playerId,
      playerName: idea.playerName,
      team: idea.team,
      opponent: idea.opponent,
      eventId: idea.eventId,
      marketLabel: idea.marketLabel,
      selection: idea.selection,
      lineAtCapture: idea.lineAtCapture,
      oddsAtCaptureAmerican: idea.oddsAtCaptureAmerican,
      lineAtFinalize: marketOffered ? (liveContext?.currentLine ?? null) : null,
      oddsAtFinalizeAmerican: marketOffered ? (liveContext?.currentOddsAmerican ?? null) : null,
      sportsbookAtCapture: idea.sportsbookAtCapture,
    });

    estimateInputs.push({
      ideaId: idea.id,
      eventId: idea.eventId,
      currentOddsAmerican: liveContext?.currentOddsAmerican ?? null,
      captureOddsAmerican: idea.oddsAtCaptureAmerican,
      captureSportsbook: idea.sportsbookAtCapture,
      slipSportsbook: candidate.sportsbook,
      marketAvailable: liveContext?.marketAvailable ?? null,
    });
  }

  if (missingIdeaIds.length > 0) {
    throw new Error(
      `Cannot finalize: ${missingIdeaIds.length} leg(s) reference an idea that no longer exists (${missingIdeaIds.join(", ")}). Remove them from the candidate first.`,
    );
  }

  const estimate = calculateCombinedEstimate(estimateInputs);
  const estimatedOddsAmerican = estimate.ok ? estimate.americanOdds : null;
  const estimatedPayoutCents = estimate.ok
    ? calculatePayoutCents(candidate.stakeCents, estimate.decimalOdds)
    : null;

  const finalizedAt = new Date().toISOString();
  const finalized: FinalizedParlay = {
    id: newId(),
    candidateId,
    candidateName: candidate.name,
    sportsbook: candidate.sportsbook,
    legSnapshots,
    stakeCents: candidate.stakeCents,
    estimatedOddsAmerican,
    estimatedPayoutCents,
    actualSportsbookOddsAmerican: options.actualSportsbookOddsAmerican ?? null,
    actualSportsbookPayoutCents: options.actualSportsbookPayoutCents ?? null,
    promoLabel: candidate.promoLabel,
    promoMaxStakeCents: candidate.promoMaxStakeCents,
    sportsbookBetId: options.sportsbookBetId ?? "",
    note: options.note ?? "",
    finalizedAt,
  };

  return {
    finalized,
    candidate: {
      ...candidate,
      status: "placed",
      placedAt: finalizedAt,
      updatedAt: finalizedAt,
      revision: candidateRevision(candidate) + 1,
    },
  };
}

export async function listFinalizedParlays(): Promise<FinalizedParlay[]> {
  return getAllFinalizedParlays();
}
