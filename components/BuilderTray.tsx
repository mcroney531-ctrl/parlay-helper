"use client";

import { ChevronDownIcon } from "@/components/icons";

function formatAmerican(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function BuilderTray({
  legCount,
  estimatedOddsAmerican,
  estimatedPayoutCents,
  unpricedLegCount,
  expanded,
  onToggle,
}: {
  legCount: number;
  estimatedOddsAmerican: number | null;
  estimatedPayoutCents: number | null;
  /** Legs with neither a current nor a capture price. Any at all means there is no estimate, so the tray says why. */
  unpricedLegCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 z-30 flex justify-center px-4"
      style={{ bottom: "calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 8px)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-[var(--radius-control)] border px-4 py-3 text-left shadow-md"
        style={{
          maxWidth: "var(--content-max-width)",
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {legCount} leg{legCount === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-3 text-sm">
          {unpricedLegCount > 0 ? (
            <span className="text-xs font-medium" style={{ color: "var(--color-missing-fg)" }}>
              {unpricedLegCount} of {legCount} leg{legCount === 1 ? "" : "s"} {unpricedLegCount === 1 ? "has" : "have"} no price
            </span>
          ) : (
            <>
              <span className="font-display text-lg" style={{ color: "var(--color-brand)" }}>
                {formatAmerican(estimatedOddsAmerican)}
              </span>
              <span style={{ color: "var(--color-muted)" }}>{formatCents(estimatedPayoutCents)}</span>
            </>
          )}
          <ChevronDownIcon
            className="h-4 w-4 transition-transform"
            style={{ transform: expanded ? "rotate(180deg)" : "none", color: "var(--color-muted)" }}
          />
        </span>
      </button>
    </div>
  );
}
