"use client";

import { useState } from "react";
import { useData } from "@/app/DataProvider";
import { Button } from "@/components/FormControls";
import { NewSlipForm } from "@/components/NoCurrentSlip";
import { addLegToCandidate } from "@/domain/candidates/candidateService";
import { isPlaced } from "@/domain/candidates/candidateState";
import { addToNewSlip } from "@/components/addToNewSlip";

/**
 * Shown inside an Ideas card when Add to slip is tapped with no current
 * slip: the idea is never left waiting while the user goes to find the Slip
 * screen. Continue a draft, or start a slip (book defaulting to the last one
 * used); either way the slip becomes current and the idea is its leg. If a
 * new slip is created but the add fails, the slip still becomes current, and
 * onFailed tells the card, whose own Add then retries into that slip.
 */
export function FirstAddPrompt({
  ideaId,
  onDone,
  onFailed,
  onCancel,
}: {
  ideaId: string;
  onDone: (slipName: string) => void;
  onFailed: (message: string) => void;
  onCancel: () => void;
}) {
  const { candidates, refreshCandidates, setActiveCandidateId } = useData();
  const [error, setError] = useState<string | null>(null);
  const drafts = candidates.filter((c) => !isPlaced(c));

  async function addTo(slipId: string, slipName: string) {
    setError(null);
    try {
      await addLegToCandidate(slipId, ideaId);
      setActiveCandidateId(slipId);
      await refreshCandidates();
      onDone(slipName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this idea to the slip.");
    }
  }

  return (
    <div role="group" aria-label="Choose a slip" className="mt-2 flex flex-col gap-3 rounded-[var(--radius-control)] border p-3" style={{ borderColor: "var(--color-border)" }}>
      {drafts.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            Add to a draft
          </p>
          <div className="flex flex-wrap gap-2">
            {drafts.map((draft) => (
              <Button key={draft.id} variant="secondary" onClick={() => addTo(draft.id, draft.name)} className="!min-h-[36px] px-3 py-1 text-sm">
                {draft.name} · {draft.sportsbook}
              </Button>
            ))}
          </div>
        </div>
      )}
      <NewSlipForm
        inline
        title={drafts.length > 0 ? "Or start a new slip" : "Start a slip for this idea"}
        onCreated={async (id, name) => {
          setError(null);
          const result = await addToNewSlip({ id, name }, ideaId, { addLeg: addLegToCandidate, setActive: setActiveCandidateId, refresh: refreshCandidates });
          if (result.ok) onDone(name);
          else onFailed(result.message);
        }}
      />
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <Button variant="text" onClick={onCancel} className="self-start text-xs" style={{ color: "var(--color-muted)" }}>
        Cancel
      </Button>
    </div>
  );
}
