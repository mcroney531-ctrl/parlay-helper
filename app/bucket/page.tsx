"use client";

import { useMemo, useState } from "react";
import { useData } from "@/app/DataProvider";
import { IdeaCard } from "@/components/IdeaCard";
import { PageShell } from "@/components/PageShell";
import { CurrentSlipTray } from "@/components/CurrentSlipTray";
import { BucketIcon, SearchIcon } from "@/components/icons";
import { Select, TextInput } from "@/components/FormControls";
import { CONFIDENCE_LEVELS } from "@/domain/types";

type CompletionFilter = "all" | "needs_details" | "structured";

export default function BucketPage() {
  const { ideas, loading } = useData();
  const [search, setSearch] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const activeIdeas = useMemo(() => ideas.filter((idea) => !idea.archivedAt), [ideas]);
  const activeCount = activeIdeas.length;
  const needsDetailsCount = activeIdeas.filter((idea) => idea.detailsStatus === "needs_details").length;
  const filtersActive = confidenceFilter !== "all" || completionFilter !== "all";

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
    <PageShell title="IDEAS" icon={<BucketIcon className="h-8 w-8" />}>
      <div className="flex flex-col gap-4">
        <CurrentSlipTray />

        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--color-muted)" }}
          />
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player, team, market, note"
            aria-label="Search ideas"
            className="pl-9"
          />
        </div>

        <details className="rounded-[var(--radius-control)] border" style={{ borderColor: "var(--color-border)" }}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold" style={{ color: filtersActive ? "var(--color-action)" : "var(--color-muted)" }}>
            Filters{filtersActive ? " (active)" : ""}
          </summary>
          <div className="flex flex-col gap-2 border-t p-3 sm:flex-row" style={{ borderColor: "var(--color-border)" }}>
            <Select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)} aria-label="Filter by confidence" className="w-auto">
              <option value="all">All confidence</option>
              {CONFIDENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </Select>
            <Select value={completionFilter} onChange={(e) => setCompletionFilter(e.target.value as CompletionFilter)} aria-label="Filter by completion state" className="w-auto">
              <option value="all">All ideas</option>
              <option value="needs_details">Needs details</option>
              <option value="structured">Structured</option>
            </Select>
          </div>
        </details>

        <div className="flex items-baseline justify-between text-sm">
          <p style={{ color: "var(--color-muted)" }}>
            {showArchived ? (
              "Archived ideas"
            ) : (
              <>
                {activeCount} active · {needsDetailsCount} need details
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="font-semibold"
            style={{ color: "var(--color-action)" }}
          >
            {showArchived ? "← Back to active" : "View archived →"}
          </button>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Loading…
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {showArchived ? "No archived ideas." : "No ideas match these filters."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} variant="full" />
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
