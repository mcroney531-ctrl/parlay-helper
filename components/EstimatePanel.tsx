import type { CombinedEstimate } from "@/domain/odds/estimate";
import { Card } from "@/components/Card";
import { InfoIcon } from "@/components/icons";

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
    <Card>
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Estimated Parlay Odds
          <InfoIcon className="h-3.5 w-3.5" style={{ color: "var(--color-info)" }} />
        </span>
        <span className="font-display text-3xl" style={{ color: estimate.ok ? "var(--color-action)" : "var(--color-muted)" }}>
          {estimate.ok ? formatAmerican(estimate.americanOdds) : "—"}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm" style={{ color: "var(--color-muted)" }}>
          Estimated Payout on {formatCents(stakeCents)}
        </span>
        <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {estimate.ok && payoutCents !== null ? formatCents(payoutCents) : "—"}
        </span>
      </div>

      {isSameGame && (
        <p className="mt-2 text-xs font-semibold" style={{ color: "var(--color-caution-fg)" }}>
          SGP — sportsbook may reprice
        </p>
      )}

      {!estimate.ok && estimate.reason === "missing_price" && (
        <p className="mt-2 text-xs font-medium" style={{ color: "var(--color-danger)" }}>
          Estimate cannot be calculated — {estimate.unavailableLegIds.length} leg(s) have no capture or current
          price.
        </p>
      )}
      {!estimate.ok && estimate.reason === "no_legs" && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
          Add legs to see an estimate.
        </p>
      )}
      {estimate.ok && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
          {estimate.legSources.filter((l) => l.source === "capture").length > 0
            ? "Some legs use capture-time price — current price unavailable for those legs."
            : "Using current prices for all legs."}
        </p>
      )}
    </Card>
  );
}
