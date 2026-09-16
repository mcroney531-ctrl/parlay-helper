"use client";

import { useData } from "@/app/DataProvider";

function formatAmerican(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function HistoryPage() {
  const { finalized, loading } = useData();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">History</h1>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading…
        </p>
      ) : finalized.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Nothing finalized yet. Finalized slips are permanent, read-only records.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {finalized.map((parlay) => (
            <li key={parlay.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">{parlay.candidateName}</h2>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {new Date(parlay.finalizedAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {parlay.sportsbook} · {parlay.legSnapshots.length} legs · stake {formatCents(parlay.stakeCents)}
              </p>

              <ul className="mt-2 flex flex-col gap-1">
                {parlay.legSnapshots.map((leg) => (
                  <li key={leg.ideaId} className="text-sm">
                    {[leg.playerName, leg.team, leg.marketLabel, leg.selection, leg.lineAtFinalize ?? leg.lineAtCapture]
                      .filter((v) => v !== null && v !== undefined && v !== "")
                      .join(" · ")}
                  </li>
                ))}
              </ul>

              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <span>
                  Est. odds: <strong>{formatAmerican(parlay.estimatedOddsAmerican)}</strong>
                </span>
                <span>
                  Est. payout: <strong>{formatCents(parlay.estimatedPayoutCents)}</strong>
                </span>
                {parlay.actualSportsbookOddsAmerican !== null && (
                  <span>
                    Actual odds: <strong>{formatAmerican(parlay.actualSportsbookOddsAmerican)}</strong>
                  </span>
                )}
                {parlay.actualSportsbookPayoutCents !== null && (
                  <span>
                    Actual payout: <strong>{formatCents(parlay.actualSportsbookPayoutCents)}</strong>
                  </span>
                )}
              </div>

              {parlay.promoLabel && (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  Promo: {parlay.promoLabel}
                  {parlay.promoMaxStakeCents !== null ? ` (max ${formatCents(parlay.promoMaxStakeCents)})` : ""}
                </p>
              )}
              {(parlay.sportsbookBetId || parlay.note) && (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  {parlay.sportsbookBetId && `Bet ID: ${parlay.sportsbookBetId}`}
                  {parlay.sportsbookBetId && parlay.note ? " · " : ""}
                  {parlay.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
