"use client";

import { useState } from "react";
import type { CapturedIdea } from "@/domain/types";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { sleeperHeadshotUrl } from "@/components/sleeperImage";
import { Pill } from "@/components/StatusChip";
import { Button, Select } from "@/components/FormControls";
import { CheckIcon } from "@/components/icons";
import { StructuredDetailsForm, valuesFromIdea, valuesToPatch } from "@/components/StructuredDetailsForm";
import { archiveIdea, unarchiveIdea, updateIdeaDetails } from "@/domain/ideas/ideaService";
import { addLegToCandidate } from "@/domain/candidates/candidateService";
import { useData } from "@/app/DataProvider";
import type { CandidateParlay } from "@/domain/types";

/**
 * Shared idea card used by both Capture ("Recently Captured", compact) and
 * Bucket (full — search/filter/archive/add-to-candidate). Keeping one
 * component means the two screens can never silently drift apart on the
 * same underlying record.
 */
export function IdeaCard({ idea, variant }: { idea: CapturedIdea; variant: "compact" | "full" }) {
  const { refreshIdeas, refreshCandidates, candidates } = useData();
  const [editing, setEditing] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(() => candidates.at(-1)?.id ?? "");
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  async function handleSave(values: ReturnType<typeof valuesFromIdea>) {
    await updateIdeaDetails(idea.id, valuesToPatch(values));
    await refreshIdeas();
    setEditing(false);
  }

  async function handleArchiveToggle() {
    if (idea.archivedAt) await unarchiveIdea(idea.id);
    else await archiveIdea(idea.id);
    await refreshIdeas();
  }

  async function handleAddToCandidate() {
    if (!selectedCandidateId) return;
    await addLegToCandidate(selectedCandidateId, idea.id);
    await refreshCandidates();
    const candidate = candidates.find((c) => c.id === selectedCandidateId);
    setAddedMessage(`Added to ${candidate?.name ?? "candidate"}.`);
    window.setTimeout(() => setAddedMessage(null), 2000);
  }

  const summary = [idea.playerName, idea.team, idea.marketLabel, idea.selection, idea.lineAtCapture]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" · ");

  const selectedCandidate: CandidateParlay | undefined = candidates.find((c) => c.id === selectedCandidateId);
  const alreadyAdded = Boolean(selectedCandidate?.ideaIds.includes(idea.id));

  return (
    <li>
      <div
        className="rounded-[var(--radius-card)] border-l-[3px] border-y border-r p-3"
        style={{
          borderColor: "var(--color-border)",
          borderLeftColor: idea.detailsStatus === "needs_details" ? "var(--color-action)" : "var(--color-border)",
          background: "var(--color-surface)",
          opacity: idea.archivedAt ? 0.6 : 1,
        }}
      >
        <div className="flex items-start gap-3">
          <PlayerAvatar name={idea.playerName} team={idea.team} imageUrl={sleeperHeadshotUrl(idea.playerId)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {idea.rawText}
            </p>
            {summary && (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                {summary}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {idea.detailsStatus === "needs_details" ? (
                <Pill tone="caution">Needs details</Pill>
              ) : (
                <ConfidenceBadge confidence={idea.confidence} />
              )}
              {idea.archivedAt && <Pill tone="neutral">Archived</Pill>}
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {new Date(idea.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {variant === "full" && idea.detailsStatus === "needs_details" ? ` · ${idea.confidence === "unrated" ? "Unrated" : idea.confidence}` : ""}
              </span>
            </div>
            {variant === "full" && idea.note && (
              <p className="mt-1 text-xs italic" style={{ color: "var(--color-muted)" }}>
                {idea.note}
              </p>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
          <Button variant="text" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : idea.detailsStatus === "needs_details" ? "Add details" : "Edit details"}
          </Button>
          {variant === "full" && (
            <Button variant="text" onClick={handleArchiveToggle} style={{ color: "var(--color-muted)" }}>
              {idea.archivedAt ? "Unarchive" : "Archive"}
            </Button>
          )}

          {variant === "full" && !idea.archivedAt && candidates.length > 0 && (
            <span className="ml-auto flex items-center gap-2">
              <Select
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                className="w-auto py-1.5 text-xs"
                aria-label={`Candidate for "${idea.rawText}"`}
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {alreadyAdded ? (
                <Pill tone="success" icon={<CheckIcon className="h-3 w-3" />}>
                  Added
                </Pill>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCandidate}
                  aria-label={`Add "${idea.rawText}" to ${selectedCandidate?.name ?? "candidate"}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ background: "var(--color-action)" }}
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    +
                  </span>
                </button>
              )}
            </span>
          )}
        </div>

        {addedMessage && (
          <p aria-live="polite" className="mt-1 text-xs font-medium" style={{ color: "var(--color-action)" }}>
            {addedMessage}
          </p>
        )}

        {editing && (
          <StructuredDetailsForm initial={valuesFromIdea(idea)} onSave={handleSave} onCancel={() => setEditing(false)} />
        )}
      </div>
    </li>
  );
}
