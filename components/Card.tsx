import type { ReactNode } from "react";

/** Shared content card. `selected` renders the green leading rule used for the active Builder leg/candidate. */
export function Card({
  children,
  selected = false,
  className = "",
}: {
  children: ReactNode;
  selected?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border p-3 ${className}`}
      style={{
        borderColor: selected ? "var(--color-action)" : "var(--color-border)",
        borderLeftWidth: selected ? "3px" : "1px",
        background: selected ? "var(--color-selected-bg)" : "var(--color-surface)",
      }}
    >
      {children}
    </div>
  );
}
