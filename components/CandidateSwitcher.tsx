"use client";

import { useState } from "react";
import type { CandidateParlay } from "@/domain/types";
import { cloneCandidate, createCandidate, deleteCandidate } from "@/domain/candidates/candidateService";
import { useData } from "@/app/DataProvider";

export function CandidateSwitcher({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { candidates, refreshCandidates } = useData();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [sportsbook, setSportsbook] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !sportsbook.trim()) return;
    const candidate = await createCandidate(name, sportsbook);
    await refreshCandidates();
    onSelect(candidate.id);
    setCreating(false);
    setName("");
    setSportsbook("");
  }

  async function handleClone(candidate: CandidateParlay) {
    const clone = await cloneCandidate(candidate.id);
    await refreshCandidates();
    onSelect(clone.id);
  }

  async function handleDelete(candidate: CandidateParlay) {
    if (!window.confirm(`Delete candidate "${candidate.name}"? This cannot be undone.`)) return;
    await deleteCandidate(candidate.id);
    await refreshCandidates();
    if (activeId === candidate.id) {
      const remaining = candidates.filter((c) => c.id !== candidate.id);
      onSelect(remaining[0]?.id ?? "");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Candidate parlays" className="flex gap-2 overflow-x-auto pb-1">
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            role="tab"
            aria-selected={candidate.id === activeId}
            onClick={() => onSelect(candidate.id)}
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium"
            style={{
              borderColor: candidate.id === activeId ? "var(--accent)" : "var(--border)",
              background: candidate.id === activeId ? "var(--accent)" : "var(--surface)",
              color: candidate.id === activeId ? "var(--accent-foreground)" : "var(--foreground)",
            }}
          >
            {candidate.name} · {candidate.ideaIds.length}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="New candidate"
          className="flex min-h-[40px] shrink-0 items-center justify-center rounded-full border px-3 py-1.5 text-sm font-semibold"
          style={{ borderColor: "var(--border)" }}
        >
          +
        </button>
      </div>

      {activeId && (
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            className="underline"
            style={{ color: "var(--accent)" }}
            onClick={() => {
              const candidate = candidates.find((c) => c.id === activeId);
              if (candidate) handleClone(candidate);
            }}
          >
            Clone candidate
          </button>
          <button
            type="button"
            className="underline"
            style={{ color: "var(--danger-foreground)" }}
            onClick={() => {
              const candidate = candidates.find((c) => c.id === activeId);
              if (candidate) handleDelete(candidate);
            }}
          >
            Delete candidate
          </button>
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday Core"
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
            Sportsbook
            <input
              value={sportsbook}
              onChange={(e) => setSportsbook(e.target.value)}
              placeholder="FanDuel"
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
          </label>
          <button
            type="submit"
            className="min-h-[36px] rounded-md px-3 py-1.5 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
          >
            Create
          </button>
          <button type="button" onClick={() => setCreating(false)} className="min-h-[36px] rounded-md border px-3 py-1.5 text-sm">
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
