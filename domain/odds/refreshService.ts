import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";
import {
  mergeLiveContextIfIdeaCurrent,
  type RefreshAttempt,
  type RefreshWriteOutcome,
} from "@/storage/indexeddb/repositories/liveContextRepository";
import { allocateRefreshAttempt } from "@/storage/indexeddb/repositories/metaRepository";
import { changesPriceIdentity } from "@/domain/ideas/ideaService";
import { captureIsEligible } from "@/domain/ideas/captureProposition";
import { missingOddsRequestFields } from "./refreshability";

export type OddsApiOutcome = {
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
  /**
   * True only when this event's fetch succeeded, so oddsFetchedAt was renewed
   * for its legs, except those in changedIdeaIds, which got nothing.
   */
  priceRefreshed: boolean;
  /** Legs of a successful fetch whose outcome couldn't be confirmed (price cleared, timestamp renewed). */
  unmatchedIdeaIds: string[];
  /** Legs whose idea was edited (price identity changed) or deleted while this was in flight: nothing written (INV-13). */
  changedIdeaIds: string[];
  /** Legs where a LATER refresh attempt's odds were already stored, so this older result was not written. */
  supersededIdeaIds: string[];
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
  /**
   * Legs that WERE sent, but whose idea was edited (price identity changed) or
   * deleted before the result could be written, so nothing was written for
   * them: the price was fetched for a proposition the leg no longer is. All
   * events' changedIdeaIds together. Not refreshed; a new refresh will fetch
   * the edited proposition.
   */
  changedIdeaIds: string[];
  /**
   * Legs whose result wasn't written because a refresh that STARTED LATER had
   * already stored its own result for them (another tab, or a refresh started
   * after navigating away and back). All events' supersededIdeaIds together.
   * Nothing to tell the user: what's stored is newer than this result.
   */
  supersededIdeaIds: string[];
};

export type PlayerStatusRefreshResult = {
  status: "ok" | "failed" | "nothing_to_refresh";
  attemptedAt: string;
  failure: RefreshRequestFailure | null;
  /** As OddsRefreshResult.changedIdeaIds: the status was fetched for a player the leg no longer names. */
  changedIdeaIds: string[];
  /** As OddsRefreshResult.supersededIdeaIds, for player status. */
  supersededIdeaIds: string[];
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
  const match = matchLeg(idea, outcomes);
  return "outcome" in match ? match.outcome : null;
}

/**
 * Why no outcome was matched: the book doesn't list the market at all, the
 * market is listed but not at this leg's line (the line is part of the bet),
 * or this leg couldn't be identified in it (no player name, player not in the
 * market, an ambiguous selection, or no line for a market that has lines).
 */
export type LegMatch =
  | { outcome: OddsApiOutcome }
  | { miss: "market_not_listed" | "unidentified" }
  /** The market (and this player, for a prop) is listed, but not at the leg's line; offeredLines are the lines it shows. */
  | { miss: "line_not_offered"; offeredLines: number[] };

/**
 * Whether a market key is one of the provider's alternate-line markets
 * (player_reception_yds_alternate, alternate_totals, alternate_spreads), which
 * list every rung a book offers. A MAIN market lists only the book's main line,
 * so a leg's line missing from it says nothing about whether the book offers
 * that line as an alternate (B's review of 74be340, R1).
 */
/** The provider's player-prop markets are all keyed player_*. */
function isPlayerMarketKey(marketKey: string | null): boolean {
  return Boolean(marketKey?.startsWith("player_"));
}

export function isAlternateMarketKey(marketKey: string | null): boolean {
  return Boolean(marketKey && (marketKey.endsWith("_alternate") || marketKey.startsWith("alternate_")));
}

/**
 * EXACT LINE (Trevor/GPT 2026-11-02): in a market whose outcomes carry lines,
 * only an outcome at the leg's own line (lineAtCapture) is this leg. A book
 * that has moved its line to another number isn't offering this bet; the main
 * line, or the first outcome with the right selection, is never substituted.
 * A leg with no line in such a market can't be identified.
 */
export function matchLeg(idea: CapturedIdea, outcomes: OddsApiOutcome[]): LegMatch {
  const found = matchOutcomeAtLine(idea, outcomes);
  if (found !== null && typeof found === "object" && "lines" in found) return { miss: "line_not_offered", offeredLines: found.lines };
  if (found !== null) return { outcome: found as OddsApiOutcome };
  if (!outcomes.some((o) => o.marketKey === idea.marketKey)) return { miss: "market_not_listed" };
  return { miss: "unidentified" };
}

