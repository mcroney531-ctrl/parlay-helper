"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizeCandidate } from "@/domain/history/finalizeService";
import {
  AlreadyPlacedError,
  CandidateNotFoundError,
  DeletedLegsError,
  StaleCandidateError,
  UnpricedConsentError,
} from "@/domain/candidates/errors";
import { NO_CURRENT_SLIP } from "@/domain/candidates/activeCandidate";
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

/**
 * What happens once a placement has committed, pulled out of the click
 * handler so it can be tested without a DOM. The placed slip is no longer
 * current whatever the pointer says (INV-7); storing NO_CURRENT_SLIP (rather
 * than clearing it) makes the Slip screen ask what's next instead of silently
 * switching to some other draft. Then the new state is loaded and History,
 * where the placed slip now lives, is opened.
 */
export async function completePlacement(deps: {
  setActiveCandidateId: (id: string | null) => void;
  refreshCandidates: () => Promise<void>;
  refreshFinalized: () => Promise<void>;
  navigate: (href: string) => void;
}): Promise<void> {
  deps.setActiveCandidateId(NO_CURRENT_SLIP);
  await Promise.all([deps.refreshCandidates(), deps.refreshFinalized()]);
  deps.navigate("/history");
}

/**
 * The confirm step's question. With unpriced legs it says so first, because
 * confirming it is the user's consent to place them without a price (INV-17).
 */
export function markPlacedQuestion(
  slipName: string,
  unpricedCount: number,
  legCount: number,
): { warning: string | null; question: string } {
  if (unpricedCount > 0 && unpricedCount === legCount) {
    return { warning: null, question: "No current prices are available for this slip. Mark it placed anyway?" };
  }
  return {
    warning:
      unpricedCount > 0
        ? `${unpricedCount} of ${legCount} legs ${unpricedCount === 1 ? "has" : "have"} no current price.`
        : null,
    question: `Mark “${slipName}” as placed?`,
  };
}

/**
 * The confirm step before a slip is placed (INV-1: placing is permanent, so a
 * mis-tap is caught here rather than undone later). Pure, so it can be
 * rendered on its own in tests.
 */
export function MarkPlacedConfirm({
  slipName,
  unpricedCount = 0,
  legCount = 0,
  saving,
  onConfirm,
  onCancel,
}: {
  slipName: string;
  /** Legs shown as having no current price; what confirming consents to. */
  unpricedCount?: number;
  legCount?: number;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { warning, question } = markPlacedQuestion(slipName, unpricedCount, legCount);
  return (
    <div role="group" aria-label="Confirm Mark Placed" className="flex flex-col gap-2 rounded-[var(--radius-control)] border p-3" style={{ borderColor: "var(--color-border)" }}>
      {warning && (
        <p className="text-sm font-medium" style={{ color: "var(--color-missing-fg)" }}>
          {warning}
        </p>
      )}
      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
        {question}
      </p>
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
        It moves to History as a permanent record and can&rsquo;t be edited or placed again. To bet it again, clone it
        from History.
      </p>
      <div className="flex gap-2">
        <Button onClick={onConfirm} disabled={saving} className="flex-1">
          {saving ? "Placing…" : "Yes, mark placed"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function FinalizeSection({
  candidateId,
  slipName,
  seenRevision,
  legCount,
  unpricedLegIds,
}: {
  candidateId: string;
  slipName: string;
  /** The revision of the candidate as rendered: placement is rejected if it changed since (INV-6). */
  seenRevision: number;
  legCount: number;
  /** Legs the Slip screen's estimate has no price for, from the same resolver placement uses (INV-12). */
  unpricedLegIds: string[];
}) {
  const router = useRouter();
  const { refreshCandidates, refreshFinalized, refreshIdeas, refreshLiveContext, setActiveCandidateId } = useData();
  // Frozen when the confirm is shown: what the user is warned about is all
  // they consent to (INV-17). A leg losing its price while the confirm is open
  // isn't added here; placement rejects it and the confirm is shown again.
  const [acknowledgedUnpriced, setAcknowledgedUnpriced] = useState<string[]>([]);
  const [actualOdds, setActualOdds] = useState("");
  const [actualPayout, setActualPayout] = useState("");
  const [betId, setBetId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinalize() {
    setSaving(true);
    setError(null);
    try {
      await finalizeCandidate(candidateId, seenRevision, {
        actualSportsbookOddsAmerican: actualOdds.trim() ? Number(actualOdds) : null,
        actualSportsbookPayoutCents: actualPayout.trim() ? Math.round(parseFloat(actualPayout) * 100) : null,
        sportsbookBetId: betId,
        note,
        acknowledgedUnpricedLegIds: acknowledgedUnpriced,
      });
      await completePlacement({ setActiveCandidateId, refreshCandidates, refreshFinalized, navigate: router.push });
    } catch (err) {
      // The slip on screen is out of date: reload it so what's shown matches
      // what's stored before the user tries again.
      if (err instanceof AlreadyPlacedError || err instanceof StaleCandidateError || err instanceof CandidateNotFoundError) {
        await Promise.all([refreshCandidates(), refreshFinalized()]);
      }
      // The prices changed under the confirm: reload everything the estimate
      // is built from, so the next confirm warns about the current set.
      if (err instanceof UnpricedConsentError || err instanceof DeletedLegsError) {
        await Promise.all([refreshCandidates(), refreshIdeas(), refreshLiveContext()]);
      }
      setError(err instanceof Error ? err.message : "Could not finalize.");
      setConfirming(false);
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

      {confirming ? (
        <MarkPlacedConfirm
          slipName={slipName}
          unpricedCount={acknowledgedUnpriced.length}
          legCount={legCount}
          saving={saving}
          onConfirm={handleFinalize}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <Button
          onClick={() => {
            setAcknowledgedUnpriced(unpricedLegIds);
            setConfirming(true);
          }}
          disabled={legCount === 0}
          className="w-full"
        >
          Mark Placed
        </Button>
      )}
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
