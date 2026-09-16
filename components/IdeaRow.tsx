"use client";

import { useState } from "react";
import type { CapturedIdea } from "@/domain/types";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { StructuredDetailsForm, valuesFromIdea, valuesToPatch } from "@/components/StructuredDetailsForm";
import { archiveIdea, unarchiveIdea, updateIdeaDetails } from "@/domain/ideas/ideaService";
import { addLegToCandidate } from "@/domain/candidates/candidateService";
import { useData } from "@/app/DataProvider";

export function IdeaRow({ idea }: { idea: CapturedIdea }) {
  const { refreshIdeas, refreshCandidates, candidates } = useData();
  const [editing, setEditing] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
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

  return (
    <li
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)", opacity: idea.archivedAt ? 0.6 : 1 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{idea.rawText}</p>
          {summary && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {summary}
            </p>
          )}
          {idea.note && (
            <p className="text-xs italic" style={{ color: "var(--muted)" }}>
              {idea.note}
            </p>
          )}
        </div>
        <ConfidenceBadge confidence={idea.confidence} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {idea.detailsStatus === "needs_details" && (
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium"
            style={{ background: "var(--warn-bg)", color: "var(--warn-foreground)" }}
          >
            Needs details
          </span>
        )}
        {idea.archivedAt && (
          <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "var(--border)" }}>
            Archived
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-xs font-medium underline"
          style={{ color: "var(--accent)" }}
        >
          {editing ? "Close" : idea.detailsStatus === "needs_details" ? "Add details" : "Edit details"}
        </button>
        <button type="button" onClick={handleArchiveToggle} className="text-xs font-medium underline" style={{ color: "var(--muted)" }}>
          {idea.archivedAt ? "Unarchive" : "Archive"}
        </button>

        {!idea.archivedAt && candidates.length > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="rounded-md border px-1.5 py-1 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              aria-label={`Add "${idea.rawText}" to candidate`}
            >
              <option value="">Add to…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddToCandidate}
              disabled={!selectedCandidateId}
              className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              Add
            </button>
          </span>
        )}
      </div>
      {addedMessage && (
        <p aria-live="polite" className="mt-1 text-xs" style={{ color: "var(--like)" }}>
          {addedMessage}
        </p>
      )}

      {editing && (
        <StructuredDetailsForm initial={valuesFromIdea(idea)} onSave={handleSave} onCancel={() => setEditing(false)} />
      )}
    </li>
  );
}
