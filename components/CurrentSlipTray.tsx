"use client";

import Link from "next/link";
import { useData } from "@/app/DataProvider";
import { isPlaced } from "@/domain/candidates/candidateState";
import { ChevronRightIcon } from "@/components/icons";

/**
 * Persistent one-tap link to the current slip, shown on Capture and Ideas
 * so the user never has to remember "Build" is where their in-progress
 * candidate lives — it's surfaced everywhere that feeds it.
 */
export function CurrentSlipTray() {
  const { activeCandidate, candidates, finalized, lastSlipPlaced, loading } = useData();

  if (loading) return null;

  if (!activeCandidate) {
    // No current slip: right after a placement, when every slip is placed, or
    // before the first one. The Slip screen asks which slip is next.
    const hasDraft = candidates.some((c) => !isPlaced(c));
    const label = hasDraft
      ? lastSlipPlaced
        ? "Slip placed · pick your next slip"
        : "Pick a slip"
      : candidates.length === 0 && finalized.length === 0
        ? "Start your first slip"
        : "Start a new slip";
    return (
      <Link
        href="/builder"
        className="flex items-center justify-between rounded-[var(--radius-control)] border px-4 py-3 text-sm font-semibold"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-action)" }}
      >
        {label}
        <ChevronRightIcon className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <Link
      href="/builder"
      className="flex items-center justify-between rounded-[var(--radius-control)] px-4 py-3 text-sm font-semibold"
      style={{ background: "var(--color-brand)", color: "#ffffff" }}
    >
      <span className="truncate">
        {activeCandidate.name} · {activeCandidate.ideaIds.length} leg{activeCandidate.ideaIds.length === 1 ? "" : "s"}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        View slip
        <ChevronRightIcon className="h-4 w-4" />
      </span>
    </Link>
  );
}
