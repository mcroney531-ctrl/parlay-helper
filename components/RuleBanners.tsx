import type { CorrelationSignal } from "@/domain/rules/correlation";
import type { ConcentrationSignal } from "@/domain/rules/concentration";
import type { CapturedIdea } from "@/domain/types";
import { StatusRow } from "@/components/StatusChip";
import { ChevronRightIcon } from "@/components/icons";

function legNames(ideaIds: string[], legs: CapturedIdea[]): string {
  return ideaIds
    .map((id) => legs.find((leg) => leg.id === id))
    .filter((leg): leg is CapturedIdea => Boolean(leg))
    .map((leg) => leg.playerName ?? leg.rawText)
    .join(", ");
}

/** Consolidates correlation (informational, blue) and concentration (caution, amber) signals for the active candidate. */
export function RuleBanners({
  correlationSignals,
  concentrationSignals,
  legs,
}: {
  correlationSignals: CorrelationSignal[];
  concentrationSignals: ConcentrationSignal[];
  legs: CapturedIdea[];
}) {
  if (correlationSignals.length === 0 && concentrationSignals.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-card)] border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
        Slip context
      </h3>
      <div className="flex flex-col gap-2">
        {correlationSignals.map((signal) => (
          <details key={signal.eventId} className="group">
            <summary className="list-none [&::-webkit-details-marker]:hidden">
              <StatusRow tone="info" action={<ChevronRightIcon className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />}>
                {signal.ideaIds.length} legs share event: {signal.eventId}
              </StatusRow>
            </summary>
            <p className="px-3 pt-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
              {legNames(signal.ideaIds, legs)}
            </p>
          </details>
        ))}
        {concentrationSignals.map((signal, i) => (
          <details key={i} className="group">
            <summary className="list-none [&::-webkit-details-marker]:hidden">
              <StatusRow tone="caution" action={<ChevronRightIcon className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />}>
                Concentrated: {signal.explanation}
              </StatusRow>
            </summary>
            <p className="px-3 pt-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
              {legNames(signal.ideaIds, legs)}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
