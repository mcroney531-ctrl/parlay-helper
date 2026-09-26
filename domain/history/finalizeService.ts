import type { FinalizedLegSnapshot, FinalizedParlay } from "@/domain/types";
import { calculateCombinedEstimate, calculatePayoutCents } from "@/domain/odds/estimate";
import { isValidAmericanOdds } from "@/domain/odds/conversion";
import { getCandidate } from "@/storage/indexeddb/repositories/candidatesRepository";
import { getIdea } from "@/storage/indexeddb/repositories/ideasRepository";
import { getLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";
import {
  getAllFinalizedParlays,
  putFinalizedParlay,
} from "@/storage/indexeddb/repositories/finalizedRepository";

function newId(): string {
  return crypto.randomUUID();
}

export type FinalizeOptions = {
  actualSportsbookOddsAmerican?: number | null;
  actualSportsbookPayoutCents?: number | null;
  sportsbookBetId?: string;
  note?: string;
};

export async function finalizeCandidate(
  candidateId: string,
  options: FinalizeOptions = {},
): Promise<FinalizedParlay> {
  const candidate = await getCandidate(candidateId);
  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }
  if (candidate.ideaIds.length === 0) {
    throw new Error("Cannot finalize a candidate with no legs");
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

  const legSnapshots: FinalizedLegSnapshot[] = [];
  const estimateInputs = [];
  const missingIdeaIds: string[] = [];

  for (const ideaId of candidate.ideaIds) {
    const idea = await getIdea(ideaId);
    if (!idea) {
      missingIdeaIds.push(ideaId);
      continue;
    }
    const liveContext = await getLiveContext(ideaId, candidate.sportsbook);
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

  const finalized: FinalizedParlay = {
    id: newId(),
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
    finalizedAt: new Date().toISOString(),
  };

  await putFinalizedParlay(finalized);
  return finalized;
}

export async function listFinalizedParlays(): Promise<FinalizedParlay[]> {
  return getAllFinalizedParlays();
}
