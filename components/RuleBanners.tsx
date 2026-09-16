import type { CorrelationSignal } from "@/domain/rules/correlation";
import type { ConcentrationSignal } from "@/domain/rules/concentration";

export function RuleBanners({
  correlationSignals,
  concentrationSignals,
}: {
  correlationSignals: CorrelationSignal[];
  concentrationSignals: ConcentrationSignal[];
}) {
  if (correlationSignals.length === 0 && concentrationSignals.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {correlationSignals.map((signal) => (
        <p
          key={signal.eventId}
          role="note"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ background: "var(--warn-bg)", borderColor: "var(--warn-border)", color: "var(--warn-foreground)" }}
        >
          Correlated: {signal.explanation}
        </p>
      ))}
      {concentrationSignals.map((signal, i) => (
        <p
          key={i}
          role="note"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ background: "var(--warn-bg)", borderColor: "var(--warn-border)", color: "var(--warn-foreground)" }}
        >
          Concentrated: {signal.explanation}
        </p>
      ))}
    </div>
  );
}
