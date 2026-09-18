"use client";

import Link from "next/link";
import { useData } from "@/app/DataProvider";
import { ChevronRightIcon } from "@/components/icons";

/**
 * Persistent one-tap link to the current slip, shown on Capture and Ideas
 * so the user never has to remember "Build" is where their in-progress
 * candidate lives — it's surfaced everywhere that feeds it.
 */
export function CurrentSlipTray() {
  const { activeCandidate, candidates, loading } = useData();

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
