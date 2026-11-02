"use client";

import { AlertCircleIcon } from "@/components/icons";
import { Button } from "@/components/FormControls";

/**
 * A slip leg whose idea no longer exists. Nothing is known about it (no
 * player, market or price), so it says so and offers the one thing to do
 * with it. The slip can't be priced or placed until it's removed.
 */
export function DeletedLegCard({ onRemove }: { onRemove: () => void }) {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border p-3"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-missing-fg)" }}>
        <AlertCircleIcon className="h-4 w-4 shrink-0" />
        Original idea deleted
      </span>
      <Button variant="text" onClick={onRemove} aria-label="Remove deleted leg from this slip">
        Remove
      </Button>
    </li>
  );
}
