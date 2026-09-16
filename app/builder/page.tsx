"use client";

import { useMemo, useState } from "react";
import { useData } from "@/app/DataProvider";
import { CandidateSwitcher } from "@/components/CandidateSwitcher";
import { BuilderTray } from "@/components/BuilderTray";
import { LegRow } from "@/components/LegRow";
import { EstimatePanel } from "@/components/EstimatePanel";
import { RuleBanners } from "@/components/RuleBanners";
import { PromoAndStakePanel } from "@/components/PromoAndStakePanel";
import { FinalizeSection } from "@/components/FinalizeSection";
import { calculateCombinedEstimate, calculatePayoutCents, hasSameGameCombination } from "@/domain/odds/estimate";
import { detectCorrelationSignals } from "@/domain/rules/correlation";
import { detectConcentrationSignals } from "@/domain/rules/concentration";
import { removeLegFromCandidate } from "@/domain/candidates/candidateService";
import { refreshCandidateContext } from "@/domain/odds/refreshService";

function kickoffWindowFor(scheduledStart: string | null): string | null {
  if (!scheduledStart) return null;
  const date = new Date(scheduledStart);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 13); // hour-granularity bucket
}

export default function BuilderPage() {
  const { candidates, ideas, liveContextByIdeaId, loading, refreshCandidates, refreshLiveContext } = useData();
  const [activeId, setActiveId] = useState<string>("");
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const effectiveActiveId = candidates.some((c) => c.id === activeId) ? activeId : candidates[0]?.id ?? "";
  const candidate = candidates.find((c) => c.id === effectiveActiveId) ?? null;

  const legs = useMemo(() => {
    if (!candidate) return [];
    return candidate.ideaIds.map((id) => ideas.find((idea) => idea.id === id)).filter((v) => v !== undefined);
  }, [candidate, ideas]);

  const estimate = useMemo(
    () =>
      calculateCombinedEstimate(
        legs.map((leg) => ({
          ideaId: leg.id,
          eventId: leg.eventId,
          currentOddsAmerican: liveContextByIdeaId[leg.id]?.currentOddsAmerican ?? null,
          captureOddsAmerican: leg.oddsAtCaptureAmerican,
        })),
      ),
    [legs, liveContextByIdeaId],
  );

  const payoutCents =
    estimate.ok && candidate ? calculatePayoutCents(candidate.stakeCents, estimate.decimalOdds) : null;

  const isSameGame = useMemo(
    () => hasSameGameCombination(legs.map((leg) => ({ eventId: leg.eventId }))),
    [legs],
  );

  const correlationSignals = useMemo(
    () => detectCorrelationSignals(legs.map((leg) => ({ ideaId: leg.id, eventId: leg.eventId }))),
    [legs],
  );

  const concentrationSignals = useMemo(
    () =>
      detectConcentrationSignals(
        legs.map((leg) => ({
          ideaId: leg.id,
          eventId: leg.eventId,
          team: leg.team,
          kickoffWindow: kickoffWindowFor(liveContextByIdeaId[leg.id]?.scheduledStart ?? null),
        })),
      ),
    [legs, liveContextByIdeaId],
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

  if (loading) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Loading…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Build</h1>
      <CandidateSwitcher activeId={effectiveActiveId} onSelect={setActiveId} />

      {!candidate ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Create a candidate to start building a slip.
        </p>
      ) : (
        <>
          <BuilderTray
            legCount={legs.length}
            estimatedOddsAmerican={estimate.ok ? estimate.americanOdds : null}
            estimatedPayoutCents={payoutCents}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
          />

          {expanded && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {candidate.sportsbook} · one sportsbook per candidate
                </p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing || legs.length === 0}
                  className="min-h-[36px] rounded-md border px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--border)" }}
                >
                  {refreshing ? "Refreshing…" : "Refresh odds & status"}
                </button>
              </div>
              {refreshError && (
                <p role="alert" className="text-xs" style={{ color: "var(--danger-foreground)" }}>
                  {refreshError}
                </p>
              )}

              {legs.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  No legs yet. Add ideas to this candidate from the Bucket.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {legs.map((leg) => (
                    <LegRow
                      key={leg.id}
                      idea={leg}
                      liveContext={liveContextByIdeaId[leg.id]}
                      onRemove={() => handleRemoveLeg(leg.id)}
                    />
                  ))}
                </ul>
              )}

              <RuleBanners correlationSignals={correlationSignals} concentrationSignals={concentrationSignals} />

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
  );
}
