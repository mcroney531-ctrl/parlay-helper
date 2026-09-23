import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";
import { getLiveContext, putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";
import { missingOddsRequestFields } from "./refreshability";

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

/**
 * Why a whole provider request produced nothing usable. Kept separate from
 * per-event outcomes: a request-level failure means no event was evaluated,
 * so no LiveContext is written and the caller learns about it only through
 * the returned result.
 */
export type RefreshRequestFailure =
  | { kind: "transport"; message: string }
  | { kind: "rate_limited"; httpStatus: 429; retryAfterSeconds: number | null }
  | { kind: "http_error"; httpStatus: number }
  | { kind: "invalid_response"; httpStatus: number };

export type OddsEventOutcome = {
  eventId: string;
  ideaIds: string[];
  status: OddsApiResult["status"];
  warning: string | null;
  /** True only when this event's fetch succeeded and oddsFetchedAt was renewed for its legs. */
  priceRefreshed: boolean;
  /** Legs of a successful fetch whose outcome couldn't be confirmed (price cleared, timestamp renewed). */
  unmatchedIdeaIds: string[];
};

export type OddsRefreshResult = {
  /**
   * ok: every event fetched. partial: some events fetched, some did not.
   * failed: request-level failure, or no event fetched. not_configured: every
   * event was for an unsupported book/league. nothing_to_refresh: no leg was
   * eligible (needs eventId, marketKey and league).
   */
  status: "ok" | "partial" | "failed" | "not_configured" | "nothing_to_refresh";
  attemptedAt: string;
  failure: RefreshRequestFailure | null;
  events: OddsEventOutcome[];
  /** Candidate legs that were not sent to the provider (unrefreshable or missing ideas). */
  skippedIdeaIds: string[];
  /** The subset of skippedIdeaIds whose idea no longer exists. */
  missingIdeaIds: string[];
};

export type PlayerStatusRefreshResult = {
  status: "ok" | "failed" | "nothing_to_refresh";
  attemptedAt: string;
  failure: RefreshRequestFailure | null;
};

export type CandidateRefreshResult = {
  odds: OddsRefreshResult;
  playerStatus: PlayerStatusRefreshResult;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function parseRetryAfterSeconds(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

function failureFromResponse(response: Response): RefreshRequestFailure {
  if (response.status === 429) {
    return {
      kind: "rate_limited",
      httpStatus: 429,
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("Retry-After")),
    };
  }
  return { kind: "http_error", httpStatus: response.status };
}

function failureFromError(error: unknown): RefreshRequestFailure {
  return { kind: "transport", message: error instanceof Error ? error.message : "Network request failed." };
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
  // A patch without fetchedAt is a failed attempt: it must not make older data
  // look freshly fetched, so the last fetchedAt is kept. Only a record created
  // by a failed attempt (no prior data) is stamped with the attempt time.
  const fetchedAt = patch.fetchedAt ?? existing?.fetchedAt ?? new Date().toISOString();
  const merged: LiveContext = {
    ideaId,
    // The repository stores this under the canonical book id; the text is kept for display.
    sportsbook,
    sportsbookLabel: sportsbook.trim() || existing?.sportsbookLabel,
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
    fetchedAt,
    source: patch.source ?? existing?.source ?? "unknown",
  };
  await putLiveContext(merged);
}

/**
 * Expected provider failures (offline, 429, non-OK HTTP, per-event provider
 * errors) are returned in the result rather than thrown, so callers can tell
 * them apart and a failure in one refresh never blocks the other. Storage
 * errors still throw.
 *
 * Only a successful per-event fetch renews oddsFetchedAt (and fetchedAt) for
 * that event's legs. A failed or not-found event keeps the last successful
 * price and timestamp and records only its own warning, so an old price can't
 * look freshly fetched.
 */
export async function refreshOddsForCandidate(candidate: CandidateParlay, ideas: CapturedIdea[]): Promise<OddsRefreshResult> {
  const attemptedAt = new Date().toISOString();
  const legs = candidate.ideaIds
    .map((id) => ideas.find((idea) => idea.id === id))
    .filter((idea): idea is CapturedIdea => Boolean(idea && missingOddsRequestFields(idea).length === 0));
  const sentIds = new Set(legs.map((leg) => leg.id));
  const skippedIdeaIds = candidate.ideaIds.filter((id) => !sentIds.has(id));
  const missingIdeaIds = skippedIdeaIds.filter((id) => !ideas.some((idea) => idea.id === id));

  if (legs.length === 0) {
    return { status: "nothing_to_refresh", attemptedAt, failure: null, events: [], skippedIdeaIds, missingIdeaIds };
  }

  const failed = (failure: RefreshRequestFailure): OddsRefreshResult => ({
    status: "failed",
    attemptedAt,
    failure,
    events: [],
    skippedIdeaIds,
    missingIdeaIds,
  });

  let response: Response;
  try {
    response = await fetch("/api/odds", {
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
  } catch (error) {
    return failed(failureFromError(error));
  }

  if (!response.ok) return failed(failureFromResponse(response));

  let results: OddsApiResult[];
  try {
    const body = (await response.json()) as { results?: OddsApiResult[] };
    if (!Array.isArray(body.results)) return failed({ kind: "invalid_response", httpStatus: response.status });
    results = body.results;
  } catch {
    return failed({ kind: "invalid_response", httpStatus: response.status });
  }

  const events: OddsEventOutcome[] = [];
  for (const result of results) {
    const warnings = result.warning ? [result.warning] : [];
    const event: OddsEventOutcome = {
      eventId: result.eventId,
      ideaIds: result.ideaIds,
      status: result.status,
      warning: result.warning,
      priceRefreshed: result.status === "ok",
      unmatchedIdeaIds: [],
    };
    events.push(event);
    for (const ideaId of result.ideaIds) {
      const idea = legs.find((leg) => leg.id === ideaId);
      if (!idea) continue;
      if (result.status !== "ok") {
        // No oddsFetchedAt / fetchedAt / oddsSource / source: those describe the
        // last successful fetch and this attempt didn't produce one. Likewise
        // marketAvailable is written only for not_found, which is an actual
        // observation; provider_error / not_configured observed nothing, so
        // they must not reset an earlier true/false to null.
        await mergeLiveContext(ideaId, candidate.sportsbook, {
          eventId: idea.eventId,
          ...(result.status === "not_found" ? { marketAvailable: false } : {}),
          warnings,
        });
        continue;
      }
      const outcome = matchOutcome(idea, result.outcomes);
      if (outcome === null) event.unmatchedIdeaIds.push(ideaId);
      // A bare unmatched outcome conflates four different situations. Only "the
      // market key isn't in this response at all" is positive evidence the book
      // doesn't list it (false); a listed market the matcher couldn't attach to
      // this leg (no player name, player not in the market, or an ambiguous
      // selection/line) is a matcher limitation, not evidence of absence, so it
      // stays unknown (null) rather than false.
      const listed = result.outcomes.some((o) => o.marketKey === idea.marketKey);
      await mergeLiveContext(ideaId, candidate.sportsbook, {
        eventId: idea.eventId,
        currentLine: outcome?.point ?? null,
        currentOddsAmerican: outcome?.priceAmerican ?? null,
        marketAvailable: outcome !== null ? true : listed ? null : false,
        oddsFetchedAt: result.fetchedAt,
        oddsSource: "odds-api",
        fetchedAt: result.fetchedAt,
        source: "odds-api",
        warnings:
          outcome === null
            ? [
                ...warnings,
                listed
                  ? "Could not confirm which outcome belongs to this leg (player/selection unclear or ambiguous)."
                  : "This sportsbook isn't listing this market for the game right now.",
              ]
            : warnings,
      });
    }
  }

  const fetched = events.filter((event) => event.priceRefreshed).length;
  const status: OddsRefreshResult["status"] =
    events.length > 0 && events.every((event) => event.status === "not_configured")
      ? "not_configured"
      : fetched === 0
        ? "failed"
        : fetched === events.length
          ? "ok"
          : "partial";
  return { status, attemptedAt, failure: null, events, skippedIdeaIds, missingIdeaIds };
}

export async function refreshPlayerStatusForCandidate(
  candidate: CandidateParlay,
  ideas: CapturedIdea[],
): Promise<PlayerStatusRefreshResult> {
  const attemptedAt = new Date().toISOString();
  const legs = candidate.ideaIds
    .map((id) => ideas.find((idea) => idea.id === id))
    .filter((idea): idea is CapturedIdea => Boolean(idea && idea.playerId));

  if (legs.length === 0) return { status: "nothing_to_refresh", attemptedAt, failure: null };

  const playerIds = [...new Set(legs.map((leg) => leg.playerId as string))];
  let response: Response;
  try {
    response = await fetch(`/api/sleeper?playerIds=${playerIds.join(",")}`);
  } catch (error) {
    return { status: "failed", attemptedAt, failure: failureFromError(error) };
  }
  if (!response.ok) return { status: "failed", attemptedAt, failure: failureFromResponse(response) };

  let body: { fetchedAt: string; players: Record<string, { status: string | null; depthChartPosition: string | null }> };
  try {
    body = await response.json();
  } catch {
    return { status: "failed", attemptedAt, failure: { kind: "invalid_response", httpStatus: response.status } };
  }
  const { fetchedAt, players } = body;

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
  return { status: "ok", attemptedAt, failure: null };
}

/**
 * Odds and player-status refreshes both read-modify-write the same
 * LiveContext record per idea. Running them sequentially (never
 * Promise.all) means the second write always merges onto the first's
 * result instead of racing it and silently dropping one side's update.
 *
 * Expected provider failures are returned, not thrown, so an odds failure
 * no longer prevents the player-status refresh (and vice versa). Callers
 * should reload live context after this resolves to pick up whichever
 * writes succeeded.
 */
export async function refreshCandidateContext(
  candidate: CandidateParlay,
  ideas: CapturedIdea[],
): Promise<CandidateRefreshResult> {
  const odds = await refreshOddsForCandidate(candidate, ideas);
  const playerStatus = await refreshPlayerStatusForCandidate(candidate, ideas);
  return { odds, playerStatus };
}

function describeFailure(source: string, failure: RefreshRequestFailure): string {
  switch (failure.kind) {
    case "transport":
      return `Couldn't reach the ${source} service (offline?). Showing the last data we have.`;
    case "rate_limited":
      return failure.retryAfterSeconds === null
        ? `Too many refreshes. Try again shortly.`
        : `Too many refreshes. Try again in ${failure.retryAfterSeconds}s.`;
    case "http_error":
    case "invalid_response":
      return `The ${source} service returned an error (HTTP ${failure.httpStatus}). Showing the last data we have.`;
  }
}

/**
 * One line for the refresh error slot, or null when there's nothing the user
 * needs told beyond the per-leg warnings that are already stored and rendered
 * (not_configured, plain success). Legs skipped for missing details are always
 * mentioned: they get no stored warning, so otherwise a refresh that sent
 * nothing would look like it did nothing at all.
 */
export function describeRefreshProblem(result: CandidateRefreshResult): string | null {
  const messages: string[] = [];
  const { odds, playerStatus } = result;
  if (odds.failure) {
    messages.push(describeFailure("odds", odds.failure));
  } else if (odds.status === "failed") {
    messages.push("The odds provider couldn't return prices for these games. Showing the last prices we have.");
  } else if (odds.status === "partial") {
    const fetched = odds.events.filter((event) => event.priceRefreshed).length;
    messages.push(
      `Odds refreshed for ${fetched} of ${odds.events.length} games; the rest kept their last prices (see leg warnings).`,
    );
  }
  const unrefreshable = odds.skippedIdeaIds.length - odds.missingIdeaIds.length;
  if (odds.status === "nothing_to_refresh" && unrefreshable > 0) {
    messages.push("No odds to refresh: every leg still needs a league, game and market in its details.");
  } else if (unrefreshable > 0) {
    messages.push(
      `${unrefreshable} leg${unrefreshable === 1 ? " was" : "s were"} skipped: ${unrefreshable === 1 ? "it needs" : "they need"} a league, game and market in the idea's details.`,
    );
  }
  if (playerStatus.failure) messages.push(describeFailure("player status", playerStatus.failure));
  return messages.length > 0 ? messages.join(" ") : null;
}
