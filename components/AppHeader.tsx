import type { ReactNode } from "react";
import { OfflineChip } from "@/components/OfflineChip";

export function AppHeader({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <header
      className="route-texture relative overflow-hidden px-4 pb-9 pt-6 sm:rounded-t-[var(--radius-sheet)]"
      style={{ background: "var(--color-shell-deep)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display flex items-center gap-2 text-[2.5rem] leading-none text-white sm:text-[2.75rem]">
          <span aria-hidden="true" className="text-white/90">
            {icon}
          </span>
          {title}
        </h1>
        <OfflineChip />
      </div>
    </header>
  );
}