function matchOutcomeAtLine(idea: CapturedIdea, outcomes: OddsApiOutcome[]): OddsApiOutcome | { lines: number[] } | null {
  const forMarket = outcomes.filter((o) => o.marketKey === idea.marketKey);
  if (forMarket.length === 0) return null;

  const isPlayerPropMarket = forMarket.some((o) => o.description !== null);
  // A player market with no lines (anytime / first TD scorer) is a yes/no bet
  // on the player, so a blank selection means Yes in either provider format
  // (B's re-review of 85ab740).
  const scorerMarket = isPlayerMarketKey(idea.marketKey) && !forMarket.some((o) => o.point !== null);
  const selection = idea.selection ? normalizeName(idea.selection) : scorerMarket ? "yes" : null;
  let candidates = forMarket;

  if (isPlayerPropMarket) {
    if (!idea.playerName) return null; // can't safely pick a player without an identity to match
    candidates = forMarket.filter((o) => o.description && normalizeName(o.description) === normalizeName(idea.playerName as string));
    if (candidates.length === 0) return null;
  } else if (idea.playerName && scorerMarket) {
    // No description field in a scorer market: each outcome's `name` IS a
    // player, and that outcome is the player's "yes". A yes leg takes the one
    // outcome; a "no" leg is never given the yes price. Only scorer markets:
    // quick-add can put a TEAM in Player ("Seattle Seahawks +6.5"), and in h2h
    // or spreads a team-named outcome must still go through the line and
    // selection checks below.
    const byPlayerName = forMarket.filter((o) => normalizeName(o.name) === normalizeName(idea.playerName as string));
    if (byPlayerName.length > 0) {
      if (selection !== "yes") return null;
      return byPlayerName.length === 1 ? byPlayerName[0] : null;
    }
  }

  // A market with lines: only this leg's own line is this leg.
  if (candidates.some((o) => o.point !== null)) {
    if (idea.lineAtCapture === null) return null;
    const atLine = candidates.filter((o) => o.point === idea.lineAtCapture);
    if (atLine.length === 0) return { lines: [...new Set(candidates.map((o) => o.point).filter((p): p is number => p !== null))].sort((a, b) => a - b) };
    candidates = atLine;
  }

  if (selection) {
    // Same normalization as changesPriceIdentity, so an edit it calls cosmetic can't change the match.
    // Exactly one outcome must match the selection (B's review of 74be340, R2):
    // none (e.g. an Under leg where only Over is listed) is never the other
    // side, and two (the same Over at two prices) is never the first one.
    const bySelection = candidates.filter((o) => normalizeName(o.name) === selection);
    return bySelection.length === 1 ? bySelection[0] : null;
  }
  // No selection: only auto-pick a lone remaining candidate; multiple
  // undifferentiated candidates left is exactly the ambiguity this function
  // exists to avoid.
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Writes one refresh result onto the stored row for (idea, book), unless:
 * - the idea is no longer the one the request was made for: its price
 *   identity changed (changesPriceIdentity, the one definition) or it was
 *   deleted while the request was in flight ("idea-changed", INV-13). A
 *   cosmetic edit (note, confidence) doesn't change the identity, so the
 *   result is still written; or
 * - a NEWER market observation (from a refresh that started later) is already
 *   stored for the same half of the row ("superseded"): an older observation
 *   never overwrites a newer one, whichever response arrives last. Only an
 *   observation (a successful fetch, or a genuine not_found) advances the
 *   row's stamp; an error observed nothing and never blocks an older real
 *   observation.
 * Both checks and the write are one transaction (mergeLiveContextIfIdeaCurrent).
 */
async function mergeLiveContext(
  fetchedFor: CapturedIdea,
  sportsbook: string,
  attempt: RefreshAttempt,
  patch: Partial<LiveContext>,
): Promise<RefreshWriteOutcome> {
  return mergeLiveContextIfIdeaCurrent(
    fetchedFor.id,
    sportsbook,
    attempt,
    (current) => current !== undefined && !changesPriceIdentity(fetchedFor, current),
    (existing) => {
      // A patch without fetchedAt is a failed attempt: it must not make older data
      // look freshly fetched, so the last fetchedAt is kept. Only a record created
      // by a failed attempt (no prior data) is stamped with the attempt time.
      const fetchedAt = patch.fetchedAt ?? existing?.fetchedAt ?? new Date().toISOString();
      return {
        ideaId: fetchedFor.id,
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
    },
  );
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
 *
 * A leg whose idea was edited (price identity) or deleted while the request
 * was in flight gets no write at all, and is reported in changedIdeaIds
 * (INV-13): the result describes a proposition the leg no longer is.
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
    return {
      status: "nothing_to_refresh",
      attemptedAt,
      failure: null,
      events: [],
      skippedIdeaIds,
      missingIdeaIds,
      changedIdeaIds: [],
      supersededIdeaIds: [],
    };
  }

  const failed = (failure: RefreshRequestFailure): OddsRefreshResult => ({
    status: "failed",
    attemptedAt,
    failure,
    events: [],
    skippedIdeaIds,
    missingIdeaIds,
    changedIdeaIds: [],
    supersededIdeaIds: [],
  });

  // Taken before the request goes out, so it orders this attempt by when it
  // STARTED relative to other refreshes, not by when its response arrives.
  const attempt = { source: "odds" as const, seq: await allocateRefreshAttempt() };

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
      changedIdeaIds: [],
      supersededIdeaIds: [],
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
        // A genuine not_found is an observation (the book doesn't list the
        // market); a provider error or unconfigured book observed nothing.
        const observation = result.status === "not_found";
        const outcome = await mergeLiveContext(idea, candidate.sportsbook, { ...attempt, observation }, {
          eventId: idea.eventId,
          ...(result.status === "not_found" ? { marketAvailable: false } : {}),
          warnings,
        });
        if (outcome === "idea-changed") event.changedIdeaIds.push(ideaId);
        else if (outcome === "superseded") event.supersededIdeaIds.push(ideaId);
        continue;
      }
      const match = matchLeg(idea, result.outcomes);
      const outcome = "outcome" in match ? match.outcome : null;
      // An unmatched leg is one of three situations. "The market key isn't in
      // this response at all" and "the market is listed, with this player, but
      // not at this leg's line" are positive evidence the book isn't offering
      // this bet (false). A listed market the matcher couldn't attach to this
      // leg (no player name, player not in the market, an ambiguous selection,
      // no line) is a matcher limitation, not evidence of absence, so it stays
      // unknown (null).
      const miss = "miss" in match ? match.miss : null;
      // A line missing from a MAIN market isn't evidence the book doesn't offer
      // it (it may be an alternate rung, and alternate markets aren't fetched):
      // unknown, with an honest note, so the labelled capture price still
      // applies. Only an alternate market, which lists every rung, can show a
      // line isn't offered (B's review of 74be340, R1; Trevor's minimal fix).
      const lineUnchecked = miss === "line_not_offered" && !isAlternateMarketKey(idea.marketKey);
      const shown = "offeredLines" in match ? match.offeredLines.join(" / ") : "";
      const written = await mergeLiveContext(idea, candidate.sportsbook, { ...attempt, observation: true }, {
        eventId: idea.eventId,
        currentLine: outcome?.point ?? null,
        currentOddsAmerican: outcome?.priceAmerican ?? null,
        marketAvailable: outcome !== null ? true : miss === "unidentified" || lineUnchecked ? null : false,
        oddsFetchedAt: result.fetchedAt,
        oddsSource: "odds-api",
        fetchedAt: result.fetchedAt,
        source: "odds-api",
        warnings:
          outcome === null
            ? [
                ...warnings,
                lineUnchecked
                  ? `Live price is only checked at the main line (${shown} here), not at ${idea.lineAtCapture}.${
                      idea.oddsAtCaptureAmerican !== null && captureIsEligible(idea) ? " Using your captured price." : ""
                    }`
                  : miss === "line_not_offered"
                  ? `This sportsbook isn't offering this bet at ${idea.lineAtCapture} right now.`
                  : miss === "unidentified"
                    ? "Could not confirm which outcome belongs to this leg (player/selection/line unclear or ambiguous)."
                    : "This sportsbook isn't listing this market for the game right now.",
              ]
            : warnings,
      });
      if (written === "idea-changed") event.changedIdeaIds.push(ideaId);
      else if (written === "superseded") event.supersededIdeaIds.push(ideaId);
      else if (outcome === null) event.unmatchedIdeaIds.push(ideaId);
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
  const changedIdeaIds = events.flatMap((event) => event.changedIdeaIds);
  const supersededIdeaIds = events.flatMap((event) => event.supersededIdeaIds);
  return { status, attemptedAt, failure: null, events, skippedIdeaIds, missingIdeaIds, changedIdeaIds, supersededIdeaIds };
}

