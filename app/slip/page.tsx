"use client";

import { useState } from "react";
import { useData } from "@/app/DataProvider";
import { CandidateSwitcher } from "@/components/CandidateSwitcher";
import { BuilderTray } from "@/components/BuilderTray";
import { PropLegCard } from "@/components/PropLegCard";
import { EstimatePanel } from "@/components/EstimatePanel";
import { RuleBanners } from "@/components/RuleBanners";
import { PromoAndStakePanel } from "@/components/PromoAndStakePanel";
import { FinalizeSection } from "@/components/FinalizeSection";
import { AddIdeasSheet } from "@/components/AddIdeasSheet";
import { PageShell } from "@/components/PageShell";
import { BuildIcon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/FormControls";
import { NoCurrentSlip } from "@/components/NoCurrentSlip";
import { DeletedLegCard } from "@/components/DeletedLegCard";
import { calculatePayoutCents, calculateSlipEstimate, unpricedLegIds } from "@/domain/odds/estimate";
import { SportsbookSupportHint } from "@/components/SportsbookSupportHint";
import { detectSlipSignals } from "@/domain/rules/slipSignals";
import { removeLegFromCandidate } from "@/domain/candidates/candidateService";
import { candidateRevision } from "@/domain/candidates/candidateState";
import { ideaLookup, presentIdeas, resolveSlipLegs } from "@/domain/candidates/slipLegs";
import { describeRefreshNotice, describeRefreshProblem, refreshCandidateContext } from "@/domain/odds/refreshService";
import { liveContextKey } from "@/storage/indexeddb/repositories/liveContextRepository";

export default function BuilderPage() {
  const {
    candidates,
    ideas,
    liveContextByKey,
    loading,
    refreshCandidates,
    refreshLiveContext,
    activeCandidateId,
    setActiveCandidateId,
  } = useData();
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [addingIdeas, setAddingIdeas] = useState(false);

  const candidate = candidates.find((c) => c.id === activeCandidateId) ?? null;
  const sportsbook = candidate?.sportsbook ?? "";
  function liveContextFor(ideaId: string) {
    return liveContextByKey[liveContextKey(ideaId, sportsbook)];
  }

  // Every stored leg, in order. A leg whose idea was deleted stays on the slip
  // as a deleted leg the user can remove; it is never silently dropped.
  const legs = candidate ? resolveSlipLegs(candidate.ideaIds, ideaLookup(ideas)) : [];
  const present = presentIdeas(legs);

  const estimate = calculateSlipEstimate(legs, sportsbook, liveContextFor);
  const unpriced = unpricedLegIds(estimate);
  const resolvedPrice = new Map(estimate.legSources.map((leg) => [leg.ideaId, leg]));

  const payoutCents =
    estimate.ok && candidate ? calculatePayoutCents(candidate.stakeCents, estimate.decimalOdds) : null;

  const signals = detectSlipSignals(legs, (ideaId) => liveContextFor(ideaId)?.scheduledStart ?? null);

  async function handleRemoveLeg(ideaId: string) {
    if (!candidate) return;
    await removeLegFromCandidate(candidate.id, ideaId);
    await refreshCandidates();
  }

  async function handleRefresh() {
    if (!candidate || refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    setRefreshNotice(null);
    try {
      const result = await refreshCandidateContext(candidate, ideas);
      await refreshLiveContext();
      setRefreshError(describeRefreshProblem(result));
      setRefreshNotice(describeRefreshNotice(result));
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Could not refresh odds/status.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <PageShell title="SLIP" icon={<BuildIcon className="h-8 w-8" />}>
      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Loading…
        </p>
      ) : !candidate ? (
        <NoCurrentSlip />
      ) : (
        <div
          className="flex flex-col gap-4"
          style={legs.length > 0 ? { paddingBottom: "calc(var(--bottom-nav-height) + 56px)" } : undefined}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CandidateSwitcher activeId={activeCandidateId} onSelect={setActiveCandidateId} />
            <div className="flex flex-col items-end gap-1.5 text-sm">
              <span style={{ color: "var(--color-muted)" }}>
                Sportsbook: <strong style={{ color: "var(--color-ink)" }}>{candidate.sportsbook}</strong>
              </span>
              <SportsbookSupportHint sportsbook={candidate.sportsbook} />
              <Button
                variant="secondary"
                onClick={handleRefresh}
                disabled={refreshing || legs.length === 0}
                className="!min-h-[36px] px-3 py-1 text-xs"
              >
                {refreshing ? "Refreshing…" : "Refresh odds & status"}
              </Button>
            </div>
          </div>

          {refreshError && (
            <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
              {refreshError}
            </p>
          )}
          {/* Always mounted so screen readers announce the note politely when it appears. */}
          <p role="status" className="text-xs empty:hidden" style={{ color: "var(--color-muted)" }}>
            {refreshNotice}
          </p>

          {legs.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border px-4 py-10 text-center" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
                No legs yet
              </p>
              <p className="max-w-xs text-sm" style={{ color: "var(--color-muted)" }}>
                Add a few ideas to see the estimated odds, correlation, and concentration context for this slip.
              </p>
              <Button onClick={() => setAddingIdeas(true)} className="flex items-center gap-1.5">
                <PlusIcon className="h-4 w-4" />
                Add ideas
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="flex items-center gap-1 text-sm font-semibold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {legs.length} leg{legs.length === 1 ? "" : "s"}
                  <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                </button>
                <Button variant="text" onClick={() => setAddingIdeas(true)} className="flex items-center gap-1 text-sm">
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add ideas
                </Button>
              </div>

              <BuilderTray
                legCount={legs.length}
                estimatedOddsAmerican={estimate.ok ? estimate.americanOdds : null}
                estimatedPayoutCents={payoutCents}
                unpricedLegCount={unpriced.length}
                deletedLegCount={estimate.missingLegIds.length}
                expanded={expanded}
                onToggle={() => setExpanded((v) => !v)}
              />

              {expanded && (
                <div className="flex flex-col gap-4">
                  <ul className="flex flex-col gap-2.5">
                    {legs.map((leg) =>
                      leg.kind === "present" ? (
                        <PropLegCard
                          key={leg.ideaId}
                          idea={leg.idea}
                          liveContext={liveContextFor(leg.ideaId)}
                          slipSportsbook={sportsbook}
                          resolvedPrice={resolvedPrice.get(leg.ideaId)}
                          onRemove={() => handleRemoveLeg(leg.ideaId)}
                        />
                      ) : (
                        <DeletedLegCard key={leg.ideaId} onRemove={() => handleRemoveLeg(leg.ideaId)} />
                      ),
                    )}
                  </ul>

                  <RuleBanners
                    correlationSignals={signals.correlation}
                    concentrationSignals={signals.concentration}
                    legs={present}
                    deletedLegCount={signals.deletedLegCount}
                  />

                  <EstimatePanel
                    estimate={estimate}
                    sportsbook={candidate.sportsbook}
                    stakeCents={candidate.stakeCents}
                    payoutCents={payoutCents}
                    isSameGame={signals.sameGame}
                  />

                  <PromoAndStakePanel candidate={candidate} />

                  {/* Keyed by slip, so the optional confirmation fields never carry over from one slip to another. */}
                  <FinalizeSection
                    key={candidate.id}
                    candidateId={candidate.id}
                    slipName={candidate.name}
                    seenRevision={candidateRevision(candidate)}
                    legCount={legs.length}
                    unpricedLegIds={unpriced}
                    deletedLegCount={estimate.missingLegIds.length}
                    otherBookCaptureCount={
                      estimate.legSources.filter((leg) => leg.source === "capture" && leg.captureBook?.match !== "same").length
                    }
                  />
                </div>
              )}
            </>
          )}

          {addingIdeas && <AddIdeasSheet candidate={candidate} onClose={() => setAddingIdeas(false)} />}
        </div>
      )}
    </PageShell>
  );
}
