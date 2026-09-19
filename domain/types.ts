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
};

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
  lineAtFinalize: number | null;
  oddsAtFinalizeAmerican: number | null;
  sportsbookAtCapture: string | null;
};

export type FinalizedParlay = {
  id: string;
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
