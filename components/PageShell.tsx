import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

/**
 * Shared screen shell: deep-green header (title + offline chip) with a
 * rounded white content sheet that overlaps its bottom edge slightly.
 * Every top-level route (Capture/Bucket/Builder/History) renders one of
 * these so the four screens stay visually consistent.
 */
export function PageShell({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <AppHeader title={title} icon={icon} />
      <div
        className="relative -mt-5 flex-1 rounded-t-[var(--radius-sheet)] px-4 pb-8 pt-5 sm:px-6"
        style={{ background: "var(--color-surface)" }}
      >
        {children}
      </div>
    </div>
  );
}
