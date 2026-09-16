"use client";

import { useMemo, useState } from "react";
import { useData } from "@/app/DataProvider";
import { IdeaRow } from "@/components/IdeaRow";
import { CONFIDENCE_LEVELS } from "@/domain/types";

type CompletionFilter = "all" | "needs_details" | "structured";

export default function BucketPage() {
  const { ideas, loading } = useData();
  const [search, setSearch] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (!showArchived && idea.archivedAt) return false;
      if (showArchived && !idea.archivedAt) return false;
      if (confidenceFilter !== "all" && idea.confidence !== confidenceFilter) return false;
      if (completionFilter !== "all" && idea.detailsStatus !== completionFilter) return false;
      if (query) {
        const haystack = [
          idea.rawText,
          idea.playerName,
          idea.team,
          idea.opponent,
          idea.marketLabel,
          idea.slateDate,
          idea.sportsbookAtCapture,
          idea.note,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [ideas, search, confidenceFilter, completionFilter, showArchived]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Bucket</h1>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player, team, market, note…"
          aria-label="Search ideas"
          className="w-full rounded-md border px-3 py-2 text-sm sm:flex-1"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
        <select
          value={confidenceFilter}
          onChange={(e) => setConfidenceFilter(e.target.value)}
          aria-label="Filter by confidence"
          className="rounded-md border px-2 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <option value="all">All confidence</option>
          {CONFIDENCE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <select
          value={completionFilter}
          onChange={(e) => setCompletionFilter(e.target.value as CompletionFilter)}
          aria-label="Filter by completion state"
          className="rounded-md border px-2 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <option value="all">All ideas</option>
          <option value="needs_details">Needs details</option>
          <option value="structured">Structured</option>
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Archived
        </label>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No ideas match these filters.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} />
          ))}
        </ul>
      )}
    </div>
  );
}
