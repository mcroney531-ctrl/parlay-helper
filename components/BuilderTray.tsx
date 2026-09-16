"use client";

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
  expanded,
  onToggle,
}: {
  legCount: number;
  estimatedOddsAmerican: number | null;
  estimatedPayoutCents: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="sticky bottom-14 z-30 flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left shadow-sm sm:bottom-0"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <span className="text-sm font-medium">{legCount} leg{legCount === 1 ? "" : "s"}</span>
      <span className="flex items-center gap-3 text-sm">
        <span>{formatAmerican(estimatedOddsAmerican)}</span>
        <span style={{ color: "var(--muted)" }}>{formatCents(estimatedPayoutCents)}</span>
        <span aria-hidden="true">{expanded ? "▾" : "▴"}</span>
      </span>
    </button>
  );
}
