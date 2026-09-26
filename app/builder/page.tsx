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
import { Button, TextInput } from "@/components/FormControls";
import { calculateCombinedEstimate, calculatePayoutCents, hasSameGameCombination } from "@/domain/odds/estimate";
import { detectCorrelationSignals } from "@/domain/rules/correlation";
import { detectConcentrationSignals } from "@/domain/rules/concentration";
import { createCandidate, removeLegFromCandidate } from "@/domain/candidates/candidateService";
import { refreshCandidateContext } from "@/domain/odds/refreshService";
import { liveContextKey } from "@/storage/indexeddb/repositories/liveContextRepository";

function kickoffWindowFor(scheduledStart: string | null): string | null {
  if (!scheduledStart) return null;
  const date = new Date(scheduledStart);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 13); // hour-granularity bucket
}

function FirstSlipPrompt() {
  const { refreshCandidates, setActiveCandidateId } = useData();
  const [name, setName] = useState("Sunday Core");
  const [sportsbook, setSportsbook] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sportsbook.trim() || creating) return;
    setCreating(true);
    try {
      const candidate = await createCandidate(name, sportsbook);
      await refreshCandidates();
      setActiveCandidateId(candidate.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border px-4 py-10 text-center" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
        Start your first slip
      </p>
      <p className="max-w-xs text-sm" style={{ color: "var(--color-muted)" }}>
        A slip is book-specific — pick the sportsbook you&rsquo;ll actually place this on.
      </p>
      <form onSubmit={handleCreate} className="flex w-full max-w-xs flex-col gap-3">
        <label className="flex flex-col gap-1 text-left text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
          Name
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday Core" />
        </label>
        <label className="flex flex-col gap-1 text-left text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
          Sportsbook
          <TextInput value={sportsbook} onChange={(e) => setSportsbook(e.target.value)} placeholder="FanDuel" autoFocus />
        </label>
        <Button type="submit" disabled={!sportsbook.trim() || creating}>
          {creating ? "Creating…" : "Create slip"}
        </Button>
      </form>
    </div>
  );
}

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
  const [addingIdeas, setAddingIdeas] = useState(false);

  const candidate = candidates.find((c) => c.id === activeCandidateId) ?? null;
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
    <PageShell title="SLIP" icon={<BuildIcon className="h-8 w-8" />}>
      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Loading…
        </p>
      ) : !candidate ? (
        <FirstSlipPrompt />
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
                expanded={expanded}
                onToggle={() => setExpanded((v) => !v)}
              />

              {expanded && (
                <div className="flex flex-col gap-4">
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

          {addingIdeas && <AddIdeasSheet candidate={candidate} onClose={() => setAddingIdeas(false)} />}
        </div>
      )}
    </PageShell>
  );
}
