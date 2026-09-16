import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";
import { getLiveContext, putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";

type OddsApiOutcome = { marketKey: string; name: string; point: number | null; priceAmerican: number };
type OddsApiResult = {
  eventId: string;
  ideaIds: string[];
  status: "ok" | "not_found" | "provider_error" | "not_configured";
  fetchedAt: string;
  warning: string | null;
  outcomes: OddsApiOutcome[];
};

function matchOutcome(idea: CapturedIdea, outcomes: OddsApiOutcome[]): OddsApiOutcome | null {
  const forMarket = outcomes.filter((o) => o.marketKey === idea.marketKey);
  if (forMarket.length === 0) return null;
  if (idea.selection) {
    const bySelection = forMarket.find((o) => o.name.toLowerCase() === idea.selection?.toLowerCase());
    if (bySelection) return bySelection;
  }
  if (idea.lineAtCapture !== null) {
    const byPoint = forMarket.find((o) => o.point === idea.lineAtCapture);
    if (byPoint) return byPoint;
  }
  return forMarket[0];
}

async function mergeLiveContext(ideaId: string, sportsbook: string, patch: Partial<LiveContext>): Promise<void> {
  const existing = await getLiveContext(ideaId);
  const merged: LiveContext = {
    ideaId,
    sportsbook,
    eventId: existing?.eventId ?? null,
    currentLine: existing?.currentLine ?? null,
    currentOddsAmerican: existing?.currentOddsAmerican ?? null,
    marketAvailable: existing?.marketAvailable ?? null,
    playerStatus: existing?.playerStatus ?? null,
    depthChartPosition: existing?.depthChartPosition ?? null,
    gameStatus: existing?.gameStatus ?? null,
    scheduledStart: existing?.scheduledStart ?? null,
    fetchedAt: existing?.fetchedAt ?? new Date().toISOString(),
    source: existing?.source ?? "unknown",
    warnings: existing?.warnings ?? [],
    ...patch,
  };
  await putLiveContext(merged);
}

export async function refreshOddsForCandidate(candidate: CandidateParlay, ideas: CapturedIdea[]): Promise<void> {
  const legs = candidate.ideaIds
    .map((id) => ideas.find((idea) => idea.id === id))
    .filter((idea): idea is CapturedIdea => Boolean(idea && idea.eventId && idea.marketKey && idea.league));

  if (legs.length === 0) return;

  const response = await fetch("/api/odds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sportsbook: candidate.sportsbook,
      legs: legs.map((leg) => ({
        ideaId: leg.id,
        league: leg.league,
        eventId: leg.eventId,
        marketKey: leg.marketKey,
      })),
    }),
  });

  if (!response.ok) return;
  const { results } = (await response.json()) as { results: OddsApiResult[] };

  for (const result of results) {
    const warnings = result.warning ? [result.warning] : [];
    for (const ideaId of result.ideaIds) {
      const idea = legs.find((leg) => leg.id === ideaId);
      if (!idea) continue;
      if (result.status !== "ok") {
        await mergeLiveContext(ideaId, candidate.sportsbook, {
          eventId: idea.eventId,
          marketAvailable: result.status === "not_found" ? false : null,
          fetchedAt: result.fetchedAt,
          source: "odds-api",
          warnings,
        });
        continue;
      }
      const outcome = matchOutcome(idea, result.outcomes);
      await mergeLiveContext(ideaId, candidate.sportsbook, {
        eventId: idea.eventId,
        currentLine: outcome?.point ?? null,
        currentOddsAmerican: outcome?.priceAmerican ?? null,
        marketAvailable: outcome !== null,
        fetchedAt: result.fetchedAt,
        source: "odds-api",
        warnings: outcome === null ? [...warnings, "No matching outcome found for this leg's market."] : warnings,
      });
    }
  }
}

export async function refreshPlayerStatusForCandidate(candidate: CandidateParlay, ideas: CapturedIdea[]): Promise<void> {
  const legs = candidate.ideaIds
    .map((id) => ideas.find((idea) => idea.id === id))
    .filter((idea): idea is CapturedIdea => Boolean(idea && idea.playerId));

  if (legs.length === 0) return;

  const playerIds = [...new Set(legs.map((leg) => leg.playerId as string))];
  const response = await fetch(`/api/sleeper?playerIds=${playerIds.join(",")}`);
  if (!response.ok) return;
  const { fetchedAt, players } = (await response.json()) as {
    fetchedAt: string;
    players: Record<string, { status: string | null; depthChartPosition: string | null }>;
  };

  for (const idea of legs) {
    const player = players[idea.playerId as string];
    if (!player) continue;
    await mergeLiveContext(idea.id, candidate.sportsbook, {
      playerStatus: player.status,
      depthChartPosition: player.depthChartPosition,
      fetchedAt,
      source: "sleeper",
    });
  }
}

export async function refreshCandidateContext(candidate: CandidateParlay, ideas: CapturedIdea[]): Promise<void> {
  await Promise.all([refreshOddsForCandidate(candidate, ideas), refreshPlayerStatusForCandidate(candidate, ideas)]);
}
