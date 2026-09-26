"use client";

import { useMemo, useState } from "react";
import type { CandidateParlay } from "@/domain/types";
import { useData } from "@/app/DataProvider";
import { addLegToCandidate } from "@/domain/candidates/candidateService";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { sleeperHeadshotUrl } from "@/components/sleeperImage";
import { Pill } from "@/components/StatusChip";
import { TextInput } from "@/components/FormControls";
import { CloseIcon, SearchIcon, CheckIcon } from "@/components/icons";

/**
 * Full-screen picker for adding existing ideas to a slip, opened directly
 * from an empty (or in-progress) Slip screen — so "no legs yet" never
 * dead-ends into "go find the Ideas tab yourself."
 */
export function AddIdeasSheet({ candidate, onClose }: { candidate: CandidateParlay; onClose: () => void }) {
  const { ideas, refreshCandidates } = useData();
  const [search, setSearch] = useState("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Once added, a row keeps showing (with its "Added" badge) instead of
  // vanishing the instant candidate.ideaIds updates — otherwise the
  // confirmation the click just earned disappears before it's ever seen.
  const eligible = useMemo(
    () => ideas.filter((idea) => !idea.archivedAt && (!candidate.ideaIds.includes(idea.id) || addedIds.has(idea.id))),
    [ideas, candidate.ideaIds, addedIds],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return eligible;
    return eligible.filter((idea) =>
      [idea.rawText, idea.playerName, idea.team, idea.marketLabel].filter(Boolean).join(" ").toLowerCase().includes(query),
    );
  }, [eligible, search]);

  async function handleAdd(ideaId: string) {
    await addLegToCandidate(candidate.id, ideaId);
    await refreshCandidates();
    setAddedIds((prev) => new Set(prev).add(ideaId));
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Add ideas to slip" className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--color-surface)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-border)", background: "var(--color-canvas)" }}>
        <h2 className="text-lg font-bold" style={{ color: "var(--color-ink)" }}>
          Add ideas to {candidate.name}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "var(--color-muted)" }}>
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-muted)" }} />
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ideas" aria-label="Search ideas" className="pl-9" autoFocus />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {eligible.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No ideas left to add — every captured idea is already in this slip. Capture a new one first.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No ideas match &ldquo;{search}&rdquo;.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((idea) => {
              const summary = [idea.playerName, idea.team, idea.marketLabel, idea.selection, idea.lineAtCapture]
                .filter((v) => v !== null && v !== undefined && v !== "")
                .join(" · ");
              const added = addedIds.has(idea.id);
              return (
                <li
                  key={idea.id}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border p-3"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                >
                  <PlayerAvatar name={idea.playerName} team={idea.team} imageUrl={sleeperHeadshotUrl(idea.playerId)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                      {idea.rawText}
                    </p>
                    {summary && (
                      <p className="truncate text-sm" style={{ color: "var(--color-muted)" }}>
                        {summary}
                      </p>
                    )}
                    {idea.detailsStatus === "needs_details" && <Pill tone="caution">Needs details</Pill>}
                  </div>
                  {added ? (
                    <Pill tone="success" icon={<CheckIcon className="h-3 w-3" />}>
                      Added
                    </Pill>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAdd(idea.id)}
                      className="shrink-0 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-semibold text-white"
                      style={{ background: "var(--color-action)" }}
                    >
                      Add
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className="border-t px-4 py-3"
        style={{ borderColor: "var(--color-border)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-semibold"
          style={{ background: "var(--color-action)", color: "#ffffff" }}
        >
          Done{addedIds.size > 0 ? ` — ${addedIds.size} added` : ""}
        </button>
      </div>
    </div>
  );
}
