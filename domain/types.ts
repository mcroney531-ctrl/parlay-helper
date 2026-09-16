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
  sportsbook: string;
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
