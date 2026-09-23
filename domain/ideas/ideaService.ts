import type { CapturedIdea, Confidence } from "@/domain/types";
import {
  deleteIdea as deleteIdeaFromStore,
  getAllIdeas,
  getIdea,
  putIdea,
} from "@/storage/indexeddb/repositories/ideasRepository";
import { deleteLiveContextForIdea } from "@/storage/indexeddb/repositories/liveContextRepository";
import { parseRawText } from "./parseRawText";

function newId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

export async function captureInstantIdea(rawText: string): Promise<CapturedIdea> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Idea text cannot be empty");
  }
  const hints = parseRawText(trimmed);
  const timestamp = nowISO();
  const idea: CapturedIdea = {
    id: newId(),
    rawText: trimmed,
    detailsStatus: "needs_details",
    sport: null,
    league: null,
    slateDate: null,
    playerId: null,
    playerName: hints.playerName,
    team: null,
    opponent: null,
    eventId: null,
    marketKey: null,
    marketLabel: null,
    selection: null,
    lineAtCapture: null,
    oddsAtCaptureAmerican: null,
    sportsbookAtCapture: null,
    confidence: "unrated",
    note: hints.note ?? "",
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
  await putIdea(idea);
  return idea;
}

export type StructuredIdeaInput = {
  sport?: string | null;
  league?: string | null;
  slateDate?: string | null;
  playerId?: string | null;
  playerName?: string | null;
  team?: string | null;
  opponent?: string | null;
  eventId?: string | null;
  marketKey?: string | null;
  marketLabel?: string | null;
  selection?: string | null;
  lineAtCapture?: number | null;
  oddsAtCaptureAmerican?: number | null;
  sportsbookAtCapture?: string | null;
  confidence?: Confidence;
  note?: string;
};

export async function captureStructuredIdea(
  rawText: string,
  details: StructuredIdeaInput,
): Promise<CapturedIdea> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Idea text cannot be empty");
  }
  const timestamp = nowISO();
  const idea: CapturedIdea = {
    id: newId(),
    rawText: trimmed,
    detailsStatus: "structured",
    sport: details.sport ?? null,
    league: details.league ?? null,
    slateDate: details.slateDate ?? null,
    playerId: details.playerId ?? null,
    playerName: details.playerName ?? null,
    team: details.team ?? null,
    opponent: details.opponent ?? null,
    eventId: details.eventId ?? null,
    marketKey: details.marketKey ?? null,
    marketLabel: details.marketLabel ?? null,
    selection: details.selection ?? null,
    lineAtCapture: details.lineAtCapture ?? null,
    oddsAtCaptureAmerican: details.oddsAtCaptureAmerican ?? null,
    sportsbookAtCapture: details.sportsbookAtCapture ?? null,
    confidence: details.confidence ?? "unrated",
    note: details.note ?? "",
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
  await putIdea(idea);
  return idea;
}

function isStructuredEnough(idea: CapturedIdea): boolean {
  // "Structured" means the idea has at least a market and selection to act
  // on. createdAt is preserved by every writer in this module — never reset.
  return Boolean(idea.marketKey && idea.selection);
}

/**
 * The fields a cached live price depends on. league, eventId and marketKey are
 * what the odds request asks for; playerName, selection and lineAtCapture are
 * what matchOutcome uses to pick this leg's outcome; playerId is what the
 * player-status half of the same row was fetched for. Changing any of them
 * means the row describes a different proposition. Everything else (confidence,
 * note, team/opponent, marketLabel, and the capture odds/book, which the
 * resolver reads from the idea itself) never reaches the cache.
 */
const PRICE_IDENTITY_FIELDS = [
  "league",
  "eventId",
  "marketKey",
  "playerId",
  "playerName",
  "selection",
  "lineAtCapture",
] as const;

/** matchOutcome compares playerName and selection case-insensitively, so a case-only edit still prices the same outcome. */
function identityValue(idea: CapturedIdea, field: (typeof PRICE_IDENTITY_FIELDS)[number]): unknown {
  const value = idea[field];
  if ((field === "playerName" || field === "selection") && typeof value === "string") {
    return value.trim().toLowerCase();
  }
  return value;
}

/**
 * The one definition of "same proposition" for cached live prices. Exported so
 * the Phase 2 stale-response guard on refresh writes uses this, not a copy.
 */
export function changesPriceIdentity(before: CapturedIdea, after: CapturedIdea): boolean {
  return PRICE_IDENTITY_FIELDS.some((field) => identityValue(before, field) !== identityValue(after, field));
}

export async function updateIdeaDetails(
  id: string,
  patch: Partial<Omit<CapturedIdea, "id" | "rawText" | "createdAt">>,
): Promise<CapturedIdea> {
  const existing = await getIdea(id);
  if (!existing) {
    throw new Error(`Idea ${id} not found`);
  }
  const merged: CapturedIdea = {
    ...existing,
    ...patch,
    id: existing.id,
    rawText: existing.rawText,
    createdAt: existing.createdAt,
    updatedAt: nowISO(),
  };
  merged.detailsStatus = isStructuredEnough(merged) ? "structured" : "needs_details";
  // Cleared before the idea is saved: if the save then fails, all that's lost
  // is a disposable cache, never a stale price left on the edited idea.
  if (changesPriceIdentity(existing, merged)) await deleteLiveContextForIdea(id);
  await putIdea(merged);
  return merged;
}

export async function archiveIdea(id: string): Promise<void> {
  const existing = await getIdea(id);
  if (!existing) return;
  await putIdea({ ...existing, archivedAt: nowISO(), updatedAt: nowISO() });
}

export async function unarchiveIdea(id: string): Promise<void> {
  const existing = await getIdea(id);
  if (!existing) return;
  await putIdea({ ...existing, archivedAt: null, updatedAt: nowISO() });
}

export async function deleteIdeaPermanently(id: string): Promise<void> {
  await deleteIdeaFromStore(id);
}

export async function listIdeas(): Promise<CapturedIdea[]> {
  return getAllIdeas();
}

export { getIdea };
