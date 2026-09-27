"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateParlay } from "@/domain/types";
import { cloneCandidate, deleteCandidate } from "@/domain/candidates/candidateService";
import { deletePlacedSlipConfirmText } from "@/domain/history/placedSlip";
import { useData } from "@/app/DataProvider";
import { Button } from "@/components/FormControls";

/**
 * Clone to new slip, pulled out of the click handler so it can be tested
 * without a DOM: a new draft with the placed slip's legs and settings (INV-11),
 * made the current slip and opened in the Slip screen. Returns the clone's id.
 */
export async function cloneToNewSlip(
  slipId: string,
  deps: {
    refreshCandidates: () => Promise<void>;
    setActiveCandidateId: (id: string | null) => void;
    navigate: (href: string) => void;
  },
): Promise<string> {
  const clone = await cloneCandidate(slipId);
  await deps.refreshCandidates();
  deps.setActiveCandidateId(clone.id);
  deps.navigate("/builder");
  return clone.id;
}

/**
 * What can still be done with a placed slip, from its History record. The
 * slip itself is frozen (INV-2) and never the current slip (INV-7), so this
 * is where it is reached: Clone makes a new draft with the same legs and
 * settings (INV-11) and opens it as the current slip; Delete removes the slip
 * but never the record (INV-15).
 */
export function PlacedSlipActions({ slip }: { slip: CandidateParlay }) {
  const router = useRouter();
  const { refreshCandidates, setActiveCandidateId } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClone() {
    setBusy(true);
    setError(null);
    try {
      await cloneToNewSlip(slip.id, { refreshCandidates, setActiveCandidateId, navigate: router.push });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clone this slip.");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(deletePlacedSlipConfirmText(slip.name))) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCandidate(slip.id);
      await refreshCandidates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this slip.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={handleClone} disabled={busy} className="!min-h-[36px] px-3 py-1 text-sm">
          Clone to new slip
        </Button>
        <Button variant="text" onClick={handleDelete} disabled={busy} className="text-xs" style={{ color: "var(--color-muted)" }}>
          Delete slip
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
