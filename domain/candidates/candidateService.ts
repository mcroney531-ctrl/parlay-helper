import type { CandidateParlay } from "@/domain/types";
import { DEFAULT_STAKE_CENTS } from "@/domain/types";
import {
  deleteCandidate as deleteCandidateFromStore,
  getAllCandidates,
  getCandidate,
  putCandidate,
} from "@/storage/indexeddb/repositories/candidatesRepository";

function newId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

export async function createCandidate(name: string, sportsbook: string): Promise<CandidateParlay> {
  const timestamp = nowISO();
  const candidate: CandidateParlay = {
    id: newId(),
    name: name.trim() || "Untitled candidate",
    sportsbook,
    ideaIds: [],
    stakeCents: DEFAULT_STAKE_CENTS,
    promoLabel: "",
    promoMaxStakeCents: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putCandidate(candidate);
  return candidate;
}

export async function cloneCandidate(id: string, newName?: string): Promise<CandidateParlay> {
  const source = await getCandidate(id);
  if (!source) {
    throw new Error(`Candidate ${id} not found`);
  }
  const timestamp = nowISO();
  const clone: CandidateParlay = {
    ...source,
    id: newId(),
    name: newName?.trim() || `${source.name} (copy)`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putCandidate(clone);
  return clone;
}

export async function renameCandidate(id: string, name: string): Promise<CandidateParlay> {
  const existing = await getCandidate(id);
  if (!existing) throw new Error(`Candidate ${id} not found`);
  const updated = { ...existing, name: name.trim() || existing.name, updatedAt: nowISO() };
  await putCandidate(updated);
  return updated;
}

export async function setCandidateSportsbook(id: string, sportsbook: string): Promise<CandidateParlay> {
  const existing = await getCandidate(id);
  if (!existing) throw new Error(`Candidate ${id} not found`);
  const updated = { ...existing, sportsbook, updatedAt: nowISO() };
  await putCandidate(updated);
  return updated;
}

export async function setCandidateStake(id: string, stakeCents: number): Promise<CandidateParlay> {
  const existing = await getCandidate(id);
  if (!existing) throw new Error(`Candidate ${id} not found`);
  const updated = { ...existing, stakeCents: Math.max(0, Math.round(stakeCents)), updatedAt: nowISO() };
  await putCandidate(updated);
  return updated;
}

export async function setCandidatePromo(
  id: string,
  promoLabel: string,
  promoMaxStakeCents: number | null,
): Promise<CandidateParlay> {
  const existing = await getCandidate(id);
  if (!existing) throw new Error(`Candidate ${id} not found`);
  const updated = { ...existing, promoLabel, promoMaxStakeCents, updatedAt: nowISO() };
  await putCandidate(updated);
  return updated;
}

export async function addLegToCandidate(candidateId: string, ideaId: string): Promise<CandidateParlay> {
  const existing = await getCandidate(candidateId);
  if (!existing) throw new Error(`Candidate ${candidateId} not found`);
  if (existing.ideaIds.includes(ideaId)) return existing;
  const updated = { ...existing, ideaIds: [...existing.ideaIds, ideaId], updatedAt: nowISO() };
  await putCandidate(updated);
  return updated;
}

export async function removeLegFromCandidate(candidateId: string, ideaId: string): Promise<CandidateParlay> {
  const existing = await getCandidate(candidateId);
  if (!existing) throw new Error(`Candidate ${candidateId} not found`);
  const updated = {
    ...existing,
    ideaIds: existing.ideaIds.filter((id) => id !== ideaId),
    updatedAt: nowISO(),
  };
  await putCandidate(updated);
  return updated;
}

export async function deleteCandidate(id: string): Promise<void> {
  await deleteCandidateFromStore(id);
}

export async function listCandidates(): Promise<CandidateParlay[]> {
  const all = await getAllCandidates();
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export { getCandidate };
