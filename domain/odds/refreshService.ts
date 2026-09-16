import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";
import { getLiveContext, putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";

type OddsApiOutcome = {
  marketKey: string;
  name: string;
  description: string | null;
  point: number | null;
  priceAmerican: number;
};
type OddsApiResult = {
  eventId: string;
  ideaIds: string[];
  status: "ok" | "not_found" | "provider_error" | "not_configured";
  fetchedAt: string;
  warning: string | null;
  outcomes: OddsApiOutcome[];
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Player-prop markets carry the player's identity in `description` (the
 * Odds API convention), separately from `name` (Over/Under/Yes/No). Some
 * markets instead put the player's name directly in `name` (e.g. anytime
 * touchdown scorer, where each outcome IS a player). Either way, once a
 * market has more than one player in it, matching on selection alone can
 * silently attach the wrong player's price — so player identity must
 * match whenever the market carries one, and the match is refused (not
 * guessed) when identity can't be confirmed.
 */
export function matchOutcome(idea: CapturedIdea, outcomes: OddsApiOutcome[]): OddsApiOutcome | null {
  const forMarket = outcomes.filter((o) => o.marketKey === idea.marketKey);
  if (forMarket.length === 0) return null;

  const isPlayerPropMarket = forMarket.some((o) => o.description !== null);
  let candidates = forMarket;

  if (isPlayerPropMarket) {
    if (!idea.playerName) return null; // can't safely pick a player without an identity to match
    candidates = forMarket.filter((o) => o.description && normalizeName(o.description) === normalizeName(idea.playerName as string));
    if (candidates.length === 0) return null;
  } else if (idea.playerName) {
    // No description field, but this idea has a player (e.g. anytime-TD
    // style markets where `name` IS the player). Require a name match
    // before falling back to selection/point.
    const byPlayerName = forMarket.filter((o) => normalizeName(o.name) === normalizeName(idea.playerName as string));
    if (byPlayerName.length > 0) candidates = byPlayerName;
  }

  if (idea.selection) {
    const bySelection = candidates.find((o) => o.name.toLowerCase() === idea.selection?.toLowerCase());
    if (bySelection) return bySelection;
  }
  if (idea.lineAtCapture !== null) {
    const byPoint = candidates.find((o) => o.point === idea.lineAtCapture);
    if (byPoint) return byPoint;
  }
  // Only auto-pick a lone remaining candidate; multiple undifferentiated
  // candidates left is exactly the ambiguity this function exists to avoid.
  return candidates.length === 1 ? candidates[0] : null;
}

async function mergeLiveContext(
  ideaId: string,
  sportsbook: string,
  patch: Partial<LiveContext>,
): Promise<void> {
  const existing = await getLiveContext(ideaId, sportsbook);
  const now = patch.fetchedAt ?? new Date().toISOString();
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
    oddsFetchedAt: existing?.oddsFetchedAt ?? null,
    oddsSource: existing?.oddsSource ?? null,
    playerStatusFetchedAt: existing?.playerStatusFetchedAt ?? null,
    playerStatusSource: existing?.playerStatusSource ?? null,
    warnings: existing?.warnings ?? [],
    ...patch,
    fetchedAt: now,
    source: patch.source ?? existing?.source ?? "unknown",
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
          oddsFetchedAt: result.fetchedAt,
          oddsSource: "odds-api",
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
        oddsFetchedAt: result.fetchedAt,
        oddsSource: "odds-api",
        fetchedAt: result.fetchedAt,
        source: "odds-api",
        warnings:
          outcome === null
            ? [...warnings, "Could not confirm which outcome belongs to this leg (player/selection unclear or ambiguous)."]
            : warnings,
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
      playerStatusFetchedAt: fetchedAt,
      playerStatusSource: "sleeper",
      fetchedAt,
      source: "sleeper",
    });
  }
}

/**
 * Odds and player-status refreshes both read-modify-write the same
 * LiveContext record per idea. Running them sequentially (never
 * Promise.all) means the second write always merges onto the first's
 * result instead of racing it and silently dropping one side's update.
 */
export async function refreshCandidateContext(candidate: CandidateParlay, ideas: CapturedIdea[]): Promise<void> {
  await refreshOddsForCandidate(candidate, ideas);
  await refreshPlayerStatusForCandidate(candidate, ideas);
}
