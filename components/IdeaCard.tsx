"use client";

import { useState } from "react";
import Link from "next/link";
import type { CapturedIdea } from "@/domain/types";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { sleeperHeadshotUrl } from "@/components/sleeperImage";
import { Pill } from "@/components/StatusChip";
import { Button, Select } from "@/components/FormControls";
import { CheckIcon } from "@/components/icons";
import { IdeaDetailsSheet } from "@/components/IdeaDetailsSheet";
import { valuesToPatch, type StructuredFormValues } from "@/components/StructuredDetailsForm";
import { archiveIdea, unarchiveIdea, updateIdeaDetails } from "@/domain/ideas/ideaService";
import { addLegToCandidate } from "@/domain/candidates/candidateService";
import { useData } from "@/app/DataProvider";

/**
 * Shared idea card used by both Capture ("Recently Captured", compact) and
 * Bucket/Ideas (full — search/filter/archive/add-to-slip). The primary
 * action always matches the idea's actual state relative to the current
 * slip, instead of exposing a candidate-picker on every card.
 */
export function IdeaCard({ idea, variant }: { idea: CapturedIdea; variant: "compact" | "full" }) {
  const { refreshIdeas, refreshCandidates, candidates, activeCandidate, activeCandidateId } = useData();
  const [editing, setEditing] = useState(false);
  const [addingToOther, setAddingToOther] = useState(false);
  const [otherCandidateId, setOtherCandidateId] = useState("");
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  const inCurrentSlip = Boolean(activeCandidate?.ideaIds.includes(idea.id));
  const otherCandidates = candidates.filter((c) => c.id !== activeCandidateId);

  async function saveDetails(values: StructuredFormValues) {
    await updateIdeaDetails(idea.id, valuesToPatch(values));
    await refreshIdeas();
    setEditing(false);
  }

  async function saveDetailsAndAddToSlip(values: StructuredFormValues) {
    await updateIdeaDetails(idea.id, valuesToPatch(values));
    await refreshIdeas();
    if (activeCandidateId) await addLegToCandidate(activeCandidateId, idea.id);
    await refreshCandidates();
    setEditing(false);
  }

  async function handleArchiveToggle() {
    if (idea.archivedAt) await unarchiveIdea(idea.id);
    else await archiveIdea(idea.id);
    await refreshIdeas();
  }

  async function handleAddToCurrentSlip() {
    if (!activeCandidateId) return;
    await addLegToCandidate(activeCandidateId, idea.id);
    await refreshCandidates();
  }

  async function handleAddToOther() {
    if (!otherCandidateId) return;
    await addLegToCandidate(otherCandidateId, idea.id);
    await refreshCandidates();
    const candidate = candidates.find((c) => c.id === otherCandidateId);
    setAddedMessage(`Added to ${candidate?.name ?? "slip"}.`);
    setAddingToOther(false);
    window.setTimeout(() => setAddedMessage(null), 2000);
  }

  const summary = [idea.playerName, idea.team, idea.marketLabel, idea.selection, idea.lineAtCapture]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" · ");

  return (
    <li>
      <div
        className="rounded-[var(--radius-card)] border-l-[3px] border-y border-r p-3"
        style={{
          borderColor: "var(--color-border)",
          borderLeftColor: idea.detailsStatus === "needs_details" ? "var(--color-caution-fg)" : "var(--color-border)",
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
              </span>
            </div>
            {variant === "full" && idea.note && (
              <p className="mt-1 text-xs italic" style={{ color: "var(--color-muted)" }}>
                {idea.note}
              </p>
            )}
          </div>
        </div>

        {!idea.archivedAt && (
          <div className="mt-2.5 flex items-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-border)" }}>
            {idea.detailsStatus === "needs_details" ? (
              <Button onClick={() => setEditing(true)} className="!min-h-[36px] flex-1 px-3 py-1.5 text-sm">
                Complete details
              </Button>
            ) : inCurrentSlip ? (
              <>
                <Pill tone="success" icon={<CheckIcon className="h-3 w-3" />}>
                  Added
                </Pill>
                <Link href="/builder" className="text-sm font-semibold" style={{ color: "var(--color-action)" }}>
                  View slip →
                </Link>
              </>
            ) : activeCandidateId ? (
              <Button onClick={handleAddToCurrentSlip} className="!min-h-[36px] flex-1 px-3 py-1.5 text-sm">
                Add to slip
              </Button>
            ) : (
              <Link
                href="/builder"
                className="flex-1 rounded-[var(--radius-control)] px-3 py-1.5 text-center text-sm font-semibold text-white"
                style={{ background: "var(--color-action)" }}
              >
                Start a slip
              </Link>
            )}
          </div>
        )}

        {addedMessage && (
          <p aria-live="polite" className="mt-1 text-xs font-medium" style={{ color: "var(--color-action)" }}>
            {addedMessage}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
          {idea.detailsStatus !== "needs_details" && (
            <Button variant="text" onClick={() => setEditing(true)} className="text-xs">
              Edit details
            </Button>
          )}
          {variant === "full" && (
            <Button variant="text" onClick={handleArchiveToggle} className="text-xs" style={{ color: "var(--color-muted)" }}>
              {idea.archivedAt ? "Unarchive" : "Archive"}
            </Button>
          )}
          {variant === "full" && !idea.archivedAt && idea.detailsStatus !== "needs_details" && otherCandidates.length > 0 && (
            <Button variant="text" onClick={() => setAddingToOther((v) => !v)} className="text-xs" style={{ color: "var(--color-muted)" }}>
              Add to another slip
            </Button>
          )}
        </div>

        {addingToOther && (
          <div className="mt-2 flex items-center gap-2">
            <Select value={otherCandidateId} onChange={(e) => setOtherCandidateId(e.target.value)} className="w-auto py-1.5 text-xs" aria-label="Choose a slip">
              <option value="">Choose a slip…</option>
              {otherCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button onClick={handleAddToOther} disabled={!otherCandidateId} className="!min-h-[32px] px-2.5 py-1 text-xs">
              Add
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <IdeaDetailsSheet
          idea={idea}
          onClose={() => setEditing(false)}
          onSave={saveDetails}
          slipName={activeCandidate?.name}
          offerAddToSlip={!inCurrentSlip && Boolean(activeCandidateId)}
          onSaveAndAddToSlip={saveDetailsAndAddToSlip}
        />
      )}
    </li>
  );
}
