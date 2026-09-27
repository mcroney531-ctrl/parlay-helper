// Core domain types. Mirrors the schemas defined in the product handoff.
// These are the persisted/canonical shapes used across storage, domain, and UI.

export type Confidence = "core" | "like" | "longshot" | "unrated";

export type DetailsStatus = "needs_details" | "structured";

export type CapturedIdea = {
  id: string;
  rawText: string;
  detailsStatus: DetailsStatus;
  sport: string | null;
  league: string | null;
  slateDate: string | null;
  playerId: string | null;
  playerName: string | null;
  team: string | null;
  opponent: string | null;
  eventId: string | null;
  marketKey: string | null;
  marketLabel: string | null;
  selection: "over" | "under" | "yes" | "no" | string | null;
  lineAtCapture: number | null;
  oddsAtCaptureAmerican: number | null;
  sportsbookAtCapture: string | null;
  confidence: Confidence;
  note: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type LiveContext = {
  ideaId: string;
  /**
   * Canonical sportsbook id (see canonicalSportsbookId), part of the IDB key.
   * The liveContext repository writes it in canonical form regardless of what
   * the caller passes; do not use it as display text.
   */
  sportsbook: string;
  /** The sportsbook as the user typed it, for display. Optional: rows written before this field have none. */
  sportsbookLabel?: string;
  eventId: string | null;
  currentLine: number | null;
  currentOddsAmerican: number | null;
  /**
   * true: matched to an outcome. false: the provider positively reported the
   * book doesn't list it (a 404, or a good response with no outcome for this
   * market key). null: unknown — never fetched, a failed attempt, or fetched
   * but this leg couldn't be identified in a market that IS listed (matcher
   * limits: no player name, player not in the market, or an ambiguous
   * selection/line).
   */
  marketAvailable: boolean | null;
  playerStatus: string | null;
  depthChartPosition: string | null;
  gameStatus: string | null;
  scheduledStart: string | null;
  fetchedAt: string;
  source: string;
  warnings: string[];
  // Odds and player-status come from independent providers on independent
  // schedules (odds: on demand; player status: ~daily cache). Tracked
  // separately so refreshing one never overstates the freshness of the
  // other. `fetchedAt`/`source` above reflect whichever updated most recently.
  oddsFetchedAt: string | null;
  oddsSource: string | null;
  playerStatusFetchedAt: string | null;
  playerStatusSource: string | null;
  // The refresh attempt whose result each half of this row holds (see
  // allocateRefreshAttempt). A result from an EARLIER attempt never overwrites
  // one from a later attempt. Optional: rows written before these existed have
  // none, which reads as 0 (older than every attempt).
  /** Attempt number of the odds refresh whose result this row holds. */
  oddsAttempt?: number;
  /** Attempt number of the player-status refresh whose result this row holds. */
  playerStatusAttempt?: number;
};

export type CandidateStatus = "draft" | "placed";

export type CandidateParlay = {
  id: string;
  name: string;
  sportsbook: string;
  ideaIds: string[];
  stakeCents: number;
  promoLabel: string;
  promoMaxStakeCents: number | null;
  createdAt: string;
  updatedAt: string;
  // The three fields below arrived with schema v3 and are optional for the
  // same reason as FinalizedLegSnapshot.playerId: every candidate saved before
  // v3 has no such keys, and the migration deliberately doesn't rewrite them.
  // Read them through domain/candidates/candidateState, never directly.
  /** Absent reads as "draft". Only ever moves draft -> placed. */
  status?: CandidateStatus;
  /** When the candidate was placed; equals its finalized record's finalizedAt. */
  placedAt?: string;
  /**
   * Edit counter: the "version the user saw" that placement checks against.
   * Absent reads as 0. Every edit to the candidate increments it.
   */
  revision?: number;
};

/**
 * Where a saved leg's price came from, from the one price resolver (INV-12):
 * the price the leg was placed at and its provenance. The estimate saved on
 * the same record was computed from these same resolutions.
 */
export type SnapshotLegPrice =
  | {
      /** The live price at the slip's book. */
      source: "current";
      oddsAmerican: number;
      line: number | null;
      /** The slip's book, as the slip names it. */
      book: string | null;
      /** When that live price was fetched; null if unknown. */
      oddsFetchedAt: string | null;
    }
  | {
      /** The capture price, used because no live price was stored. */
      source: "capture";
      oddsAmerican: number;
      line: number | null;
      /** The book the capture price was observed at (the idea's sportsbookAtCapture), as typed; null if unknown. */
      book: string | null;
      /** How that book compares to the slip's: a capture price from another book is never the slip book's price. */
      bookMatch: "same" | "different" | "unverified" | "unknown";
    }
  | {
      /** No price: nothing stored, or the slip's book no longer offers the market. */
      source: "unavailable";
      oddsAmerican: null;
      line: null;
      book: null;
      unavailableReason?: "market_not_offered";
    };

export type FinalizedLegSnapshot = {
  ideaId: string;
  // Optional, not `string | null`: records finalized before this field
  // existed have no `playerId` key at all in IndexedDB (`undefined` at
  // read time, not `null`) — the type says so honestly rather than
  // claiming a guarantee old persisted data doesn't actually meet.
  playerId?: string | null;
  playerName: string | null;
  team: string | null;
  opponent: string | null;
  eventId: string | null;
  marketLabel: string | null;
  selection: string | null;
  lineAtCapture: number | null;
  oddsAtCaptureAmerican: number | null;
  /** The live line at the slip's book at placement; null unless the leg was priced from a live price. */
  lineAtFinalize: number | null;
  /** The live price at the slip's book at placement; null unless the leg was priced from a live price. */
  oddsAtFinalizeAmerican: number | null;
  sportsbookAtCapture: string | null;
  /**
   * The price this leg was placed at and where it came from (INV-12). Optional
   * for the same reason as playerId: records saved before it existed have no
   * such key, and nothing is inferred for them.
   */
  price?: SnapshotLegPrice;
};

export type FinalizedParlay = {
  id: string;
  /**
   * The candidate this record placed. Present and non-empty on every record
   * written from schema v3 on; absent on older records, which are never
   * linked after the fact (their candidate is not inferred). May name a
   * candidate that has since been deleted.
   */
  candidateId?: string;
  candidateName: string;
  sportsbook: string;
  legSnapshots: FinalizedLegSnapshot[];
  stakeCents: number;
  estimatedOddsAmerican: number | null;
  estimatedPayoutCents: number | null;
  actualSportsbookOddsAmerican: number | null;
  actualSportsbookPayoutCents: number | null;
  promoLabel: string;
  promoMaxStakeCents: number | null;
  sportsbookBetId: string;
  note: string;
  finalizedAt: string;
};

export const CONFIDENCE_LEVELS: Confidence[] = ["core", "like", "longshot", "unrated"];

export const DEFAULT_STAKE_CENTS = 200;