export async function refreshPlayerStatusForCandidate(
  candidate: CandidateParlay,
  ideas: CapturedIdea[],
): Promise<PlayerStatusRefreshResult> {
  const attemptedAt = new Date().toISOString();
  const legs = candidate.ideaIds
    .map((id) => ideas.find((idea) => idea.id === id))
    .filter((idea): idea is CapturedIdea => Boolean(idea && idea.playerId));

  const none = { changedIdeaIds: [], supersededIdeaIds: [] };
  if (legs.length === 0) return { status: "nothing_to_refresh", attemptedAt, failure: null, ...none };

  const playerIds = [...new Set(legs.map((leg) => leg.playerId as string))];
  // Taken before the request goes out: see refreshOddsForCandidate.
  // Every player-status write is an observation: failures return before writing anything.
  const attempt: RefreshAttempt = { source: "playerStatus", seq: await allocateRefreshAttempt(), observation: true };
  let response: Response;
  try {
    response = await fetch(`/api/sleeper?playerIds=${playerIds.join(",")}`);
  } catch (error) {
    return { status: "failed", attemptedAt, failure: failureFromError(error), ...none };
  }
  if (!response.ok) return { status: "failed", attemptedAt, failure: failureFromResponse(response), ...none };

  let body: { fetchedAt: string; players: Record<string, { status: string | null; depthChartPosition: string | null }> };
  try {
    body = await response.json();
  } catch {
    return {
      status: "failed",
      attemptedAt,
      failure: { kind: "invalid_response", httpStatus: response.status },
      ...none,
    };
  }
  const { fetchedAt, players } = body;

  const changedIdeaIds: string[] = [];
  const supersededIdeaIds: string[] = [];
  for (const idea of legs) {
    const player = players[idea.playerId as string];
    if (!player) continue;
    const written = await mergeLiveContext(idea, candidate.sportsbook, attempt, {
      playerStatus: player.status,
      depthChartPosition: player.depthChartPosition,
      playerStatusFetchedAt: fetchedAt,
      playerStatusSource: "sleeper",
      fetchedAt,
      source: "sleeper",
    });
    if (written === "idea-changed") changedIdeaIds.push(idea.id);
    else if (written === "superseded") supersededIdeaIds.push(idea.id);
  }
  return { status: "ok", attemptedAt, failure: null, changedIdeaIds, supersededIdeaIds };
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
 * (not_configured, nothing_to_refresh, plain success). Only real failures go
 * here; legs skipped for missing details are describeRefreshNotice's.
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
  if (playerStatus.failure) messages.push(describeFailure("player status", playerStatus.failure));
  return messages.length > 0 ? messages.join(" ") : null;
}

