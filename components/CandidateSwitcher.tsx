"use client";

import { useRef, useState } from "react";
import type { CandidateParlay } from "@/domain/types";
import { cloneCandidate, createCandidate, deleteCandidate, renameCandidate } from "@/domain/candidates/candidateService";
import { isPlaced } from "@/domain/candidates/candidateState";
import { useData } from "@/app/DataProvider";
import { Button, TextInput } from "@/components/FormControls";
import { PlusIcon } from "@/components/icons";
import { SportsbookSupportHint } from "@/components/SportsbookSupportHint";

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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  function startRename(candidate: CandidateParlay) {
    setRenameValue(candidate.name);
    setRenamingId(candidate.id);
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!renamingId || !renameValue.trim()) return;
    await renameCandidate(renamingId, renameValue);
    await refreshCandidates();
    setRenamingId(null);
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
      const remaining = candidates.filter((c) => c.id !== candidate.id && !isPlaced(c));
      onSelect(remaining[0]?.id ?? "");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Candidate parlays" className="flex items-center gap-2 overflow-x-auto pb-1">
        {/* Placed slips are never the current slip (INV-7), so they aren't offered as one. */}
        {candidates.filter((c) => !isPlaced(c)).map((candidate) => (
          <button
            key={candidate.id}
            role="tab"
            aria-selected={candidate.id === activeId}
            onClick={() => onSelect(candidate.id)}
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold"
            style={{
              borderColor: candidate.id === activeId ? "var(--color-brand)" : "var(--color-border)",
              background: candidate.id === activeId ? "var(--color-brand)" : "var(--color-surface)",
              color: candidate.id === activeId ? "#ffffff" : "var(--color-ink)",
            }}
          >
            {candidate.name} · {candidate.ideaIds.length}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="New candidate"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: "var(--color-border)", color: "var(--color-action)" }}
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </div>

      {activeId && !renamingId && (
        <div
          ref={menuRef}
          className="relative self-start"
          onBlur={(e) => {
            if (!menuRef.current?.contains(e.relatedTarget as Node | null)) setMenuOpen(false);
          }}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Slip settings"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg"
            style={{ color: "var(--color-muted)" }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              className="absolute left-0 top-full z-20 mt-1 flex min-w-[140px] flex-col rounded-[var(--radius-control)] border py-1 shadow-md"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <button
                type="button"
                className="px-3 py-2 text-left text-sm font-medium"
                style={{ color: "var(--color-ink)" }}
                onClick={() => {
                  const candidate = candidates.find((c) => c.id === activeId);
                  if (candidate) startRename(candidate);
                  setMenuOpen(false);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="px-3 py-2 text-left text-sm font-medium"
                style={{ color: "var(--color-ink)" }}
                onClick={() => {
                  const candidate = candidates.find((c) => c.id === activeId);
                  if (candidate) handleClone(candidate);
                  setMenuOpen(false);
                }}
              >
                Clone
              </button>
              <button
                type="button"
                className="px-3 py-2 text-left text-sm font-medium"
                style={{ color: "var(--color-danger)" }}
                onClick={() => {
                  const candidate = candidates.find((c) => c.id === activeId);
                  if (candidate) handleDelete(candidate);
                  setMenuOpen(false);
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {renamingId && (
        <form onSubmit={handleRenameSubmit} className="flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border p-3" style={{ borderColor: "var(--color-border)" }}>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
            New name
            <TextInput value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          </label>
          <Button type="submit">Save name</Button>
          <Button type="button" variant="secondary" onClick={() => setRenamingId(null)}>
            Cancel
          </Button>
        </form>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border p-3" style={{ borderColor: "var(--color-border)" }}>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
            Name
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday Core" autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
            Sportsbook
            <TextInput value={sportsbook} onChange={(e) => setSportsbook(e.target.value)} placeholder="FanDuel" />
          </label>
          <Button type="submit">Create</Button>
          <div className="basis-full">
            <SportsbookSupportHint sportsbook={sportsbook} />
          </div>
          <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
