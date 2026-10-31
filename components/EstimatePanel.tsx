import type { SlipEstimate } from "@/domain/odds/estimate";
import { Card } from "@/components/Card";
import { InfoIcon } from "@/components/icons";

function formatAmerican(value: number): string {
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Why there's no estimate when legs have no price at the slip's book. A leg
 * whose market the book isn't offering may still have a capture price; it's
 * deliberately not used, so this never says the leg has no capture price.
 */
export function missingPriceMessage(estimate: SlipEstimate, slipSportsbook: string): string {
  if (estimate.ok || estimate.reason !== "missing_price") return "";
  const book = slipSportsbook.trim() || "this slip's book";
  const n = estimate.unavailableLegIds.length;
  const head = `Estimate cannot be calculated — ${n} leg${n === 1 ? " has" : "s have"} no price at ${book}.`;
  const notOffered = estimate.legSources.filter((l) => l.unavailableReason === "market_not_offered").length;
  if (notOffered === 0) return head;
  if (notOffered === n) {
    return `${head} ${book} isn't offering ${n === 1 ? "its market" : "their markets"}, so no captured price is used.`;
  }
  return `${head} For ${notOffered} of them, ${book} isn't offering the market, so no captured price is used.`;
}

export function EstimatePanel({
  estimate,
  sportsbook,
  stakeCents,
  payoutCents,
  isSameGame,
}: {
  estimate: SlipEstimate;
  /** The slip's book, as typed. */
  sportsbook: string;
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
          {missingPriceMessage(estimate, sportsbook)}
        </p>
      )}
      {!estimate.ok && estimate.reason === "deleted_legs" && (
        <p className="mt-2 text-xs font-medium" style={{ color: "var(--color-danger)" }}>
          Estimate cannot be calculated — {estimate.missingLegIds.length} leg
          {estimate.missingLegIds.length === 1 ? "'s idea was" : "s' ideas were"} deleted. Remove{" "}
          {estimate.missingLegIds.length === 1 ? "it" : "them"} to see an estimate.
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
          {(() => {
            const otherBook = estimate.legSources.filter(
              (l) => l.source === "capture" && l.captureBook?.match !== "same",
            ).length;
            return otherBook > 0
              ? ` ${otherBook} of those ${otherBook === 1 ? "was" : "were"} captured at a sportsbook that is unrecorded or not confirmed to match this slip's.`
              : "";
          })()}
        </p>
      )}
    </Card>
  );
}