/**
 * A neutral note about legs the refresh didn't update, or null when there
 * were none: legs it didn't send because their ideas lack a league, game or
 * market, and legs whose idea was edited or deleted while the refresh was in
 * flight (their results weren't saved, INV-13). These are facts about the
 * slip, not a failed refresh, so they are kept out of describeRefreshProblem
 * and must not be shown as an error. Without the first, a refresh that sent
 * nothing would look like it did nothing at all. Legs whose idea was deleted
 * before the refresh are not counted: they aren't missing details.
 */
export function describeRefreshNotice(result: CandidateRefreshResult): string | null {
  const { odds, playerStatus } = result;
  const notes: string[] = [];
  const unrefreshable = odds.skippedIdeaIds.length - odds.missingIdeaIds.length;
  if (unrefreshable > 0) {
    notes.push(
      odds.status === "nothing_to_refresh"
        ? "No odds to refresh: every leg still needs a league, game and market in its details."
        : `${unrefreshable} leg${unrefreshable === 1 ? " was" : "s were"} skipped: ${unrefreshable === 1 ? "it needs" : "they need"} a league, game and market in the idea's details.`,
    );
  }
  const changed = new Set([...odds.changedIdeaIds, ...playerStatus.changedIdeaIds]).size;
  if (changed > 0) {
    notes.push(
      `${changed} leg${changed === 1 ? " was" : "s were"} edited during the refresh, so ${changed === 1 ? "its" : "their"} results weren't saved. Refresh again to update ${changed === 1 ? "it" : "them"}.`,
    );
  }
  return notes.length > 0 ? notes.join(" ") : null;
}
