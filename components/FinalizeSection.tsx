"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizeCandidate } from "@/domain/history/finalizeService";
import { useData } from "@/app/DataProvider";
import { Card } from "@/components/Card";
import { Button, TextArea, TextInput } from "@/components/FormControls";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
      {label}
      {children}
    </label>
  );
}

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
    <Card className="flex flex-col gap-3">
      <details>
        <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
          Optional: add sportsbook confirmation (actual odds, payout, bet ID, note)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            Recorded alongside the estimate at finalize time — never edited afterward.
          </p>
          <div className="flex flex-wrap gap-3">
            <Field label="Actual odds (American)">
              <TextInput value={actualOdds} onChange={(e) => setActualOdds(e.target.value)} placeholder="+4000" className="w-32" />
            </Field>
            <Field label="Actual payout ($)">
              <TextInput value={actualPayout} onChange={(e) => setActualPayout(e.target.value)} placeholder="82.00" className="w-32" />
            </Field>
          </div>
          <Field label="Sportsbook bet ID / note">
            <TextInput value={betId} onChange={(e) => setBetId(e.target.value)} />
          </Field>
          <Field label="Note">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
        </div>
      </details>

      <Button onClick={handleFinalize} disabled={saving || legCount === 0} className="w-full">
        {saving ? "Finalizing…" : "Finalize / Mark Placed"}
      </Button>
      {legCount === 0 && (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Add at least one leg before finalizing.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </Card>
  );
}
