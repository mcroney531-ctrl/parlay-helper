"use client";

import Link from "next/link";
import { useData } from "@/app/DataProvider";
import { ChevronRightIcon } from "@/components/icons";
import { calculateCombinedEstimate, legPriceInputs } from "@/domain/odds/estimate";
import { liveContextKey } from "@/storage/indexeddb/repositories/liveContextRepository";

/**
 * Persistent one-tap link to the current slip, shown on Capture and Ideas
 * so the user never has to remember "Build" is where their in-progress
 * candidate lives — it's surfaced everywhere that feeds it.
 */
export function CurrentSlipTray() {
  const { activeCandidate, candidates, ideas, liveContextByKey, loading } = useData();

  if (loading) return null;

  if (!activeCandidate) {
    if (candidates.length > 0) return null; // shouldn't happen (a candidate exists but none resolved), fail quiet
    return (
      <Link
        href="/builder"
        className="flex items-center justify-between rounded-[var(--radius-control)] border px-4 py-3 text-sm font-semibold"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-action)" }}
      >
        Start your first slip
        <ChevronRightIcon className="h-4 w-4" />
      </Link>
    );
  }

  // A count of legs without any price, resolved exactly as the Slip screen does.
  // Only a count: this bar never shows odds or payout.
  const book = activeCandidate.sportsbook;
  const legs = activeCandidate.ideaIds.map((id) => ideas.find((idea) => idea.id === id)).filter((v) => v !== undefined);
  const unpriced = calculateCombinedEstimate(
    legPriceInputs(legs, book, (ideaId) => liveContextByKey[liveContextKey(ideaId, book)]),
  ).legSources.filter((leg) => leg.source === "unavailable").length;

  return (
    <Link
      href="/builder"
      className="flex items-center justify-between rounded-[var(--radius-control)] px-4 py-3 text-sm font-semibold"
      style={{ background: "var(--color-brand)", color: "#ffffff" }}
    >
      <span className="truncate">
        {activeCandidate.name} · {activeCandidate.ideaIds.length} leg{activeCandidate.ideaIds.length === 1 ? "" : "s"}
        {unpriced > 0 ? ` · ${unpriced} without a price` : ""}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        View slip
        <ChevronRightIcon className="h-4 w-4" />
      </span>
    </Link>
  );
}
