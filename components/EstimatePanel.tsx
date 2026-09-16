import type { CombinedEstimate } from "@/domain/odds/estimate";

function formatAmerican(value: number): string {
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function EstimatePanel({
  estimate,
  stakeCents,
  payoutCents,
  isSameGame,
}: {
  estimate: CombinedEstimate;
  stakeCents: number;
  payoutCents: number | null;
  isSameGame: boolean;
}) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">Estimated Parlay Odds</span>
        <span className="text-lg font-semibold">{estimate.ok ? formatAmerican(estimate.americanOdds) : "—"}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          Estimated Payout on {formatCents(stakeCents)}
        </span>
        <span className="text-sm font-medium">{estimate.ok && payoutCents !== null ? formatCents(payoutCents) : "—"}</span>
      </div>

      {isSameGame && (
        <p className="mt-2 text-xs font-medium" style={{ color: "var(--warn-foreground)" }}>
          SGP — sportsbook may reprice
        </p>
      )}

      {!estimate.ok && estimate.reason === "missing_price" && (
        <p className="mt-2 text-xs" style={{ color: "var(--danger-foreground)" }}>
          Estimate cannot be calculated — {estimate.unavailableLegIds.length} leg(s) have no capture or current
          price.
        </p>
      )}
      {!estimate.ok && estimate.reason === "no_legs" && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Add legs to see an estimate.
        </p>
      )}
      {estimate.ok && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          {estimate.legSources.filter((l) => l.source === "capture").length > 0
            ? "Some legs use capture-time price — current price unavailable for those legs."
            : "Using current prices for all legs."}
        </p>
      )}
    </div>
  );
}
