"use client";

import { useMemo, useState } from "react";
import { useData } from "@/app/DataProvider";
import { PageShell } from "@/components/PageShell";
import { HistoryIcon } from "@/components/icons";
import { Select, TextInput } from "@/components/FormControls";
import { Card } from "@/components/Card";
import { Pill } from "@/components/StatusChip";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SearchIcon } from "@/components/icons";
import type { FinalizedParlay } from "@/domain/types";

function formatAmerican(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

const PREVIEW_LEG_COUNT = 3;

function FinalizedCard({ parlay, expanded, onToggle }: { parlay: FinalizedParlay; expanded: boolean; onToggle: () => void }) {
  const shownLegs = expanded ? parlay.legSnapshots : parlay.legSnapshots.slice(0, PREVIEW_LEG_COUNT);
  const remaining = parlay.legSnapshots.length - shownLegs.length;
  const hasActual = parlay.actualSportsbookOddsAmerican !== null || parlay.actualSportsbookPayoutCents !== null;

  return (
    <Card selected={expanded} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2">
          <h2 className="text-base font-bold" style={{ color: "var(--color-ink)" }}>
            {parlay.candidateName}
          </h2>
          <Pill tone="success">Placed</Pill>
        </span>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {new Date(parlay.finalizedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
          {new Date(parlay.finalizedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
        {parlay.sportsbook} · {parlay.legSnapshots.length} legs · stake {formatCents(parlay.stakeCents)}
      </p>

      <ul className="mt-1 flex flex-col gap-1.5">
        {shownLegs.map((leg) => (
          <li key={leg.ideaId} className="flex items-center gap-2 text-sm" style={{ color: "var(--color-ink)" }}>
            <PlayerAvatar name={leg.playerName} team={leg.team} size="compact" />
            {[leg.playerName, leg.marketLabel, leg.selection, leg.lineAtFinalize ?? leg.lineAtCapture]
              .filter((v) => v !== null && v !== undefined && v !== "")
              .join(" · ")}
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button type="button" onClick={onToggle} className="self-start text-xs font-semibold" style={{ color: "var(--color-action)" }}>
          +{remaining} more legs
        </button>
      )}

      {expanded && hasActual ? (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="rounded-[var(--radius-control)] border p-2" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Estimated
            </p>
            <p className="font-display text-2xl" style={{ color: "var(--color-ink)" }}>
              {formatAmerican(parlay.estimatedOddsAmerican)}
            </p>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              {formatCents(parlay.estimatedPayoutCents)} payout
            </p>
          </div>
          <div className="rounded-[var(--radius-control)] border p-2" style={{ borderColor: "var(--color-action)", background: "var(--color-selected-bg)" }}>
            <p className="text-xs" style={{ color: "var(--color-brand)" }}>
              Actual
            </p>
            <p className="font-display text-2xl" style={{ color: "var(--color-brand)" }}>
              {formatAmerican(parlay.actualSportsbookOddsAmerican)}
            </p>
            <p className="text-xs" style={{ color: "var(--color-brand)" }}>
              {formatCents(parlay.actualSportsbookPayoutCents)} payout
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm">
          Est. <strong style={{ color: "var(--color-ink)" }}>{formatAmerican(parlay.estimatedOddsAmerican)}</strong> ·{" "}
          {formatCents(parlay.estimatedPayoutCents)}
        </p>
      )}

      {parlay.promoLabel && (
        <p className="text-xs" style={{ color: "var(--color-info)", background: "var(--color-info-bg)", borderRadius: "var(--radius-control)", padding: "6px 10px" }}>
          {parlay.promoLabel}
          {parlay.promoMaxStakeCents !== null ? ` · max ${formatCents(parlay.promoMaxStakeCents)}` : ""}
        </p>
      )}
      {(parlay.sportsbookBetId || parlay.note) && (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          {parlay.sportsbookBetId && `Bet ID: ${parlay.sportsbookBetId}`}
          {parlay.sportsbookBetId && parlay.note ? " · " : ""}
          {parlay.note}
        </p>
      )}
      {remaining === 0 && parlay.legSnapshots.length > PREVIEW_LEG_COUNT && (
        <button type="button" onClick={onToggle} className="self-start text-xs font-semibold" style={{ color: "var(--color-action)" }}>
          Show fewer legs
        </button>
      )}
    </Card>
  );
}

export default function HistoryPage() {
  const { finalized, loading } = useData();
  const [search, setSearch] = useState("");
  const [sportsbookFilter, setSportsbookFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sportsbooks = useMemo(() => Array.from(new Set(finalized.map((p) => p.sportsbook))).sort(), [finalized]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return finalized.filter((parlay) => {
      if (sportsbookFilter !== "all" && parlay.sportsbook !== sportsbookFilter) return false;
      if (query) {
        const haystack = [
          parlay.candidateName,
          parlay.sportsbookBetId,
          ...parlay.legSnapshots.map((leg) => leg.playerName ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [finalized, search, sportsbookFilter]);

  const effectiveExpandedId = expandedId ?? filtered[0]?.id ?? null;

  return (
    <PageShell title="HISTORY" icon={<HistoryIcon className="h-8 w-8" />}>
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {finalized.length} finalized slip{finalized.length === 1 ? "" : "s"}
          </p>
          <Select
            value={sportsbookFilter}
            onChange={(e) => setSportsbookFilter(e.target.value)}
            aria-label="Filter by sportsbook"
            className="w-auto"
          >
            <option value="all">All sportsbooks</option>
            {sportsbooks.map((book) => (
              <option key={book} value={book}>
                {book}
              </option>
            ))}
          </Select>
        </div>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-muted)" }} />
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate, player, bet ID"
            aria-label="Search finalized slips"
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Loading…
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {finalized.length === 0
              ? "Nothing finalized yet. Finalized slips are permanent, read-only records."
              : "No finalized slips match these filters."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((parlay) => (
              <li key={parlay.id}>
                <FinalizedCard
                  parlay={parlay}
                  expanded={effectiveExpandedId === parlay.id}
                  onToggle={() => setExpandedId(effectiveExpandedId === parlay.id ? "" : parlay.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
