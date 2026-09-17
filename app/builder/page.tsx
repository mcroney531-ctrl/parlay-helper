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
import { PageShell } from "@/components/PageShell";
import { BuildIcon } from "@/components/icons";
import { Button } from "@/components/FormControls";
import { calculateCombinedEstimate, calculatePayoutCents, hasSameGameCombination } from "@/domain/odds/estimate";
import { detectCorrelationSignals } from "@/domain/rules/correlation";
import { detectConcentrationSignals } from "@/domain/rules/concentration";
import { removeLegFromCandidate } from "@/domain/candidates/candidateService";
import { refreshCandidateContext } from "@/domain/odds/refreshService";
import { liveContextKey } from "@/storage/indexeddb/repositories/liveContextRepository";

function kickoffWindowFor(scheduledStart: string | null): string | null {
  if (!scheduledStart) return null;
  const date = new Date(scheduledStart);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 13); // hour-granularity bucket
}

export default function BuilderPage() {
  const { candidates, ideas, liveContextByKey, loading, refreshCandidates, refreshLiveContext } = useData();
  const [activeId, setActiveId] = useState<string>("");
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const effectiveActiveId = candidates.some((c) => c.id === activeId) ? activeId : candidates[0]?.id ?? "";
  const candidate = candidates.find((c) => c.id === effectiveActiveId) ?? null;
  const sportsbook = candidate?.sportsbook ?? "";
  function liveContextFor(ideaId: string) {
    return liveContextByKey[liveContextKey(ideaId, sportsbook)];
  }

  const legs = candidate
    ? candidate.ideaIds.map((id) => ideas.find((idea) => idea.id === id)).filter((v) => v !== undefined)
    : [];

  const estimate = calculateCombinedEstimate(
    legs.map((leg) => ({
      ideaId: leg.id,
      eventId: leg.eventId,
      currentOddsAmerican: liveContextFor(leg.id)?.currentOddsAmerican ?? null,
      captureOddsAmerican: leg.oddsAtCaptureAmerican,
    })),
  );

  const payoutCents =
    estimate.ok && candidate ? calculatePayoutCents(candidate.stakeCents, estimate.decimalOdds) : null;

  const isSameGame = hasSameGameCombination(legs.map((leg) => ({ eventId: leg.eventId })));

  const correlationSignals = detectCorrelationSignals(
    legs.map((leg) => ({ ideaId: leg.id, eventId: leg.eventId })),
  );

  const concentrationSignals = detectConcentrationSignals(
    legs.map((leg) => ({
      ideaId: leg.id,
      eventId: leg.eventId,
      team: leg.team,
      kickoffWindow: kickoffWindowFor(liveContextFor(leg.id)?.scheduledStart ?? null),
    })),
  );

  async function handleRemoveLeg(ideaId: string) {
    if (!candidate) return;
    await removeLegFromCandidate(candidate.id, ideaId);
    await refreshCandidates();
  }

  async function handleRefresh() {
    if (!candidate || refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshCandidateContext(candidate, ideas);
      await refreshLiveContext();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Could not refresh odds/status.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <PageShell title="BUILD" icon={<BuildIcon className="h-8 w-8" />}>
      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Loading…
        </p>
      ) : (
        <div
          className="flex flex-col gap-4"
          style={legs.length > 0 ? { paddingBottom: "calc(var(--bottom-nav-height) + 56px)" } : undefined}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CandidateSwitcher activeId={effectiveActiveId} onSelect={setActiveId} />
            {candidate && (
              <div className="flex flex-col items-end gap-1.5 text-sm">
                <span style={{ color: "var(--color-muted)" }}>
                  Sportsbook: <strong style={{ color: "var(--color-ink)" }}>{candidate.sportsbook}</strong>
                </span>
                <Button
                  variant="secondary"
                  onClick={handleRefresh}
                  disabled={refreshing || legs.length === 0}
                  className="!min-h-[36px] px-3 py-1 text-xs"
                >
                  {refreshing ? "Refreshing…" : "Refresh odds & status"}
                </Button>
              </div>
            )}
          </div>

          {!candidate ? (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Create a candidate to start building a slip.
            </p>
          ) : (
            <>
              {refreshError && (
                <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
                  {refreshError}
                </p>
              )}

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

              {legs.length > 0 && (
                <BuilderTray
                  legCount={legs.length}
                  estimatedOddsAmerican={estimate.ok ? estimate.americanOdds : null}
                  estimatedPayoutCents={payoutCents}
                  expanded={expanded}
                  onToggle={() => setExpanded((v) => !v)}
                />
              )}

              {expanded && (
                <div className="flex flex-col gap-4">
                  {legs.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                      No legs yet. Add ideas to this candidate from the Bucket.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {legs.map((leg) => (
                        <PropLegCard
                          key={leg.id}
                          idea={leg}
                          liveContext={liveContextFor(leg.id)}
                          onRemove={() => handleRemoveLeg(leg.id)}
                        />
                      ))}
                    </ul>
                  )}

                  <RuleBanners correlationSignals={correlationSignals} concentrationSignals={concentrationSignals} legs={legs} />

                  <EstimatePanel
                    estimate={estimate}
                    stakeCents={candidate.stakeCents}
                    payoutCents={payoutCents}
                    isSameGame={isSameGame}
                  />

                  <PromoAndStakePanel candidate={candidate} />

                  <FinalizeSection candidateId={candidate.id} legCount={legs.length} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
