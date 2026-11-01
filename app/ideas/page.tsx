"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppNavigate } from "@/components/appNavigation";
import { useData } from "@/app/DataProvider";
import { IdeaCard } from "@/components/IdeaCard";
import { PageShell } from "@/components/PageShell";
import { CurrentSlipTray } from "@/components/CurrentSlipTray";
import { QuickAddForm } from "@/components/QuickAddForm";
import { StaleAddNote, type StaleAdd } from "@/components/StaleAddNote";
import { BucketIcon, SearchIcon } from "@/components/icons";
import { Button, Select, TextInput } from "@/components/FormControls";
import { CONFIDENCE_LEVELS, type CandidateParlay } from "@/domain/types";
import { isPlaced } from "@/domain/candidates/candidateState";
import { ideaUsage } from "@/domain/ideas/ideaUsage";
import { filterIdeas, type IdeaFilter } from "@/domain/ideas/ideaFilter";

/**
 * Ideas: capture and the idea list on one screen (chunk 3 decision (a)). The
 * quick-add input is at the top and focused, so opening the app is ready to
 * type; the list below it is every idea.
 *
 * ADD MODE (/ideas?add=<slipId>, opened from the Slip screen's Add ideas):
 * the same list, with each card adding to that slip and a bar to return to
 * it. If that slip has since been placed or deleted, one line says so and the
 * query is dropped, rather than the cards quietly adding to whatever slip is
 * current (B's 3c review, R1).
 *
 * Only a tiny reader sits under Suspense (useSearchParams needs one for the
 * page to prerender): the screen itself, quick-add box included, is
 * hydrated rather than remounted, so text typed before hydration is kept.
 */
export default function IdeasPage() {
  const [addSlipId, setAddSlipId] = useState<string | null>(null);
  return (
    <>
      <Suspense fallback={null}>
        <AddQueryReader onRead={setAddSlipId} />
      </Suspense>
      <IdeasScreen addSlipId={addSlipId} />
    </>
  );
}

function AddQueryReader({ onRead }: { onRead: (addSlipId: string | null) => void }) {
  const addSlipId = useSearchParams().get("add");
  useEffect(() => onRead(addSlipId), [addSlipId, onRead]);
  return null;
}

/**
 * Whether the quick-add box takes focus when the screen opens: from the URL,
 * not from loaded data, so add mode never focuses it while the slips are
 * still loading. Read when the box mounts, after the URL has changed.
 */
function openedOutsideAddMode(): boolean {
  return !new URLSearchParams(window.location.search).has("add");
}


function IdeasScreen({ addSlipId }: { addSlipId: string | null }) {
  const { ideas, candidates, finalized, activeCandidate, loading } = useData();
  const [staleAdd, setStaleAdd] = useState<StaleAdd | null>(null);
  const [filter, setFilter] = useState<IdeaFilter>({
    search: "",
    confidence: "all",
    completion: "all",
    showArchived: false,
    hidePlaced: false,
  });
  const set = <K extends keyof IdeaFilter>(key: K, value: IdeaFilter[K]) => setFilter((f) => ({ ...f, [key]: value }));

  // Add mode only for a draft that still exists; otherwise plain Ideas.
  const addSlip = addSlipId ? (candidates.find((c) => c.id === addSlipId && !isPlaced(c)) ?? null) : null;
  const targetSlip = addSlip ?? activeCandidate;

  // A ?add= for a slip that's been placed or deleted: say so once, and drop
  // the query (history.replaceState: no navigation, no server request).
  const staleAddFor = !loading && addSlipId && !addSlip ? addSlipId : null;
  if (staleAddFor && staleAdd?.slipId !== staleAddFor) {
    const slip = candidates.find((c) => c.id === staleAddFor);
    setStaleAdd({ slipId: staleAddFor, placedName: slip ? slip.name : null });
  }
  useEffect(() => {
    if (staleAddFor) window.history.replaceState(null, "", "/ideas");
  }, [staleAddFor]);

  const usage = useMemo(() => ideaUsage(candidates, finalized), [candidates, finalized]);
  const activeIdeas = useMemo(() => ideas.filter((idea) => !idea.archivedAt), [ideas]);
  const needsDetailsCount = activeIdeas.filter((idea) => idea.detailsStatus === "needs_details").length;
  const filtersActive = filter.confidence !== "all" || filter.completion !== "all";
  const filtered = useMemo(() => filterIdeas(ideas, filter, usage), [ideas, filter, usage]);

  return (
    <PageShell title="IDEAS" icon={<BucketIcon className="h-8 w-8" />}>
      <div className="flex flex-col gap-4">
        {addSlip ? <AddModeBar slip={addSlip} /> : null}
        {staleAdd && !addSlip && <StaleAddNote stale={staleAdd} current={activeCandidate} />}

        <section>
          <QuickAddForm focusOnOpen={openedOutsideAddMode} />
        </section>

        {!addSlip && <CurrentSlipTray />}

        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--color-muted)" }}
          />
          <TextInput
            type="search"
            value={filter.search}
            onChange={(e) => set("search", e.target.value)}
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
            <Select value={filter.confidence} onChange={(e) => set("confidence", e.target.value)} aria-label="Filter by confidence" className="w-auto">
              <option value="all">All confidence</option>
              {CONFIDENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </Select>
            <Select
              value={filter.completion}
              onChange={(e) => set("completion", e.target.value as IdeaFilter["completion"])}
              aria-label="Filter by completion state"
              className="w-auto"
            >
              <option value="all">All ideas</option>
              <option value="needs_details">Needs details</option>
              <option value="structured">Structured</option>
            </Select>
          </div>
        </details>

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <p style={{ color: "var(--color-muted)" }}>
            {filter.showArchived ? (
              "Archived ideas"
            ) : (
              <>
                {activeIdeas.length} active · {needsDetailsCount} need details
              </>
            )}
          </p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--color-muted)" }}>
              <input type="checkbox" checked={filter.hidePlaced} onChange={(e) => set("hidePlaced", e.target.checked)} />
              Hide placed
            </label>
            <button
              type="button"
              onClick={() => set("showArchived", !filter.showArchived)}
              className="font-semibold"
              style={{ color: "var(--color-action)" }}
            >
              {filter.showArchived ? "← Back to active" : "View archived →"}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Loading…
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {filter.showArchived ? "No archived ideas." : ideas.length === 0 ? "No ideas yet." : "No ideas match these filters."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} usage={usage} targetSlip={targetSlip} />
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

/** Add mode's bar: which slip the cards add to, and the way back to it. */
function AddModeBar({ slip }: { slip: CandidateParlay }) {
  const navigate = useAppNavigate();
  const { setActiveCandidateId } = useData();
  const legs = slip.ideaIds.length;
  return (
    <div
      role="status"
      className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-4 py-3 text-sm font-semibold"
      style={{ background: "var(--color-brand)", color: "#ffffff" }}
    >
      <span className="truncate">
        Adding to {slip.name} · {legs} leg{legs === 1 ? "" : "s"}
      </span>
      <Button
        variant="secondary"
        className="!min-h-[32px] shrink-0 px-3 py-1 text-sm"
        onClick={() => {
          setActiveCandidateId(slip.id);
          navigate("/slip");
        }}
      >
        Done
      </Button>
    </div>
  );
}
