import type { CapturedIdea, Confidence } from "@/domain/types";
import {
  deleteIdea as deleteIdeaFromStore,
  getAllIdeas,
  getIdea,
  putIdea,
} from "@/storage/indexeddb/repositories/ideasRepository";
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
