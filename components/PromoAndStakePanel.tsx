"use client";

import { useState } from "react";
import type { CandidateParlay } from "@/domain/types";
import { setCandidatePromo, setCandidateStake } from "@/domain/candidates/candidateService";
import { useData } from "@/app/DataProvider";
import { Card } from "@/components/Card";
import { TextInput } from "@/components/FormControls";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
      {label}
      {children}
    </label>
  );
}

export function PromoAndStakePanel({ candidate }: { candidate: CandidateParlay }) {
  const { refreshCandidates } = useData();
  const [stakeInput, setStakeInput] = useState((candidate.stakeCents / 100).toFixed(2));
  const [promoLabel, setPromoLabel] = useState(candidate.promoLabel);
  const [promoMax, setPromoMax] = useState(
    candidate.promoMaxStakeCents !== null ? (candidate.promoMaxStakeCents / 100).toFixed(2) : "",
  );

  async function commitStake() {
    const cents = Math.round(parseFloat(stakeInput || "0") * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    await setCandidateStake(candidate.id, cents);
    await refreshCandidates();
  }

  async function commitPromo() {
    const maxCents = promoMax.trim() ? Math.round(parseFloat(promoMax) * 100) : null;
    await setCandidatePromo(candidate.id, promoLabel, Number.isFinite(maxCents as number) ? maxCents : null);
    await refreshCandidates();
  }

  return (
    <Card>
      <div className="flex flex-wrap gap-3">
        <Field label="Stake">
          <TextInput
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={stakeInput}
            onChange={(e) => setStakeInput(e.target.value)}
            onBlur={commitStake}
            className="w-28"
          />
        </Field>
        <Field label="Promo note">
          <TextInput
            value={promoLabel}
            onChange={(e) => setPromoLabel(e.target.value)}
            onBlur={commitPromo}
            placeholder="Same Game Parlay Boost"
          />
        </Field>
        <Field label="Max stake">
          <TextInput
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={promoMax}
            onChange={(e) => setPromoMax(e.target.value)}
            onBlur={commitPromo}
            className="w-28"
          />
        </Field>
      </div>
    </Card>
  );
}
