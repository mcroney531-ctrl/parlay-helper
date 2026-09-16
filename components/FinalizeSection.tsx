"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizeCandidate } from "@/domain/history/finalizeService";
import { useData } from "@/app/DataProvider";

export function FinalizeSection({ candidateId, legCount }: { candidateId: string; legCount: number }) {
  const router = useRouter();
  const { refreshFinalized } = useData();
  const [actualOdds, setActualOdds] = useState("");
  const [actualPayout, setActualPayout] = useState("");
  const [betId, setBetId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinalize() {
    setSaving(true);
    setError(null);
    try {
      await finalizeCandidate(candidateId, {
        actualSportsbookOddsAmerican: actualOdds.trim() ? Number(actualOdds) : null,
        actualSportsbookPayoutCents: actualPayout.trim() ? Math.round(parseFloat(actualPayout) * 100) : null,
        sportsbookBetId: betId,
        note,
      });
      await refreshFinalized();
      router.push("/history");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h3 className="text-sm font-semibold">Finalize / Mark Placed</h3>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Freezes this slip as a permanent history record. Optional: enter what the sportsbook actually showed.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
          Actual odds (American)
          <input
            value={actualOdds}
            onChange={(e) => setActualOdds(e.target.value)}
            placeholder="+4000"
            className="w-32 rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
          Actual payout ($)
          <input
            value={actualPayout}
            onChange={(e) => setActualPayout(e.target.value)}
            placeholder="82.00"
            className="w-32 rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
        Sportsbook bet ID / note
        <input
          value={betId}
          onChange={(e) => setBetId(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
        Note
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      </label>
      <button
        type="button"
        onClick={handleFinalize}
        disabled={saving || legCount === 0}
        className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
      >
        {saving ? "Finalizing…" : "Finalize / Mark Placed"}
      </button>
      {legCount === 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Add at least one leg before finalizing.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--danger-foreground)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
